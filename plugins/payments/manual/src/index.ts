import type { Database } from "@cloudcart/database";
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentConfig,
  PaymentEvent,
  PaymentPlugin,
  PaymentStatus,
  ValidationResult,
} from "@cloudcart/plugin-sdk";
import { escapeHtml, formatMoney } from "@cloudcart/shared";

export const manifest = {
  id: "manual",
  name: "Manual Payment",
  version: "1.0.0",
  apiVersion: "1",
  type: "payment" as const,
  description: "Bank transfer, cash on delivery or custom offline payment instructions.",
  capabilities: ["payment.manual", "payment.offline"],
  permissions: ["orders:read", "orders:mark-paid"],
  dependencies: [],
};

export const MANUAL_METHODS = ["bank_transfer", "cash_on_delivery", "custom"] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];

export interface ManualPaymentSettings {
  method: ManualMethod;
  instructions: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  swift: string;
  codInstructions: string;
}

export const DEFAULT_MANUAL_SETTINGS: ManualPaymentSettings = {
  method: "bank_transfer",
  instructions: "Complete your bank transfer using the details below. Your order will be processed once payment is confirmed.",
  accountName: "",
  bankName: "",
  accountNumber: "",
  swift: "",
  codInstructions: "Pay in cash when your order is delivered.",
};

export async function loadManualSettings(db: Database): Promise<ManualPaymentSettings> {
  const rows = await db.all<{ key: string; value: string }>(
    "SELECT key, value FROM plugin_settings WHERE plugin_id = 'manual'",
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const method = MANUAL_METHODS.includes(values.method as ManualMethod)
    ? (values.method as ManualMethod)
    : DEFAULT_MANUAL_SETTINGS.method;
  return {
    method,
    instructions: values.instructions ?? DEFAULT_MANUAL_SETTINGS.instructions,
    accountName: values.accountName ?? "",
    bankName: values.bankName ?? "",
    accountNumber: values.accountNumber ?? "",
    swift: values.swift ?? "",
    codInstructions: values.codInstructions ?? DEFAULT_MANUAL_SETTINGS.codInstructions,
  };
}

export function renderManualInstructions(settings: ManualPaymentSettings, currency: string, totalCents: number): string {
  const bankRows = [
    settings.accountName ? `<dt>Account name</dt><dd>${escapeHtml(settings.accountName)}</dd>` : "",
    settings.bankName ? `<dt>Bank</dt><dd>${escapeHtml(settings.bankName)}</dd>` : "",
    settings.accountNumber ? `<dt>Account number / IBAN</dt><dd>${escapeHtml(settings.accountNumber)}</dd>` : "",
    settings.swift ? `<dt>SWIFT / BIC</dt><dd>${escapeHtml(settings.swift)}</dd>` : "",
  ].join("");
  const body = settings.method === "cash_on_delivery"
    ? escapeHtml(settings.codInstructions)
    : escapeHtml(settings.instructions);
  return `<div class="cc-manual-payment">
  <p>${body}</p>
  ${bankRows ? `<dl class="cc-bank-details">${bankRows}</dl>` : ""}
  <p class="cc-muted">Amount due: ${escapeHtml(formatMoney(totalCents, currency))}</p>
</div>`;
}

class ManualPaymentPlugin implements PaymentPlugin {
  manifest = manifest;

  async validateConfig(config: PaymentConfig): Promise<ValidationResult> {
    const method = config.method ?? "bank_transfer";
    if (!MANUAL_METHODS.includes(method as ManualMethod)) {
      return { ok: false, errors: ["Unknown manual payment method."] };
    }
    if (method === "bank_transfer" && !config.accountNumber) {
      return { ok: false, errors: ["An account number is required for bank transfers."] };
    }
    return { ok: true };
  }

  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    return {
      type: "pending",
      message: "This order will be processed after the administrator confirms receipt of payment.",
    };
  }

  async verifyWebhook(_request: Request, _config: PaymentConfig): Promise<PaymentEvent> {
    throw new Error("Manual payments do not accept webhooks.");
  }

  async getPaymentStatus(_transactionId: string, _config: PaymentConfig): Promise<PaymentStatus> {
    return { paid: false, status: "manual_pending", amountCents: 0, currency: "USD" };
  }
}

export const manualPaymentPlugin = new ManualPaymentPlugin();
