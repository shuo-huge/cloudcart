import type {
  PaymentEvent,
  PaymentOrderSnapshot,
  PaymentStatus,
  ValidationResult,
} from "./payment";

/**
 * HTTP contract between CloudCart and a remote payment plugin. All requests are
 * signed with the plugin's `_serviceSecret`; responses are JSON.
 */
export interface RemotePaymentValidateRequest {
  config: Record<string, string>;
}

export type RemotePaymentValidateResponse = ValidationResult;

export interface RemotePaymentCheckoutRequest {
  order: PaymentOrderSnapshot;
  baseUrl: string;
  successUrl: string;
  cancelUrl: string;
  config: Record<string, string>;
}

export type RemotePaymentCheckoutResponse =
  | { type: "redirect"; url: string; providerTransactionId?: string | null }
  | { type: "pending"; message: string; providerTransactionId?: string | null };

export interface RemotePaymentWebhookRequest {
  headers: Record<string, string>;
  body: string;
  config: Record<string, string>;
}

export type RemotePaymentWebhookResponse = PaymentEvent;

export interface RemotePaymentStatusResponse {
  status: PaymentStatus;
  providerStatus?: string;
  amountCents?: number;
  currency?: string;
}

export interface RemotePaymentCaptureRequest {
  order: PaymentOrderSnapshot;
  providerOrderId: string;
  config: Record<string, string>;
}

export type RemotePaymentCaptureResponse =
  | { ok: true; providerTransactionId?: string | null; amountCents: number; currency: string }
  | { ok: false; message?: string };

export interface RemotePaymentRefundRequest {
  orderId: string;
  providerTransactionId: string;
  amountCents: number;
  currency: string;
  config: Record<string, string>;
}

export type RemotePaymentRefundResponse =
  | { ok: true; providerTransactionId?: string | null }
  | { ok: false; message?: string };
