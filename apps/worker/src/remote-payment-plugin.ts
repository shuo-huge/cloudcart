import type { Database } from "@cloudcart/database";
import type { PluginRow } from "@cloudcart/database";
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
import { validateRemoteUrl, type RemotePluginManifest } from "@cloudcart/plugin-sdk";
import { HttpError } from "@cloudcart/shared";
import { remotePluginRequest, RemotePluginError } from "./remote-plugin-client";
import { headerRecord } from "./remote-plugin-client";

function publicConfig(config: PaymentConfig): PaymentConfig {
  return Object.fromEntries(Object.entries(config).filter(([key]) => !key.startsWith("_")));
}

function providerRedirect(value: string): string {
  try {
    return validateRemoteUrl(value);
  } catch (error) {
    throw new RemotePluginError(
      "service_error",
      `The remote payment plugin returned an unsafe redirect URL: ${error instanceof Error ? error.message : "invalid URL"}`,
    );
  }
}

export class RemotePaymentPlugin implements PaymentPlugin {
  readonly manifest: RemotePluginManifest;

  constructor(
    private readonly db: Database,
    private readonly masterKey: string,
    private readonly row: PluginRow,
    manifest: RemotePluginManifest,
  ) {
    this.manifest = manifest;
  }

  async validateConfig(config: PaymentConfig): Promise<ValidationResult> {
    try {
      const result = await remotePluginRequest<{ ok?: boolean; errors?: string[] }>(
        this.db, this.masterKey, this.row, "/payments/validate", {
          method: "POST",
          body: { config: publicConfig(config) },
          timeoutMs: 5000,
        },
      );
      return { ok: result.data?.ok === true, errors: result.data?.errors ?? [] };
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : "Payment validation failed."] };
    }
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const result = await remotePluginRequest<{
      type?: string;
      url?: string;
      message?: string;
      providerTransactionId?: string | null;
    }>(this.db, this.masterKey, this.row, "/payments/checkout", {
      method: "POST",
      body: {
        order: input.order,
        baseUrl: input.baseUrl,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        config: publicConfig(input.config),
      },
    });
    const data = result.data;
    if (data?.type === "redirect" && data.url) {
      return { type: "redirect", url: providerRedirect(data.url), providerTransactionId: data.providerTransactionId ?? null };
    }
    if (data?.type === "pending") {
      return {
        type: "pending",
        message: data.message || "Payment is pending.",
        providerTransactionId: data.providerTransactionId ?? null,
      };
    }
    throw new RemotePluginError("service_error", "The remote payment plugin returned an invalid checkout response.");
  }

  async verifyWebhook(request: Request, config: PaymentConfig): Promise<PaymentEvent> {
    const body = await request.text();
    if (body.length > 1_000_000) {
      throw new HttpError(413, "webhook_too_large", "The webhook payload is too large.");
    }
    const headers = headerRecord(request.headers);
    for (const key of ["cookie", "authorization", "host", "content-length"]) delete headers[key];
    const result = await remotePluginRequest<PaymentEvent>(
      this.db, this.masterKey, this.row, "/payments/verify-webhook", {
        method: "POST",
        body: { headers, body, config: publicConfig(config) },
      },
    );
    if (!result.data || typeof result.data.eventId !== "string" || typeof result.data.type !== "string") {
      throw new HttpError(400, "invalid_webhook", "The remote plugin returned an invalid payment event.");
    }
    return result.data;
  }

  async getPaymentStatus(providerTransactionId: string, config: PaymentConfig): Promise<PaymentStatus> {
    const result = await remotePluginRequest<{
      paid?: boolean;
      status?: string;
      amountCents?: number;
      currency?: string;
    }>(this.db, this.masterKey, this.row, "/payments/status", {
      method: "POST",
      body: { providerTransactionId, config: publicConfig(config) },
    });
    const data = result.data;
    if (!data || typeof data.paid !== "boolean" || typeof data.status !== "string" ||
        typeof data.amountCents !== "number" || typeof data.currency !== "string") {
      throw new RemotePluginError("service_error", "The remote payment plugin returned an invalid status.");
    }
    return {
      paid: data.paid,
      status: data.status,
      amountCents: data.amountCents,
      currency: data.currency,
    };
  }

  async captureOrder(input: CaptureInput): Promise<CaptureResult> {
    const result = await remotePluginRequest<{
      ok?: boolean;
      providerTransactionId?: string;
      amountCents?: number;
      currency?: string;
      message?: string;
    }>(this.db, this.masterKey, this.row, "/payments/capture", {
      method: "POST",
      body: { order: input.order, providerOrderId: input.providerOrderId, config: publicConfig(input.config) },
    });
    return {
      ok: result.data?.ok === true,
      providerTransactionId: result.data?.providerTransactionId,
      amountCents: result.data?.amountCents,
      currency: result.data?.currency,
      message: result.data?.message,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const result = await remotePluginRequest<{
      ok?: boolean;
      providerRefundId?: string;
      message?: string;
    }>(this.db, this.masterKey, this.row, "/payments/refund", {
      method: "POST",
      body: {
        orderId: input.orderId,
        providerTransactionId: input.providerTransactionId,
        amountCents: input.amountCents,
        currency: input.currency,
        config: publicConfig(input.config),
      },
    });
    return {
      ok: result.data?.ok === true,
      providerRefundId: result.data?.providerRefundId,
      message: result.data?.message,
    };
  }
}
