import type { Database } from "@cloudcart/database";
import type { EmailOutboxRow, OrderAddressRow, OrderItemRow, OrderRow } from "@cloudcart/database";
import type { EmailTransport, OutgoingEmail } from "@cloudcart/plugin-sdk";
import { escapeHtml, formatMoney, newId, nowIso } from "@cloudcart/shared";
import { createOrderAccessToken, getOrderDetail } from "./orders";
import { orderStatusLabel } from "./storefront";
import { getSetting, SETTING_KEYS } from "./settings";
import { parseOrderTax } from "./tax";

export const EMAIL_PLUGIN_ID = "email-notifications";

export type OrderEmailEvent =
  | "order.placed"
  | "payment.confirmed"
  | "order.shipped"
  | "order.cancelled"
  | "order.refunded";

export interface EnqueueEmailOptions {
  masterKey: string;
  origin: string;
  /** Pre-rendered, trusted HTML from the manual payment plugin. */
  manualInstructionsHtml?: string;
  refundAmountCents?: number;
}

export interface DispatchSummary {
  sent: number;
  failed: number;
  skipped?: boolean;
}

const BACKOFF_MINUTES = [1, 5, 15, 60, 360];

export async function isEmailNotificationsEnabled(db: Database): Promise<boolean> {
  return db.exists(
    "SELECT 1 FROM plugins WHERE id = ? AND type = 'notification' AND enabled = 1 AND built_in = 1",
    [EMAIL_PLUGIN_ID],
  );
}

function money(cents: number, currency: string): string {
  return escapeHtml(formatMoney(cents, currency));
}

function summaryHtml(order: OrderRow, tax: ReturnType<typeof parseOrderTax>): string {
  const rows = [
    `<tr><td>Subtotal</td><td align="right">${money(order.subtotal_cents, order.currency)}</td></tr>`,
    order.discount_cents > 0
      ? `<tr><td>Discount</td><td align="right">−${money(order.discount_cents, order.currency)}</td></tr>`
      : "",
    `<tr><td>Shipping</td><td align="right">${money(order.shipping_cents, order.currency)}</td></tr>`,
    tax && tax.rateBps > 0
      ? `<tr><td>${escapeHtml(tax.name)}${tax.included ? " (included)" : ""}</td><td align="right">${money(order.tax_cents, order.currency)}</td></tr>`
      : "",
    `<tr><td><strong>Total</strong></td><td align="right"><strong>${money(order.total_cents, order.currency)}</strong></td></tr>`,
  ];
  return `<table role="presentation" cellpadding="6" style="border-collapse:collapse;width:100%">${rows.join("")}</table>`;
}

function summaryText(order: OrderRow, tax: ReturnType<typeof parseOrderTax>): string {
  const lines = [
    `Subtotal: ${formatMoney(order.subtotal_cents, order.currency)}`,
    order.discount_cents > 0 ? `Discount: -${formatMoney(order.discount_cents, order.currency)}` : "",
    `Shipping: ${formatMoney(order.shipping_cents, order.currency)}`,
    tax && tax.rateBps > 0
      ? `${tax.name}${tax.included ? " (included)" : ""}: ${formatMoney(order.tax_cents, order.currency)}`
      : "",
    `Total: ${formatMoney(order.total_cents, order.currency)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function itemsHtml(items: OrderItemRow[], currency: string): string {
  return items.map((item) => (
    `<tr><td>${escapeHtml(item.name)} × ${item.quantity}</td><td align="right">${money(item.total_cents, currency)}</td></tr>`
  )).join("");
}

function itemsText(items: OrderItemRow[], currency: string): string {
  return items.map((item) => `${item.name} x ${item.quantity}: ${formatMoney(item.total_cents, currency)}`).join("\n");
}

function addressHtml(address: OrderAddressRow | undefined): string {
  if (!address) return "";
  const parts = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
    address.country,
  ].filter(Boolean);
  return `<p>${parts.map((part) => escapeHtml(String(part))).join("<br>")}</p>`;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function subjectFor(event: OrderEmailEvent, order: OrderRow, role: "customer" | "store"): string {
  const prefix = role === "store" ? "New activity: " : "";
  switch (event) {
    case "order.placed":
      return role === "store" ? `New order ${order.order_number}` : `Order ${order.order_number} received`;
    case "payment.confirmed":
      return `${prefix}Payment received for order ${order.order_number}`;
    case "order.shipped":
      return `${prefix}Order ${order.order_number} shipped`;
    case "order.cancelled":
      return `${prefix}Order ${order.order_number} cancelled`;
    case "order.refunded":
      return `${prefix}Refund for order ${order.order_number}`;
  }
}

function renderEmail(
  event: OrderEmailEvent,
  role: "customer" | "store",
  order: OrderRow,
  items: OrderItemRow[],
  shippingAddress: OrderAddressRow | undefined,
  storeName: string,
  privateUrl: string,
  options: EnqueueEmailOptions,
): RenderedEmail {
  const tax = parseOrderTax(order.metadata_json);
  const heading = subjectFor(event, order, role);
  const intro: Record<OrderEmailEvent, string> = {
    "order.placed": order.payment_method === "manual"
      ? "We received your order. Complete the payment using the instructions below."
      : "We received your order. We will email you again when payment is confirmed.",
    "payment.confirmed": "Your payment has been confirmed. We are preparing your order.",
    "order.shipped": order.tracking_number
      ? `Your order has shipped. Tracking: ${order.tracking_number}${order.tracking_url ? ` (${order.tracking_url})` : ""}.`
      : "Your order has shipped.",
    "order.cancelled": "Your order has been cancelled.",
    "order.refunded": options.refundAmountCents
      ? `A refund of ${formatMoney(options.refundAmountCents, order.currency)} has been recorded for your order.`
      : "A refund has been recorded for your order.",
  };
  const trackingHtml = order.tracking_number
    ? `<p>Tracking: ${order.tracking_url ? `<a href="${escapeHtml(order.tracking_url)}">${escapeHtml(order.tracking_number)}</a>` : escapeHtml(order.tracking_number)}</p>`
    : "";
  const manualHtml = event === "order.placed" && options.manualInstructionsHtml
    ? `<h3>Payment instructions</h3>${options.manualInstructionsHtml}`
    : "";
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1f2937;max-width:640px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">${escapeHtml(heading)}</h1>
  <p>${escapeHtml(intro[event])}</p>
  <p><strong>Order:</strong> ${escapeHtml(order.order_number)}<br>
     <strong>Status:</strong> ${escapeHtml(orderStatusLabel(order.status))}</p>
  <h3>Items</h3>
  <table role="presentation" cellpadding="6" style="border-collapse:collapse;width:100%">${itemsHtml(items, order.currency)}</table>
  <h3>Summary</h3>
  ${summaryHtml(order, tax)}
  <h3>Shipping address</h3>
  ${addressHtml(shippingAddress)}
  ${trackingHtml}
  ${manualHtml}
  <p><a href="${escapeHtml(privateUrl)}">View your order</a></p>
  <p style="color:#6b7280;font-size:13px">${escapeHtml(storeName)}</p>
</body></html>`;
  const text = [
    heading,
    "",
    intro[event],
    "",
    `Order: ${order.order_number}`,
    `Status: ${orderStatusLabel(order.status)}`,
    "",
    itemsText(items, order.currency),
    "",
    summaryText(order, tax),
    "",
    shippingAddress ? `Shipping to:\n${shippingAddress.name}\n${shippingAddress.line1}\n${shippingAddress.city} ${shippingAddress.state} ${shippingAddress.postal_code}\n${shippingAddress.country}` : "",
    order.tracking_number ? `Tracking: ${order.tracking_number}${order.tracking_url ? ` (${order.tracking_url})` : ""}` : "",
    options.manualInstructionsHtml ? "Payment instructions are available in the HTML version of this email." : "",
    "",
    `View your order: ${privateUrl}`,
    "",
    storeName,
  ].filter((line) => line !== undefined).join("\n");
  return { subject: heading, html, text };
}

/** Queue customer and optional store copies for an order lifecycle event. */
export async function enqueueOrderEventEmails(
  db: Database,
  event: OrderEmailEvent,
  orderId: string,
  options: EnqueueEmailOptions,
): Promise<number> {
  if (!(await isEmailNotificationsEnabled(db))) return 0;
  const detail = await getOrderDetail(db, orderId);
  if (!detail) return 0;
  const { order, items, addresses } = detail;
  const token = await createOrderAccessToken(options.masterKey, order.id);
  const privateUrl = `${options.origin.replace(/\/$/, "")}/orders/${token}`;
  const storeName = (await getSetting(db, SETTING_KEYS.storeName, "CloudCart")) || "CloudCart";
  const storeEmail = (await getSetting(db, SETTING_KEYS.storeEmail, "")).trim();
  const notifyAdminRow = await db.first<{ value: string }>(
    "SELECT value FROM plugin_settings WHERE plugin_id = ? AND key = 'notifyAdmin'",
    [EMAIL_PLUGIN_ID],
  );
  const notifyAdmin = notifyAdminRow?.value !== "0";
  const shippingAddress = addresses.find((address) => address.type === "shipping");

  const recipients: Array<{ email: string; role: "customer" | "store" }> = [
    { email: order.email, role: "customer" },
  ];
  if (storeEmail && notifyAdmin && storeEmail.toLowerCase() !== order.email.toLowerCase()) {
    recipients.push({ email: storeEmail, role: "store" });
  }

  const now = nowIso();
  const statements = recipients.map((recipient) => {
    const rendered = renderEmail(
      event, recipient.role, order, items, shippingAddress, storeName, privateUrl, options,
    );
    return db.prepare(
      `INSERT INTO email_outbox (id, event, order_id, recipient, recipient_role, subject, html_body, text_body,
         status, attempts, max_attempts, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 5, ?, ?, ?)`,
      [
        newId("eml"), event, order.id, recipient.email, recipient.role,
        rendered.subject.slice(0, 500), rendered.html.slice(0, 100_000), rendered.text.slice(0, 50_000),
        now, now, now,
      ],
    );
  });
  if (statements.length > 0) await db.batch(statements);
  return statements.length;
}

function nextAttemptIso(attempts: number, now: Date): string {
  const minutes = BACKOFF_MINUTES[Math.min(Math.max(attempts - 1, 0), BACKOFF_MINUTES.length - 1)] ?? 360;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export async function dispatchEmailOutbox(
  db: Database,
  transport: EmailTransport,
  options: { limit?: number; now?: Date; from?: string; replyTo?: string } = {},
): Promise<DispatchSummary> {
  const now = options.now ?? new Date();
  const nowValue = now.toISOString();
  const staleBefore = new Date(now.getTime() - 5 * 60_000).toISOString();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const due = await db.all<EmailOutboxRow>(
    `SELECT * FROM email_outbox
     WHERE attempts < max_attempts
       AND ((status = 'pending' AND next_attempt_at <= ?)
         OR (status = 'sending' AND locked_at IS NOT NULL AND locked_at <= ?))
     ORDER BY next_attempt_at, created_at
     LIMIT ?`,
    [nowValue, staleBefore, limit],
  );

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const claimed = await db.run(
      `UPDATE email_outbox
       SET status = 'sending', locked_at = ?, attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND attempts < max_attempts AND status IN ('pending', 'sending')`,
      [nowValue, nowValue, row.id],
    );
    if (!claimed.meta.changes) continue;

    const outgoing: OutgoingEmail = {
      from: options.from ?? "no-reply@localhost",
      to: row.recipient,
      subject: row.subject,
      html: row.html_body,
      text: row.text_body,
      replyTo: options.replyTo,
    };
    const result = await transport.send(outgoing);
    const attempts = row.attempts + 1;
    if (result.ok) {
      sent += 1;
      await db.run(
        `UPDATE email_outbox SET status = 'sent', sent_at = ?, provider = ?, provider_message_id = ?,
           last_error = NULL, locked_at = NULL, updated_at = ? WHERE id = ?`,
        [nowValue, transport.name, result.providerMessageId ?? null, nowValue, row.id],
      );
    } else {
      failed += 1;
      const exhausted = attempts >= row.max_attempts;
      await db.run(
        `UPDATE email_outbox SET status = ?, next_attempt_at = ?, locked_at = NULL,
           last_error = ?, updated_at = ? WHERE id = ?`,
        [
          exhausted ? "failed" : "pending",
          exhausted ? row.next_attempt_at : nextAttemptIso(attempts, now),
          result.error.slice(0, 500),
          nowValue,
          row.id,
        ],
      );
    }
  }
  return { sent, failed };
}

export async function retryEmailOutbox(db: Database, ids?: string[]): Promise<number> {
  const now = nowIso();
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => "?").join(", ");
    const result = await db.run(
      `UPDATE email_outbox SET status = 'pending', attempts = 0, next_attempt_at = ?, locked_at = NULL,
         last_error = NULL, updated_at = ? WHERE id IN (${placeholders}) AND status = 'failed'`,
      [now, now, ...ids],
    );
    return Number(result.meta.changes ?? 0);
  }
  const result = await db.run(
    `UPDATE email_outbox SET status = 'pending', attempts = 0, next_attempt_at = ?, locked_at = NULL,
       last_error = NULL, updated_at = ? WHERE status = 'failed'`,
    [now, now],
  );
  return Number(result.meta.changes ?? 0);
}

export async function listEmailOutbox(
  db: Database,
  query: { page: number; perPage: number; status?: string },
): Promise<{ items: Array<EmailOutboxRow & { order_number: string | null }>; total: number; summary: Record<string, number> }> {
  const status = query.status && query.status !== "all" ? query.status : null;
  const where = status ? "WHERE e.status = ?" : "";
  const params = status ? [status] : [];
  const [count, list, summary] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS count FROM email_outbox e ${where}`, params),
    db.prepare(
      `SELECT e.*, o.order_number FROM email_outbox e
       LEFT JOIN orders o ON o.id = e.order_id
       ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [...params, query.perPage, (query.page - 1) * query.perPage],
    ),
    db.prepare("SELECT status, COUNT(*) AS count FROM email_outbox GROUP BY status"),
  ]);
  const summaryCounts: Record<string, number> = { pending: 0, sending: 0, sent: 0, failed: 0 };
  for (const row of (summary?.results ?? []) as Array<{ status: string; count: number }>) {
    summaryCounts[row.status] = Number(row.count);
  }
  const items = ((list?.results ?? []) as unknown as Array<EmailOutboxRow & { order_number: string | null }>)
    .map((row) => ({ ...row, html_body: "", text_body: "" }));
  return {
    items,
    total: Number((count?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
    summary: summaryCounts,
  };
}

export { summaryHtml as renderOrderSummaryHtml };
