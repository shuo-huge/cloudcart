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

async function stockFor(slug: string): Promise<number> {
  const row = await database().first<{ stock: number }>("SELECT stock FROM products WHERE slug = ?", [slug]);
  return row?.stock ?? -1;
}

async function createStripeOrder(input: {
  name: string;
  slug: string;
  quantity: number;
  email: string;
  sessionId: string;
  price?: string;
}): Promise<{ id: string; totalCents: number }> {
  const productId = await createProduct(input.name, input.slug, input.price ?? "25.00");
  await enable("stripe");
  await configure("stripe", {
    mode: "sandbox",
    publishableKey: "pk_test_example",
    secretKey: "sk_test_example",
    webhookSecret: "whsec_test_example",
  }, ["secretKey", "webhookSecret"]);
  const mock = mockFetch([{
    match: (url) => url === "https://api.stripe.com/v1/checkout/sessions",
    reply: () => jsonResponse({ id: input.sessionId, url: `https://checkout.stripe.com/c/pay/${input.sessionId}` }),
  }]);
  try {
    await addToCart(productId, input.quantity);
    const response = await checkout("stripe", input.email);
    expect(response.status).toBe(303);
  } finally {
    mock.restore();
  }
  const order = await latestOrder();
  expect(order).toBeTruthy();
  return { id: order!.id, totalCents: order!.total_cents };
}

async function stripeSignedEvent(payload: unknown): Promise<Response> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await computeStripeSignature("whsec_test_example", body, timestamp);
  return stripeWebhook(body, `t=${timestamp},v1=${signature}`);
}

async function payStripeOrder(orderId: string, sessionId: string, paymentIntent: string, amountCents: number, eventId: string): Promise<string> {
  const response = await stripeSignedEvent({
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        client_reference_id: orderId,
        amount_total: amountCents,
        currency: "usd",
        payment_status: "paid",
        payment_intent: paymentIntent,
        metadata: { order_id: orderId },
      },
    },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: string }).result;
}

async function stripeRefund(
  orderId: string,
  eventId: string,
  amountRefunded: number,
  refundId: string,
  paymentIntent: string,
  includeMetadata = true,
): Promise<{ status: number; result: string }> {
  const response = await stripeSignedEvent({
    id: eventId,
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_${eventId}`,
        amount_refunded: amountRefunded,
        currency: "usd",
        payment_intent: paymentIntent,
        ...(includeMetadata ? { metadata: { order_id: orderId } } : {}),
        refunds: { data: [{ id: refundId, created: Date.now() }] },
      },
    },
  });
  return { status: response.status, result: ((await response.json()) as { result: string }).result };
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

  it("applies partial and cumulative refunds exactly once", async () => {
    await ensureSession();
    const suffix = Date.now();
    const sessionId = `cs_refund_${suffix}`;
    const paymentIntent = `pi_refund_${suffix}`;
    const order = await createStripeOrder({
      name: "Refund Tee",
      slug: `refund-tee-${suffix}`,
      quantity: 2,
      email: `refund-${suffix}@example.com`,
      sessionId,
    });
    expect(order.totalCents).toBe(5000);
    expect(await payStripeOrder(order.id, sessionId, paymentIntent, 5000, `evt_paid_refund_${suffix}`)).toBe("processed");

    // Stripe charge events may omit the Checkout Session metadata; resolve the
    // order from the PaymentIntent stored on the original transaction.
    const first = await stripeRefund(
      order.id,
      `evt_refund_1_${suffix}`,
      3000,
      `re_1_${suffix}`,
      paymentIntent,
      false,
    );
    expect(first).toEqual({ status: 200, result: "processed" });
    let row = await database().first<{ status: string; payment_status: string; refunded_cents: number }>(
      "SELECT status, payment_status, refunded_cents FROM orders WHERE id = ?",
      [order.id],
    );
    expect(row).toEqual({ status: "partially_refunded", payment_status: "partially_refunded", refunded_cents: 3000 });

    const second = await stripeRefund(
      order.id,
      `evt_refund_2_${suffix}`,
      5000,
      `re_2_${suffix}`,
      paymentIntent,
    );
    expect(second).toEqual({ status: 200, result: "processed" });
    row = await database().first(
      "SELECT status, payment_status, refunded_cents FROM orders WHERE id = ?",
      [order.id],
    );
    expect(row).toEqual({ status: "refunded", payment_status: "refunded", refunded_cents: 5000 });

    const refunds = await database().all<{ amount_cents: number }>(
      "SELECT amount_cents FROM payment_transactions WHERE order_id = ? AND status = 'refunded' ORDER BY created_at",
      [order.id],
    );
    expect(refunds.map((entry) => entry.amount_cents)).toEqual([3000, 2000]);

    const duplicate = await stripeRefund(
      order.id,
      `evt_refund_2_${suffix}`,
      5000,
      `re_2_${suffix}`,
      paymentIntent,
    );
    expect(duplicate).toEqual({ status: 200, result: "duplicate" });
    const afterDuplicate = await database().first<{ refunded_cents: number }>(
      "SELECT refunded_cents FROM orders WHERE id = ?",
      [order.id],
    );
    expect(afterDuplicate?.refunded_cents).toBe(5000);

    const mismatch = await stripeRefund(
      order.id,
      `evt_refund_3_${suffix}`,
      6000,
      `re_3_${suffix}`,
      paymentIntent,
    );
    expect(mismatch).toEqual({ status: 200, result: "mismatch" });
    const afterMismatch = await database().first<{ refunded_cents: number }>(
      "SELECT refunded_cents FROM orders WHERE id = ?",
      [order.id],
    );
    expect(afterMismatch?.refunded_cents).toBe(5000);

    // Simulate a crash after the state batch but before the processed marker:
    // redelivery must detect the existing refund transaction and not add it again.
    await database().run(
      "UPDATE payment_events SET processed_at = NULL WHERE plugin_id = 'stripe' AND event_id = ?",
      [`evt_refund_2_${suffix}`],
    );
    const retry = await stripeRefund(
      order.id,
      `evt_refund_2_${suffix}`,
      5000,
      `re_2_${suffix}`,
      paymentIntent,
    );
    expect(retry).toEqual({ status: 200, result: "duplicate" });
    const afterRetry = await database().first<{ refunded_cents: number }>(
      "SELECT refunded_cents FROM orders WHERE id = ?",
      [order.id],
    );
    expect(afterRetry?.refunded_cents).toBe(5000);
  });

  it("retries a payment event that was inserted but not processed", async () => {
    await ensureSession();
    const suffix = Date.now();
    const sessionId = `cs_retry_${suffix}`;
    const order = await createStripeOrder({
      name: "Retry Tee",
      slug: `retry-tee-${suffix}`,
      quantity: 2,
      email: `retry-${suffix}@example.com`,
      sessionId,
    });
    const eventId = `evt_retry_${suffix}`;
    await database().run(
      `INSERT INTO payment_events (id, plugin_id, event_id, event_type, order_id, payload_json, processed_at, created_at)
       VALUES (?, 'stripe', ?, 'checkout.session.completed', ?, '{}', NULL, ?)`,
      [`pev_retry_${suffix}`, eventId, order.id, new Date().toISOString()],
    );

    expect(await payStripeOrder(order.id, sessionId, `pi_retry_${suffix}`, 5000, eventId)).toBe("processed");
    const paid = await database().first<{ payment_status: string }>(
      "SELECT payment_status FROM orders WHERE id = ?",
      [order.id],
    );
    expect(paid?.payment_status).toBe("paid");
    const event = await database().first<{ processed_at: string | null }>(
      "SELECT processed_at FROM payment_events WHERE plugin_id = 'stripe' AND event_id = ?",
      [eventId],
    );
    expect(event?.processed_at).toBeTruthy();
  });

  it("rejects refunds for unpaid orders", async () => {
    await ensureSession();
    const suffix = Date.now();
    const order = await createStripeOrder({
      name: "Unpaid Refund Tee",
      slug: `unpaid-refund-tee-${suffix}`,
      quantity: 1,
      email: `unpaid-refund-${suffix}@example.com`,
      sessionId: `cs_unpaid_refund_${suffix}`,
    });
    const response = await json(`/api/admin/orders/${order.id}/refund`, "POST", { amount: "1.00" }, csrf());
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("refund_unpaid");
    const refunds = await database().first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM payment_transactions WHERE order_id = ? AND status = 'refunded'",
      [order.id],
    );
    expect(refunds?.count).toBe(0);
  });
});

describe("order cancellation and payment retry", () => {
  it("restocks exactly once when cancelled through the status endpoint", async () => {
    await ensureSession();
    const suffix = Date.now();
    const slug = `cancel-tee-${suffix}`;
    const productId = await createProduct("Cancel Tee", slug, "25.00");
    const before = await stockFor(slug);
    await addToCart(productId, 1);
    expect((await checkout("manual", `cancel-${suffix}@example.com`)).status).toBe(303);
    const order = await latestOrder();
    expect(order).toBeTruthy();
    expect(await stockFor(slug)).toBe(before - 1);

    const cancelled = await json(`/api/admin/orders/${order!.id}/status`, "POST", { status: "cancelled" }, csrf());
    expect(cancelled.status).toBe(200);
    expect(await stockFor(slug)).toBe(before);
    let movements = await database().first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_id = ? AND reason = 'restock'",
      [order!.id],
    );
    expect(movements?.count).toBe(1);

    const again = await json(`/api/admin/orders/${order!.id}/cancel`, "POST", {}, csrf());
    expect(again.status).toBe(200);
    expect(await stockFor(slug)).toBe(before);
    movements = await database().first(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_id = ? AND reason = 'restock'",
      [order!.id],
    );
    expect(movements?.count).toBe(1);
  });

  it("does not double-restock when cancel requests race", async () => {
    await ensureSession();
    const suffix = Date.now();
    const slug = `race-cancel-tee-${suffix}`;
    const productId = await createProduct("Race Cancel Tee", slug, "25.00");
    const before = await stockFor(slug);
    await addToCart(productId, 1);
    expect((await checkout("manual", `race-cancel-${suffix}@example.com`)).status).toBe(303);
    const order = await latestOrder();
    expect(order).toBeTruthy();
    expect(await stockFor(slug)).toBe(before - 1);

    const [first, second] = await Promise.all([
      json(`/api/admin/orders/${order!.id}/status`, "POST", { status: "cancelled" }, csrf()),
      json(`/api/admin/orders/${order!.id}/cancel`, "POST", {}, csrf()),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await stockFor(slug)).toBe(before);
    const movements = await database().first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_id = ? AND reason = 'restock'",
      [order!.id],
    );
    expect(movements?.count).toBe(1);
  });

  it("does not create a new checkout for a cancelled order", async () => {
    await ensureSession();
    const suffix = Date.now();
    const order = await createStripeOrder({
      name: "Closed Retry Tee",
      slug: `closed-retry-tee-${suffix}`,
      quantity: 1,
      email: `closed-retry-${suffix}@example.com`,
      sessionId: `cs_closed_retry_${suffix}`,
    });
    const cancelled = await json(`/api/admin/orders/${order.id}/status`, "POST", { status: "cancelled" }, csrf());
    expect(cancelled.status).toBe(200);

    const masterKey = (env as unknown as { APP_MASTER_KEY: string }).APP_MASTER_KEY;
    const access = await createOrderAccessToken(masterKey, order.id);
    const response = await request(`/orders/${encodeURIComponent(access)}/pay`, { method: "POST" });
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("This order can no longer be paid.");
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
