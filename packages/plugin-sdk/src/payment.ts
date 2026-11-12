export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export interface PaymentOrderSnapshot {
  id: string;
  orderNumber: string;
  currency: string;
  totalCents: number;
  email: string;
  items: Array<{
    name: string;
    unitPriceCents: number;
    quantity: number;
    totalCents: number;
  }>;
}

export interface CheckoutInput {
  order: PaymentOrderSnapshot;
  /** Public URL of the storefront, no trailing slash. */
  baseUrl: string;
  successUrl: string;
  cancelUrl: string;
  /** Non-secret configuration values for this plugin. */
  config: Record<string, string>;
  request: Request;
}

export type CheckoutResult =
  | { type: "redirect"; url: string; providerTransactionId?: string | null }
  | { type: "pending"; message: string; providerTransactionId?: string | null };

export type PaymentEventType = "payment.succeeded" | "payment.failed" | "payment.pending" | "refund";

export interface PaymentEvent {
  /** Provider event id, unique per event. Used for idempotency. */
  eventId: string;
  type: PaymentEventType;
  /** Internal order id when the provider carries it in metadata. */
  orderId: string | null;
  /** Provider order/session id, used to resolve the internal order when metadata is absent. */
  providerOrderId?: string | null;
  providerTransactionId: string | null;
  /** Provider refund id. Unique per refund; used to deduplicate callbacks. */
  providerRefundId?: string | null;
  /** Amount of this individual refund, when the provider exposes it. */
  refundAmountCents?: number;
  /**
   * Total refunded on the transaction after this event, when the provider
   * reports a cumulative total (for example Stripe `charge.refunded`).
   */
  refundedTotalCents?: number;
  amountCents: number;
  currency: string;
  rawType: string;
  statusDetail?: string;
}

export interface CaptureInput {
  order: PaymentOrderSnapshot;
  providerOrderId: string;
  config: PaymentConfig;
}

export interface CaptureResult {
  ok: boolean;
  providerTransactionId?: string;
  amountCents?: number;
  currency?: string;
  message?: string;
}

export interface PaymentConfig {
  [key: string]: string;
}

export interface PaymentStatus {
  paid: boolean;
  status: string;
  amountCents: number;
  currency: string;
}

export interface RefundInput {
  orderId: string;
  providerTransactionId: string;
  amountCents: number;
  currency: string;
  reason?: string;
  config: PaymentConfig;
}

export interface RefundResult {
  ok: boolean;
  providerRefundId?: string;
  message?: string;
}

export interface PaymentPlugin {
  manifest: import("./manifest").PluginManifest;
  validateConfig(config: PaymentConfig): Promise<ValidationResult>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Verify the raw request body signature and return the parsed event. */
  verifyWebhook(request: Request, config: PaymentConfig): Promise<PaymentEvent>;
  getPaymentStatus(providerTransactionId: string, config: PaymentConfig): Promise<PaymentStatus>;
  captureOrder?(input: CaptureInput): Promise<CaptureResult>;
  refund?(input: RefundInput): Promise<RefundResult>;
}

export class PaymentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigError";
  }
}
