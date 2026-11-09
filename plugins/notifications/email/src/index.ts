import type {
  EmailBinding,
  EmailDeliveryResult,
  EmailTransport,
  OutgoingEmail,
  ValidationResult,
} from "@cloudcart/plugin-sdk";

export const manifest = {
  id: "email-notifications",
  name: "Email Notifications",
  version: "1.0.0",
  apiVersion: "1",
  type: "notification" as const,
  description: "Order emails through Resend or Cloudflare Email Workers with a D1 outbox, retries and an admin log.",
  capabilities: ["email.order-notifications", "email.resend", "email.cloudflare"],
  permissions: ["orders:read", "settings:read"],
  dependencies: [],
};

export const EMAIL_PLUGIN_ID = manifest.id;
export const EMAIL_SECRET_KEYS = ["resendApiKey"];

export type EmailBackend = "resend" | "cloudflare";

export interface EmailConfig {
  backend: EmailBackend;
  from: string;
  fromName: string;
  replyTo: string;
  notifyAdmin: boolean;
  resendApiKey: string;
}

export function normalizeEmailConfig(values: Record<string, string>): EmailConfig {
  const backend = values.backend === "cloudflare" ? "cloudflare" : "resend";
  return {
    backend,
    from: (values.from ?? "").trim(),
    fromName: (values.fromName ?? "").trim(),
    replyTo: (values.replyTo ?? "").trim(),
    notifyAdmin: values.notifyAdmin !== "0",
    resendApiKey: values.resendApiKey ?? "",
  };
}

export function emailFromAddress(config: EmailConfig): string {
  return config.fromName ? `${config.fromName} <${config.from}>` : config.from;
}

export function validateEmailConfig(
  config: EmailConfig,
  options: { hasEmailBinding: boolean },
): ValidationResult {
  const errors: string[] = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.from)) {
    errors.push("A valid From address is required.");
  }
  if (config.replyTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(config.replyTo)) {
    errors.push("The Reply-to address is invalid.");
  }
  if (config.backend === "resend" && !config.resendApiKey) {
    errors.push("A Resend API key is required for the Resend backend.");
  }
  if (config.backend === "cloudflare" && !options.hasEmailBinding) {
    errors.push("The EMAIL send_email binding is not configured for this Worker.");
  }
  return { ok: errors.length === 0, errors };
}

class ResendTransport implements EmailTransport {
  readonly name = "resend";

  constructor(private readonly apiKey: string) {}

  async send(message: OutgoingEmail): Promise<EmailDeliveryResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo || undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        return { ok: false, error: body.message ?? body.error?.message ?? `Resend request failed (${response.status}).` };
      }
      return { ok: true, providerMessageId: body.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Resend request failed." };
    }
  }
}

class CloudflareEmailTransport implements EmailTransport {
  readonly name = "cloudflare";

  constructor(private readonly binding: EmailBinding) {}

  async send(message: OutgoingEmail): Promise<EmailDeliveryResult> {
    try {
      await this.binding.send({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo || undefined,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Cloudflare Email Workers send failed." };
    }
  }
}

export function createEmailTransport(
  config: EmailConfig,
  options: { emailBinding?: EmailBinding },
): EmailTransport {
  if (config.backend === "cloudflare") {
    if (!options.emailBinding) throw new Error("The EMAIL binding is not configured.");
    return new CloudflareEmailTransport(options.emailBinding);
  }
  if (!config.resendApiKey) throw new Error("A Resend API key is required.");
  return new ResendTransport(config.resendApiKey);
}
