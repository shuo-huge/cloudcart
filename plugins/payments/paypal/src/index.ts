import type {
  CaptureInput,
  CaptureResult,
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
import { moneyToInput, parseMoneyInput } from "@cloudcart/shared";

export const manifest = {
  id: "paypal",
  name: "PayPal",
  version: "1.0.0",
  apiVersion: "1",
  type: "payment" as const,
  description: "PayPal Orders v2 checkout with server-side capture, webhook signature verification and amount checks.",
  capabilities: ["payment.checkout", "payment.capture", "payment.webhook", "payment.refund"],
  permissions: ["orders:read", "orders:mark-paid", "payments:refund"],
  dependencies: [],
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function paypalBaseUrl(mode: string | undefined): string {
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(config: PaymentConfig): Promise<string> {
  const mode = config.mode === "live" ? "live" : "sandbox";
  const cacheKey = `${mode}:${config.clientId ?? ""}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  if (!config.clientId || !config.clientSecret) throw new Error("PayPal is not configured.");
  const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
  const response = await fetch(`${paypalBaseUrl(mode)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) throw new Error(`PayPal authentication failed (${response.status}).`);
  tokenCache.set(cacheKey, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 300) * 1000,
  });
  return body.access_token;
}

async function paypalRequest(
  config: PaymentConfig,
  path: string,
  init: { method?: string; body?: unknown; requestId?: string } = {},
): Promise<Record<string, unknown>> {
  const token = await getAccessToken(config);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
  const response = await fetch(`${paypalBaseUrl(config.mode)}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof body.message === "string" ? body.message : `PayPal request failed (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

function amountValue(cents: number, currency: string): string {
  return moneyToInput(cents, currency.toUpperCase());
}

function amountCents(value: unknown, currency: string): number {
  try {
    return parseMoneyInput(String(value), currency.toUpperCase());
  } catch {
    return 0;
  }
}

class PayPalPaymentPlugin implements PaymentPlugin {
  manifest = manifest;

  async validateConfig(config: PaymentConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    if (!config.clientId) errors.push("A PayPal client ID is required.");
    if (!config.clientSecret) errors.push("A PayPal client secret is required.");
    if (!config.webhookId) errors.push("A PayPal webhook ID is required.");
    if (config.mode !== "sandbox" && config.mode !== "live") errors.push("Mode must be sandbox or live.");
    return { ok: errors.length === 0, errors };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const { order, config } = input;
    const body = await paypalRequest(config, "/v2/checkout/orders", {
      method: "POST",
      requestId: `create-${order.id}`,
      body: {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: order.id,
          custom_id: order.orderNumber,
          description: `Order ${order.orderNumber}`,
          amount: {
            currency_code: order.currency.toUpperCase(),
            value: amountValue(order.totalCents, order.currency),
          },
        }],
        application_context: {
          brand_name: input.baseUrl.replace(/^https?:\/\//, "").slice(0, 127),
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: input.successUrl,
          cancel_url: input.cancelUrl,
        },
      },
    });
    const id = typeof body.id === "string" ? body.id : "";
    const links = Array.isArray(body.links) ? body.links as Array<{ rel?: string; href?: string }> : [];
    const approve = links.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href;
    if (!id || !approve) throw new Error("PayPal did not return an approval link.");
    return { type: "redirect", url: approve, providerTransactionId: id };
  }

  async captureOrder(input: CaptureInput): Promise<CaptureResult> {
    const { order, providerOrderId, config } = input;
    try {
      const body = await paypalRequest(config, `/v2/checkout/orders/${encodeURIComponent(providerOrderId)}/capture`, {
        method: "POST",
        requestId: `capture-${order.id}`,
        body: {},
      });
      if (body.status !== "COMPLETED") {
        return { ok: false, message: `PayPal capture status: ${String(body.status)}` };
      }
      const units = body.purchase_units as Array<Record<string, unknown>> | undefined;
      const payments = units?.[0]?.payments as { captures?: Array<Record<string, unknown>> } | undefined;
      const capture = payments?.captures?.[0];
      if (!capture) return { ok: false, message: "PayPal capture did not return a capture record." };
      const amount = (capture.amount ?? {}) as { value?: string; currency_code?: string };
      const currency = String(amount.currency_code ?? order.currency).toUpperCase();
      const cents = amountCents(amount.value, currency);
      return {
        ok: true,
        providerTransactionId: typeof capture.id === "string" ? capture.id : undefined,
        amountCents: cents,
        currency,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "PayPal capture failed." };
    }
  }

  async verifyWebhook(request: Request, config: PaymentConfig): Promise<PaymentEvent> {
    if (!config.webhookId) throw new Error("PayPal webhook ID is not configured.");
    const raw = await request.text();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const verification = await paypalRequest(config, "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        auth_algo: request.headers.get("paypal-auth-algo") ?? "",
        cert_url: request.headers.get("paypal-cert-url") ?? "",
        transmission_id: request.headers.get("paypal-transmission-id") ?? "",
        transmission_sig: request.headers.get("paypal-transmission-sig") ?? "",
        transmission_time: request.headers.get("paypal-transmission-time") ?? "",
        webhook_id: config.webhookId,
        webhook_event: parsed,
      },
    });
    if (verification.verification_status !== "SUCCESS") {
      throw new Error("Invalid PayPal webhook signature.");
    }

    const eventId = String(parsed.id ?? "");
    const rawType = String(parsed.event_type ?? "");
    const resource = (parsed.resource ?? {}) as Record<string, unknown>;
    if (!eventId) throw new Error("PayPal event is missing an id.");
    const supplementary = (resource.supplementary_data ?? {}) as { related_ids?: { order_id?: string } };
    const providerOrderId = supplementary.related_ids?.order_id ?? (rawType.startsWith("CHECKOUT.ORDER") ? String(resource.id ?? "") : null);
    const amount = (resource.amount ?? {}) as { value?: string; currency_code?: string };
    const currency = String(amount.currency_code ?? "USD").toUpperCase();
    const cents = amountCents(amount.value, currency);
    const providerTransactionId = typeof resource.id === "string" ? resource.id : null;

    if (rawType === "PAYMENT.CAPTURE.COMPLETED") {
      return {
        eventId,
        type: "payment.succeeded",
        orderId: null,
        providerOrderId,
        providerTransactionId,
        amountCents: cents,
        currency,
        rawType,
      };
    }
    if (rawType === "PAYMENT.CAPTURE.DENIED" || rawType === "PAYMENT.CAPTURE.DECLINED") {
      return {
        eventId,
        type: "payment.failed",
        orderId: null,
        providerOrderId,
        providerTransactionId,
        amountCents: cents,
        currency,
        rawType,
      };
    }
    if (rawType === "PAYMENT.CAPTURE.REFUNDED") {
      return {
        eventId,
        type: "refund",
        orderId: null,
        providerOrderId,
        providerTransactionId,
        // PayPal's refund resource id is unique per refund and is a delta amount.
        providerRefundId: providerTransactionId,
        amountCents: cents,
        currency,
        rawType,
      };
    }
    if (rawType === "CHECKOUT.ORDER.APPROVED") {
      const units = resource.purchase_units as Array<{ amount?: { value?: string; currency_code?: string } }> | undefined;
      const unit = units?.[0]?.amount;
      return {
        eventId,
        type: "payment.pending",
        orderId: null,
        providerOrderId: String(resource.id ?? ""),
        providerTransactionId: null,
        amountCents: unit ? amountCents(unit.value, String(unit.currency_code ?? "USD")) : 0,
        currency: String(unit?.currency_code ?? "USD").toUpperCase(),
        rawType,
      };
    }
    return {
      eventId,
      type: "payment.pending",
      orderId: null,
      providerOrderId,
      providerTransactionId,
      amountCents: cents,
      currency,
      rawType,
    };
  }

  async getPaymentStatus(providerOrderId: string, config: PaymentConfig): Promise<PaymentStatus> {
    const body = await paypalRequest(config, `/v2/checkout/orders/${encodeURIComponent(providerOrderId)}`);
    const units = body.purchase_units as Array<{ amount?: { value?: string; currency_code?: string } }> | undefined;
    const unit = units?.[0]?.amount;
    const currency = String(unit?.currency_code ?? "USD").toUpperCase();
    return {
      paid: body.status === "COMPLETED",
      status: String(body.status ?? "unknown"),
      amountCents: unit ? amountCents(unit.value, currency) : 0,
      currency,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const { config } = input;
    const captureId = input.providerTransactionId;
    if (!captureId) return { ok: false, message: "No PayPal capture id is stored for this order." };
    try {
      const body = await paypalRequest(config, `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
        method: "POST",
        requestId: `refund-${input.orderId}-${Date.now()}`,
        body: {
          amount: {
            value: amountValue(input.amountCents, input.currency),
            currency_code: input.currency.toUpperCase(),
          },
        },
      });
      return { ok: true, providerRefundId: typeof body.id === "string" ? body.id : undefined };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "PayPal refund failed." };
    }
  }
}

export const paypalPaymentPlugin = new PayPalPaymentPlugin();
export default paypalPaymentPlugin;
