import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import { installRemotePlugin } from "@cloudcart/core";
import { parseRemotePluginManifest } from "@cloudcart/plugin-sdk";
import { addToCart, checkoutForm, createClient, createProduct, type TestClient } from "./support";
import { resolvePaymentPlugin } from "../apps/worker/src/payment-plugin-resolver";

const MASTER = "test-master-key-0123456789abcdef";
const PLUGIN_ID = "remote-pay";
let client: TestClient;

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

const manifest = parseRemotePluginManifest({
  id: PLUGIN_ID,
  name: "Remote Pay",
  version: "1.0.0",
  apiVersion: "1",
  type: "payment",
  runtime: "remote",
  description: "Remote payment provider",
  author: "Tester",
  capabilities: ["payment.checkout"],
  permissions: [],
  service: { baseUrl: "https://pay.example.com/api", auth: "hmac-sha256" },
  admin: { entryUrl: "https://pay.example.com/admin", pages: [] },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): { restore: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init ?? {});
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = original; } };
}

beforeAll(async () => {
  client = createClient();
  await client.ensureSession();
  await installRemotePlugin(database(), {
    manifest,
    manifestUrl: "https://pay.example.com/cloudcart-plugin.json",
    manifestHash: "hash-pay",
    serviceSecret: "test-remote-pay-secret-123456",
    masterKey: MASTER,
    bundledIds: new Set(),
  });
  await database().run("UPDATE plugins SET enabled = 1 WHERE id = ?", [PLUGIN_ID]);
});

async function placeOrder(email: string): Promise<string> {
  const productId = await createProduct(client, { name: `Remote Pay Item ${email}`, slug: `remote-pay-${email.split("@")[0]}` });
  await addToCart(client, productId, 1);
  const mock = mockFetch((url) => {
    if (url.endsWith("/payments/validate")) return jsonResponse({ ok: true });
    if (url.endsWith("/payments/checkout")) {
      return jsonResponse({
        type: "redirect",
        url: "https://pay.example.com/checkout/123",
        providerTransactionId: "remote_pi_123",
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  try {
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email, paymentMethod: PLUGIN_ID }).toString(),
    });
    expect(checkout.status).toBe(303);
    expect(checkout.headers.get("location")).toBe("https://pay.example.com/checkout/123");
  } finally {
    mock.restore();
  }
  const order = await database().first<{ id: string; total_cents: number }>(
    "SELECT id, total_cents FROM orders ORDER BY created_at DESC LIMIT 1",
  );
  expect(order).not.toBeNull();
  return order!.id;
}

describe("remote payment plugin", () => {
  it("resolves enabled remote payment plugins and keeps them available for historical webhooks", async () => {
    const enabled = await resolvePaymentPlugin(database(), MASTER, PLUGIN_ID);
    expect(enabled).not.toBeNull();
    await database().run("UPDATE plugins SET enabled = 0 WHERE id = ?", [PLUGIN_ID]);
    expect(await resolvePaymentPlugin(database(), MASTER, PLUGIN_ID)).toBeNull();
    expect(await resolvePaymentPlugin(database(), MASTER, PLUGIN_ID, { includeDisabled: true })).not.toBeNull();
    await database().run("UPDATE plugins SET enabled = 1 WHERE id = ?", [PLUGIN_ID]);
  });

  it("creates checkout through the remote service and marks the order paid via a verified webhook", async () => {
    const orderId = await placeOrder("remote-buyer@example.com");
    const order = await database().first<{ total_cents: number }>("SELECT total_cents FROM orders WHERE id = ?", [orderId]);
    const mock = mockFetch((url) => {
      if (url.endsWith("/payments/verify-webhook")) {
        return jsonResponse({
          eventId: "remote-event-1",
          type: "payment.succeeded",
          orderId,
          providerTransactionId: "remote_pi_123",
          amountCents: order!.total_cents,
          currency: "USD",
          rawType: "remote.payment.succeeded",
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    try {
      const webhook = await client.request(`/webhooks/${PLUGIN_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "remote-event-1" }),
      });
      expect(webhook.status).toBe(200);
      const body = await webhook.json() as { result: string };
      expect(body.result).toBe("processed");
    } finally {
      mock.restore();
    }
    const paid = await database().first<{ status: string; payment_status: string }>(
      "SELECT status, payment_status FROM orders WHERE id = ?",
      [orderId],
    );
    expect(paid).toMatchObject({ status: "paid", payment_status: "paid" });
  });

  it("rejects a remote event whose order belongs to another payment method", async () => {
    const productId = await createProduct(client, { name: "Manual Item", slug: "manual-item" });
    await addToCart(client, productId, 1);
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email: "manual-buyer@example.com", paymentMethod: "manual" }).toString(),
    });
    expect(checkout.status).toBe(303);
    const order = await database().first<{ id: string; total_cents: number }>(
      "SELECT id, total_cents FROM orders ORDER BY created_at DESC LIMIT 1",
    );
    const mock = mockFetch((url) => {
      if (url.endsWith("/payments/verify-webhook")) {
        return jsonResponse({
          eventId: "remote-event-scope",
          type: "payment.succeeded",
          orderId: order!.id,
          providerTransactionId: "remote_pi_scope",
          amountCents: order!.total_cents,
          currency: "USD",
          rawType: "remote.payment.succeeded",
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    try {
      const webhook = await client.request(`/webhooks/${PLUGIN_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(webhook.status).toBe(400);
    } finally {
      mock.restore();
    }
    const unpaid = await database().first<{ payment_status: string }>(
      "SELECT payment_status FROM orders WHERE id = ?",
      [order!.id],
    );
    expect(unpaid?.payment_status).toBe("pending");
  });
});
