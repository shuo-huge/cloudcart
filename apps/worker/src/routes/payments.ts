import {
  assertEventShape,
  createOrderAccessToken,
  getOrderByAccessToken,
  getOrderDetail,
  loadPaymentRuntimeConfig,
  parseOrderAccessToken,
  processPaymentEvent,
} from "@cloudcart/core";
import { HttpError } from "@cloudcart/shared";
import type { PaymentOrderSnapshot } from "@cloudcart/plugin-sdk";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppContext } from "../env";
import { db, jsonError } from "../lib";
import { getPaymentPlugin } from "../plugin-registry";

export const webhookRoutes = new Hono<AppContext>();
export const paymentReturnRoutes = new Hono<AppContext>();

export function orderSnapshot(detail: Awaited<ReturnType<typeof getOrderDetail>>): PaymentOrderSnapshot | null {
  if (!detail) return null;
  return {
    id: detail.order.id,
    orderNumber: detail.order.order_number,
    currency: detail.order.currency,
    totalCents: detail.order.total_cents,
    email: detail.order.email,
    items: detail.items.map((item) => ({
      name: item.name,
      unitPriceCents: item.unit_price_cents,
      quantity: item.quantity,
      totalCents: item.total_cents,
    })),
  };
}

webhookRoutes.post("/:plugin", async (c) => {
  const pluginId = c.req.param("plugin");
  if (pluginId !== "stripe" && pluginId !== "paypal") {
    return jsonError(c, 404, "unknown_plugin", "Unknown payment provider.");
  }
  const plugin = getPaymentPlugin(pluginId);
  if (!plugin) return jsonError(c, 404, "unknown_plugin", "Unknown payment provider.");
  if (!c.env.APP_MASTER_KEY) return jsonError(c, 500, "not_configured", "APP_MASTER_KEY is not configured.");

  try {
    const config = await loadPaymentRuntimeConfig(db(c), pluginId, c.env.APP_MASTER_KEY);
    const event = await plugin.verifyWebhook(c.req.raw, config);
    assertEventShape(event);
    const outcome = await processPaymentEvent(db(c), pluginId, event);
    return c.json({ received: true, result: outcome.result });
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      scope: "payment_webhook",
      plugin: pluginId,
      message: error instanceof HttpError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error),
    }));
    // 400 tells the provider the delivery failed, so it will retry.
    return c.json({ ok: false, error: { code: "invalid_webhook", message: "The webhook could not be verified." } }, 400);
  }
});

/**
 * PayPal return URL: PayPal redirects here after approval. The server captures
 * the payment, re-checks the captured amount and currency, then marks the
 * order paid through the same idempotent event pipeline used by webhooks.
 */
paymentReturnRoutes.get("/paypal/return", async (c) => {
  const access = c.req.query("access") ?? "";
  const paypalOrderId = c.req.query("token") ?? "";
  const database = db(c);
  const orderId = await parseOrderAccessToken(c.env.APP_MASTER_KEY, access);
  if (!orderId || !paypalOrderId) {
    return c.redirect("/", 302);
  }
  const detail = await getOrderDetail(database, orderId);
  if (!detail) return c.redirect("/", 302);

  const transaction = await database.first<{ id: string }>(
    "SELECT id FROM payment_transactions WHERE order_id = ? AND plugin_id = 'paypal' AND provider_id = ?",
    [orderId, paypalOrderId],
  );
  if (!transaction) {
    return c.redirect(`/orders/${access}?payment=error`, 302);
  }

  const plugin = getPaymentPlugin("paypal");
  if (!plugin?.captureOrder) return c.redirect(`/orders/${access}?payment=error`, 302);
  const config = await loadPaymentRuntimeConfig(database, "paypal", c.env.APP_MASTER_KEY);
  const snapshot = orderSnapshot(detail);
  if (!snapshot) return c.redirect(`/orders/${access}?payment=error`, 302);

  const capture = await plugin.captureOrder({ order: snapshot, providerOrderId: paypalOrderId, config });
  if (!capture.ok || capture.amountCents === undefined || !capture.currency) {
    return c.redirect(`/orders/${access}?payment=failed`, 302);
  }
  const now = new Date().toISOString();
  await processPaymentEvent(database, "paypal", {
    eventId: `capture-${capture.providerTransactionId ?? paypalOrderId}`,
    type: "payment.succeeded",
    orderId,
    providerOrderId: paypalOrderId,
    providerTransactionId: capture.providerTransactionId ?? null,
    amountCents: capture.amountCents,
    currency: capture.currency,
    rawType: "paypal.capture.completed",
    statusDetail: now,
  });

  const refreshed = await database.first<{ payment_status: string }>(
    "SELECT payment_status FROM orders WHERE id = ?",
    [orderId],
  );
  return c.redirect(`/orders/${access}?payment=${refreshed?.payment_status === "paid" ? "success" : "pending"}`, 302);
});

/** Recreates a provider checkout for an existing pending order. */
export async function retryPayment(c: Context<AppContext>, orderId: string): Promise<Response> {
  const detail = await getOrderDetail(db(c), orderId);
  if (!detail) throw new HttpError(404, "order_not_found", "Order not found.");
  if (detail.order.payment_status === "paid") {
    return c.redirect(`/orders/${await createOrderAccessToken(c.env.APP_MASTER_KEY, orderId)}`, 302);
  }
  const method = detail.order.payment_method ?? "";
  const plugin = getPaymentPlugin(method);
  if (!plugin || method === "manual") {
    throw new HttpError(400, "no_payment_provider", "This order has no online payment provider.");
  }
  const config = await loadPaymentRuntimeConfig(db(c), method, c.env.APP_MASTER_KEY);
  const snapshot = orderSnapshot(detail);
  if (!snapshot) throw new HttpError(404, "order_not_found", "Order not found.");
  const origin = new URL(c.req.url).origin;
  const access = await createOrderAccessToken(c.env.APP_MASTER_KEY, orderId);
  const successUrl = method === "paypal"
    ? `${origin}/api/payments/paypal/return?access=${encodeURIComponent(access)}`
    : `${origin}/orders/${access}`;
  const result = await plugin.createCheckout({
    order: snapshot,
    baseUrl: origin,
    successUrl,
    cancelUrl: `${origin}/orders/${access}`,
    config,
    request: c.req.raw,
  });
  if (result.type === "redirect") {
    await db(c).run(
      `INSERT INTO payment_transactions (id, order_id, plugin_id, provider_id, status, amount_cents, currency,
         provider_status, metadata_json, created_at, updated_at, paid_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, 'checkout_created', '{}', ?, ?, NULL)`,
      [
        `txn_${crypto.randomUUID().replace(/-/g, "")}`, orderId, method, result.providerTransactionId ?? null,
        detail.order.total_cents, detail.order.currency, new Date().toISOString(), new Date().toISOString(),
      ],
    );
    return c.redirect(result.url, 303);
  }
  return c.redirect(`/orders/${access}?payment=pending`, 302);
}
