/**
 * Transport contract for outbound transactional email. Core owns the queue and
 * templates; a bundled plugin supplies the provider implementation.
 */
export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export type EmailDeliveryResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string };

export interface EmailTransport {
  readonly name: string;
  send(message: OutgoingEmail): Promise<EmailDeliveryResult>;
}

/** The subset of Cloudflare's SendEmail binding used by the email plugin. */
export interface EmailBinding {
  send(message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  }): Promise<unknown>;
}
