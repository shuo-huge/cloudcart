import { env, SELF } from "cloudflare:test";
import { computeStripeSignature, verifyStripeSignature } from "@cloudcart/plugin-stripe";
import { createOrderAccessToken } from "@cloudcart/core";
import { Database } from "@cloudcart/database";
import { describe, expect, it } from "vitest";

const BASE = "https://example.com";
const OWNER = { email: "owner@example.com", password: "Sup3rSecret!", name: "Owner", storeName: "Payments Store", currency: "USD" };
const jar = new Map<string, string>();

function cookieHeader(): string {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function captureCookies(response: Response): void {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0] ?? "";
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index);
    const value = decodeURIComponent(pair.slice(index + 1));
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (jar.size > 0 && !headers.has("Cookie")) headers.set("Cookie", cookieHeader());
  const response = await SELF.fetch(BASE + path, { ...init, headers, redirect: init.redirect ?? "manual" });
  captureCookies(response);
  return response;
}

async function json(path: string, method: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return request(path, { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function csrf(): Record<string, string> {
  return { "X-CSRF-Token": jar.get("cc_csrf") ?? "" };
}

async function ensureSession(): Promise<void> {
  const status = (await (await request("/api/setup/status")).json()) as { installed: boolean };
  if (!status.installed) {
    const res = await json("/api/admin/setup", "POST", { setupToken: "test-setup-token-123456", ...OWNER });
    expect(res.status).toBe(200);
    return;
  }
  const res = await json("/api/admin/login", "POST", { email: OWNER.email, password: OWNER.password });
  expect(res.status).toBe(200);
}

async function createProduct(name: string, slug: string, price = "25.00"): Promise<string> {
  const res = await json("/api/admin/products", "POST", {
    name,
    slug,
    description: `${name} description`,
    status: "active",
    type: "simple",
    price,
    stock: 20,
    manageStock: true,
    featured: false,
    categoryIds: [],
    tags: [],
    variants: [],
  }, csrf());
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

async function enable(pluginId: string): Promise<void> {
  const res = await json(`/api/admin/plugins/${pluginId}/enable`, "POST", {}, csrf());
  expect(res.status).toBe(200);
}

async function configure(pluginId: string, settings: Record<string, string>, secretKeys: string[]): Promise<void> {
  const res = await json(`/api/admin/plugins/${pluginId}/settings`, "PUT", { settings, secretKeys }, csrf());
  expect(res.status).toBe(200);
}

async function addToCart(productId: string, quantity: number): Promise<void> {
  const res = await json("/api/cart/items", "POST", { productId, quantity });
  expect(res.status).toBe(200);
}

async function checkout(paymentMethod: string, email: string): Promise<Response> {
  const form = new URLSearchParams({
    email,
    name: "Pay Buyer",
    line1: "10 Market Street",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "US",
    paymentMethod,
  });
  return request("/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

interface MockRoute {
  match: (url: string) => boolean;
  reply: () => Response;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Replaces the isolate's outbound fetch; the Worker shares this isolate. */
function mockFetch(routes: MockRoute[]): { calls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const route = routes.find((candidate) => candidate.match(url));
    if (!route) throw new Error(`Unexpected outbound request: ${url}`);
    return route.reply();
  }) as typeof fetch;
  return {
    calls,
    restore: () => { globalThis.fetch = original; },
  };
}

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

async function latestOrder(): Promise<{ id: string; status: string; payment_status: string; total_cents: number; currency: string; paid_at: string | null } | null> {
  return database().first(
    "SELECT id, status, payment_status, total_cents, currency, paid_at FROM orders ORDER BY created_at DESC LIMIT 1",
  );
}

async function stripeWebhook(payload: string, signature: string): Promise<Response> {
  return request("/webhooks/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signature },
    body: payload,
  });
}

describe("Stripe payment plugin", () => {
  it("verifies signatures with a timestamp tolerance", async () => {
    const payload = JSON.stringify({ hello: "world" });
    const now = Math.floor(Date.now() / 1000);
    const signature = await computeStripeSignature("whsec_test", payload, now);
    expect(await verifyStripeSignature(payload, `t=${now},v1=${signature}`, "whsec_test")).toBe(true);
    expect(await verifyStripeSignature(payload, `t=${now},v1=${signature}`, "whsec_wrong")).toBe(false);
    expect(await verifyStripeSignature(payload, `t=${now - 1000},v1=${signature}`, "whsec_test")).toBe(false);
    expect(await verifyStripeSignature(payload, "v1=deadbeef", "whsec_test")).toBe(false);
  });

  it("creates a hosted Checkout session and processes signed events idempotently", async () => {
    await ensureSession();
    const productId = await createProduct("Stripe Tee", "stripe-tee");
    await enable("stripe");
    await configure("stripe", {
      mode: "sandbox",
      publishableKey: "pk_test_example",
      secretKey: "sk_test_example",
      webhookSecret: "whsec_test_example",
    }, ["secretKey", "webhookSecret"]);

    const mock = mockFetch([{
      match: (url) => url === "https://api.stripe.com/v1/checkout/sessions",
      reply: () => jsonResponse({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }),
    }]);
    try {
      await addToCart(productId, 2);
      const response = await checkout("stripe", "stripe-buyer@example.com");
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
      expect(mock.calls).toContain("https://api.stripe.com/v1/checkout/sessions");
    } finally {
      mock.restore();
    }

    const order = await latestOrder();
    expect(order?.status).toBe("pending_payment");
    expect(order?.payment_status).toBe("unpaid");
    const transaction = await database().first<{ status: string; provider_id: string }>(
      "SELECT status, provider_id FROM payment_transactions WHERE order_id = ? AND plugin_id = 'stripe'",
      [order!.id],
    );
    expect(transaction?.status).toBe("pending");
    expect(transaction?.provider_id).toBe("cs_test_123");

    const payload = JSON.stringify({
      id: "evt_stripe_paid_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          client_reference_id: order!.id,
          amount_total: 5000,
          currency: "usd",
          payment_status: "paid",
          payment_intent: "pi_test_123",
          metadata: { order_id: order!.id },
        },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await computeStripeSignature("whsec_test_example", payload, timestamp);
    const webhook = await stripeWebhook(payload, `t=${timestamp},v1=${signature}`);
    expect(webhook.status).toBe(200);
    expect(((await webhook.json()) as { result: string }).result).toBe("processed");

    const paid = await database().first<{ status: string; payment_status: string; paid_at: string }>(
      "SELECT status, payment_status, paid_at FROM orders WHERE id = ?",
      [order!.id],
    );
    expect(paid?.status).toBe("paid");
    expect(paid?.payment_status).toBe("paid");
    expect(paid?.paid_at).toBeTruthy();

    const duplicate = await stripeWebhook(payload, `t=${timestamp},v1=${signature}`);
    expect(duplicate.status).toBe(200);
    expect(((await duplicate.json()) as { result: string }).result).toBe("duplicate");
    const eventCount = await database().first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM payment_events WHERE plugin_id = 'stripe' AND event_id = 'evt_stripe_paid_1'",
    );
    expect(eventCount?.count).toBe(1);
    const transactions = await database().first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM payment_transactions WHERE order_id = ? AND status = 'succeeded'",
      [order!.id],
    );
    expect(transactions?.count).toBe(1);

    const invalid = await stripeWebhook(payload, `t=${timestamp},v1=deadbeef`);
    expect(invalid.status).toBe(400);
  });

  it("never marks an order paid when the provider amount does not match", async () => {
    await ensureSession();
    const productId = await createProduct("Mismatch Tee", "mismatch-tee");
    await enable("stripe");
    await configure("stripe", {
      mode: "sandbox",
      publishableKey: "pk_test_example",
      secretKey: "sk_test_example",
      webhookSecret: "whsec_test_example",
    }, ["secretKey", "webhookSecret"]);

    const mock = mockFetch([{
      match: (url) => url === "https://api.stripe.com/v1/checkout/sessions",
      reply: () => jsonResponse({ id: "cs_test_mismatch", url: "https://checkout.stripe.com/c/pay/cs_test_mismatch" }),
    }]);
    try {
      await addToCart(productId, 1);
      const response = await checkout("stripe", "mismatch-buyer@example.com");
      expect(response.status).toBe(303);
    } finally {
      mock.restore();
    }
    const order = await latestOrder();
    const payload = JSON.stringify({
      id: "evt_stripe_mismatch",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_mismatch",
          client_reference_id: order!.id,
          amount_total: 1,
          currency: "usd",
          payment_status: "paid",
          payment_intent: "pi_test_mismatch",
          metadata: { order_id: order!.id },
        },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await computeStripeSignature("whsec_test_example", payload, timestamp);
    const webhook = await stripeWebhook(payload, `t=${timestamp},v1=${signature}`);
    expect(webhook.status).toBe(200);
    expect(((await webhook.json()) as { result: string }).result).toBe("mismatch");
    const after = await database().first<{ payment_status: string }>(
      "SELECT payment_status FROM orders WHERE id = ?",
      [order!.id],
    );
    expect(after?.payment_status).toBe("unpaid");
  });
});

describe("PayPal payment plugin", () => {
  it("creates an order, captures on return and marks the internal order paid", async () => {
    await ensureSession();
    const productId = await createProduct("PayPal Scarf", "paypal-scarf");
    await enable("paypal");
    await configure("paypal", {
      mode: "sandbox",
      clientId: "paypal_client_id",
      clientSecret: "paypal_client_secret",
      webhookId: "WH-TEST-123",
    }, ["clientSecret"]);

    const mock = mockFetch([
      { match: (url) => url.endsWith("/v1/oauth2/token"), reply: () => jsonResponse({ access_token: "A21AA_test_token", expires_in: 3600 }) },
      {
        match: (url) => url.endsWith("/v2/checkout/orders"),
        reply: () => jsonResponse({
          id: "PAYPAL_ORDER_1",
          status: "CREATED",
          links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_1" }],
        }),
      },
    ]);
    try {
      await addToCart(productId, 1);
      const response = await checkout("paypal", "paypal-buyer@example.com");
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toContain("PAYPAL_ORDER_1");
    } finally {
      mock.restore();
    }

    const order = await latestOrder();
    expect(order?.status).toBe("pending_payment");
    const transaction = await database().first<{ provider_id: string; status: string }>(
      "SELECT provider_id, status FROM payment_transactions WHERE order_id = ? AND plugin_id = 'paypal'",
      [order!.id],
    );
    expect(transaction?.provider_id).toBe("PAYPAL_ORDER_1");
    expect(transaction?.status).toBe("pending");

    const masterKey = (env as unknown as { APP_MASTER_KEY: string }).APP_MASTER_KEY;
    const access = await createOrderAccessToken(masterKey, order!.id);

    const captureMock = mockFetch([
      { match: (url) => url.endsWith("/v1/oauth2/token"), reply: () => jsonResponse({ access_token: "A21AA_test_token", expires_in: 3600 }) },
      {
        match: (url) => url.endsWith("/v2/checkout/orders/PAYPAL_ORDER_1/capture"),
        reply: () => jsonResponse({
          id: "PAYPAL_ORDER_1",
          status: "COMPLETED",
          purchase_units: [{
            payments: {
              captures: [{
                id: "CAPTURE_1",
                status: "COMPLETED",
                amount: { value: "25.00", currency_code: "USD" },
              }],
            },
          }],
        }),
      },
    ]);
    try {
      const returned = await request(`/api/payments/paypal/return?access=${encodeURIComponent(access)}&token=PAYPAL_ORDER_1&PayerID=PAYER1`);
      expect(returned.status).toBe(302);
      expect(returned.headers.get("location")).toContain("payment=success");
    } finally {
      captureMock.restore();
    }

    const paid = await database().first<{ status: string; payment_status: string }>(
      "SELECT status, payment_status FROM orders WHERE id = ?",
      [order!.id],
    );
    expect(paid?.status).toBe("paid");
    expect(paid?.payment_status).toBe("paid");
  });

  it("verifies PayPal webhook signatures before applying events", async () => {
    await ensureSession();
    const payload = JSON.stringify({
      id: "WH-EVENT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE_WEBHOOK",
        amount: { value: "25.00", currency_code: "USD" },
        supplementary_data: { related_ids: { order_id: "PAYPAL_ORDER_1" } },
      },
    });
    const mock = mockFetch([
      { match: (url) => url.endsWith("/v1/oauth2/token"), reply: () => jsonResponse({ access_token: "A21AA_webhook_token", expires_in: 3600 }) },
      { match: (url) => url.endsWith("/v1/notifications/verify-webhook-signature"), reply: () => jsonResponse({ verification_status: "SUCCESS" }) },
    ]);
    try {
      const response = await request("/webhooks/paypal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paypal-transmission-id": "transmission-1",
          "paypal-transmission-sig": "signature",
          "paypal-transmission-time": new Date().toISOString(),
          "paypal-cert-url": "https://api.paypal.com/cert",
          "paypal-auth-algo": "SHA256withRSA",
        },
        body: payload,
      });
      expect(response.status).toBe(200);
      expect(mock.calls.some((url) => url.endsWith("/v1/notifications/verify-webhook-signature"))).toBe(true);
    } finally {
      mock.restore();
    }
  });
});
