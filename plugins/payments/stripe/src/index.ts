import type {
  CheckoutInput,
  CheckoutResult,
  PaymentConfig,
  PaymentEvent,
  PaymentPlugin,
  PaymentStatus,
  RefundInput,
  RefundResult,
  ValidationResult,
} from "@cloudcart/plugin-sdk";
import { constantTimeEqual } from "@cloudcart/security";
import { formatMoney, moneyToInput } from "@cloudcart/shared";

export const manifest = {
  id: "stripe",
  name: "Stripe",
  version: "1.0.0",
  apiVersion: "1",
  type: "payment" as const,
  description: "Stripe Checkout hosted payment page with signed webhooks and idempotent payment events.",
  capabilities: ["payment.checkout", "payment.webhook", "payment.refund"],
  permissions: ["orders:read", "orders:mark-paid", "payments:refund"],
  dependencies: [],
};

const STRIPE_API = "https://api.stripe.com";
const SIGNATURE_TOLERANCE_SECONDS = 300;

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message) as BufferSource);
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function computeStripeSignature(secret: string, payload: string, timestamp: number): Promise<string> {
  return hmacSha256Hex(secret, `${timestamp}.${payload}`);
}

/** Verifies a `Stripe-Signature` header against the raw request body. */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header || !secret) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value.trim());
  }
  if (!timestamp || !Number.isFinite(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = await computeStripeSignature(secret, payload, timestamp);
  return signatures.some((signature) => constantTimeEqual(signature, expected));
}

async function stripeForm(
  path: string,
  secretKey: string,
  params: URLSearchParams,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${STRIPE_API}${path}`, { method: "POST", headers, body: params.toString() });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error as { message?: string } | undefined;
    throw new Error(error?.message ?? `Stripe request failed (${response.status}).`);
  }
  return body;
}

class StripePaymentPlugin implements PaymentPlugin {
  manifest = manifest;

  async validateConfig(config: PaymentConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    if (!config.secretKey?.startsWith("sk_")) errors.push("A Stripe secret key (sk_…) is required.");
    if (!config.publishableKey?.startsWith("pk_")) errors.push("A Stripe publishable key (pk_…) is required.");
    if (!config.webhookSecret?.startsWith("whsec_")) errors.push("A webhook signing secret (whsec_…) is required.");
    return { ok: errors.length === 0, errors };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const { order, config } = input;
    if (!config.secretKey) throw new Error("Stripe is not configured.");
    const join = (url: string) => `${url}${url.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`;
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", join(input.successUrl));
    params.set("cancel_url", input.cancelUrl);
    params.set("client_reference_id", order.id);
    params.set("customer_email", order.email);
    params.set("metadata[order_id]", order.id);
    params.set("metadata[order_number]", order.orderNumber);
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", order.currency.toLowerCase());
    params.set("line_items[0][price_data][unit_amount]", String(order.totalCents));
    params.set("line_items[0][price_data][product_data][name]", `Order ${order.orderNumber}`);
    const body = await stripeForm("/v1/checkout/sessions", config.secretKey, params, `checkout-${order.id}`);
    const url = typeof body.url === "string" ? body.url : "";
    const id = typeof body.id === "string" ? body.id : "";
    if (!url || !id) throw new Error("Stripe did not return a checkout URL.");
    return { type: "redirect", url, providerTransactionId: id };
  }

  async verifyWebhook(request: Request, config: PaymentConfig): Promise<PaymentEvent> {
    const secret = config.webhookSecret;
    if (!secret) throw new Error("Stripe webhook secret is not configured.");
    const raw = await request.text();
    const valid = await verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret);
    if (!valid) throw new Error("Invalid Stripe webhook signature.");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const eventId = String(parsed.id ?? "");
    const type = String(parsed.type ?? "");
    const data = parsed.data as { object?: Record<string, unknown> } | undefined;
    const object = data?.object ?? {};
    if (!eventId) throw new Error("Stripe event is missing an id.");

    const metadata = (object.metadata ?? {}) as Record<string, string>;
    const orderId = metadata.order_id ?? (typeof object.client_reference_id === "string" ? object.client_reference_id : null);
    const amount = Number(object.amount_total ?? object.amount ?? 0);
    const currency = String(object.currency ?? "usd").toUpperCase();
    const providerOrderId = typeof object.id === "string" ? object.id : null;
    const paymentIntent = typeof object.payment_intent === "string"
      ? object.payment_intent
      : (object.payment_intent as { id?: string } | undefined)?.id ?? null;

    if (type === "checkout.session.async_payment_succeeded" || type === "checkout.session.completed") {
      const paid = type === "checkout.session.async_payment_succeeded" || object.payment_status === "paid";
      return {
        eventId,
        type: paid ? "payment.succeeded" : "payment.pending",
        orderId,
        providerOrderId,
        providerTransactionId: paymentIntent,
        amountCents: amount,
        currency,
        rawType: type,
        statusDetail: String(object.payment_status ?? ""),
      };
    }
    if (type === "checkout.session.async_payment_failed" || type === "payment_intent.payment_failed") {
      return {
        eventId,
        type: "payment.failed",
        orderId,
        providerOrderId,
        providerTransactionId: paymentIntent,
        amountCents: amount,
        currency,
        rawType: type,
        statusDetail: String(object.last_payment_error ? "payment_failed" : ""),
      };
    }
    if (type === "charge.refunded") {
      const refunded = Number(object.amount_refunded ?? 0);
      return {
        eventId,
        type: "refund",
        orderId,
        providerOrderId,
        providerTransactionId: paymentIntent,
        amountCents: refunded,
        currency,
        rawType: type,
      };
    }
    return {
      eventId,
      type: "payment.pending",
      orderId,
      providerOrderId,
      providerTransactionId: paymentIntent,
      amountCents: 0,
      currency,
      rawType: type,
    };
  }

  async getPaymentStatus(sessionId: string, config: PaymentConfig): Promise<PaymentStatus> {
    if (!config.secretKey) throw new Error("Stripe is not configured.");
    const response = await fetch(`${STRIPE_API}/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${config.secretKey}` },
    });
    if (!response.ok) throw new Error(`Stripe session lookup failed (${response.status}).`);
    const body = (await response.json()) as { payment_status?: string; amount_total?: number; currency?: string };
    return {
      paid: body.payment_status === "paid",
      status: body.payment_status ?? "unknown",
      amountCents: body.amount_total ?? 0,
      currency: (body.currency ?? "usd").toUpperCase(),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const { config } = input;
    if (!config.secretKey) return { ok: false, message: "Stripe is not configured." };
    const params = new URLSearchParams();
    params.set("payment_intent", input.providerTransactionId);
    params.set("amount", String(input.amountCents));
    if (input.reason) params.set("reason", input.reason);
    try {
      const body = await stripeForm("/v1/refunds", config.secretKey, params, `refund-${input.orderId}-${input.amountCents}-${Date.now()}`);
      return { ok: true, providerRefundId: typeof body.id === "string" ? body.id : undefined };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Stripe refund failed." };
    }
  }
}

export const stripePaymentPlugin = new StripePaymentPlugin();
export default stripePaymentPlugin;

export function describeStripeAmount(cents: number, currency: string): string {
  return `${formatMoney(cents, currency)} (${moneyToInput(cents, currency)} ${currency.toUpperCase()})`;
}
