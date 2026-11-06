import type { Database } from "@cloudcart/database";
import type { OrderRow, PaymentTransactionRow } from "@cloudcart/database";
import type { PaymentEvent } from "@cloudcart/plugin-sdk";
import { HttpError, newId, nowIso } from "@cloudcart/shared";
import { writeAuditLog } from "./audit";

export type PaymentEventResult = "processed" | "duplicate" | "ignored" | "mismatch" | "closed";

export interface PaymentEventOutcome {
  result: PaymentEventResult;
  orderId: string | null;
  message?: string;
}

/**
 * Applies a verified provider event exactly once.
 *
 * - Event ids are unique per plugin, making retries idempotent.
 * - Amount and currency are compared to the server-side order before any
 *   state change; mismatches never mark an order paid.
 * - Cancelled/refunded orders stay closed.
 */
export async function processPaymentEvent(
  db: Database,
  pluginId: string,
  event: PaymentEvent,
): Promise<PaymentEventOutcome> {
  const order = await resolveOrder(db, pluginId, event);
  if (!order) {
    return { result: "ignored", orderId: null, message: "No matching order for this payment event." };
  }

  const insert = await db.run(
    `INSERT OR IGNORE INTO payment_events
       (id, plugin_id, event_id, event_type, order_id, payload_json, processed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      newId("pev"),
      pluginId,
      event.eventId.slice(0, 200),
      event.rawType.slice(0, 120),
      order.id,
      JSON.stringify(event).slice(0, 20_000),
      nowIso(),
    ],
  );
  if (Number(insert.meta.changes ?? 0) === 0) {
    return { result: "duplicate", orderId: order.id };
  }

  const now = nowIso();
  const markProcessed = async (detail: string): Promise<void> => {
    await db.run(
      "UPDATE payment_events SET processed_at = ?, payload_json = ? WHERE plugin_id = ? AND event_id = ?",
      [now, JSON.stringify({ ...event, result: detail }).slice(0, 20_000), pluginId, event.eventId.slice(0, 200)],
    );
  };

  if (event.type === "payment.succeeded" || event.type === "refund") {
    if (event.amountCents !== order.total_cents || event.currency.toUpperCase() !== order.currency.toUpperCase()) {
      await markProcessed("amount_mismatch");
      return {
        result: "mismatch",
        orderId: order.id,
        message: "The provider amount does not match the order total.",
      };
    }
  }

  if (event.type === "payment.succeeded") {
    if (["cancelled", "refunded"].includes(order.status)) {
      await markProcessed("order_closed");
      return { result: "closed", orderId: order.id, message: "The order is no longer payable." };
    }
    const transaction = await findTransaction(db, pluginId, event, order.id);
    const statements: D1PreparedStatement[] = [];
    if (transaction) {
      statements.push(db.prepare(
        `UPDATE payment_transactions SET status = 'succeeded', provider_status = ?, paid_at = ?, updated_at = ?,
           metadata_json = ? WHERE id = ?`,
        [
          event.rawType.slice(0, 120),
          now,
          now,
          JSON.stringify({ providerTransactionId: event.providerTransactionId, providerOrderId: event.providerOrderId }),
          transaction.id,
        ],
      ));
    } else {
      statements.push(db.prepare(
        `INSERT INTO payment_transactions (id, order_id, plugin_id, provider_id, status, amount_cents, currency,
           provider_status, metadata_json, created_at, updated_at, paid_at)
         VALUES (?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId("txn"), order.id, pluginId, event.providerTransactionId ?? event.providerOrderId ?? null,
          event.amountCents, order.currency, event.rawType.slice(0, 120),
          JSON.stringify({ providerTransactionId: event.providerTransactionId, providerOrderId: event.providerOrderId }),
          now, now, now,
        ],
      ));
    }
    statements.push(db.prepare(
      `UPDATE orders SET payment_status = 'paid', status = 'paid', paid_at = ?, updated_at = ?
       WHERE id = ? AND payment_status <> 'paid' AND status NOT IN ('cancelled', 'refunded')`,
      [now, now, order.id],
    ));
    await db.batch(statements);
    await writeAuditLog(db, {
      adminId: null,
      action: "payment.received",
      entityType: "order",
      entityId: order.id,
      details: { plugin: pluginId, eventId: event.eventId, amountCents: event.amountCents },
    });
    await markProcessed("processed");
    return { result: "processed", orderId: order.id };
  }

  if (event.type === "payment.failed") {
    const transaction = await findTransaction(db, pluginId, event, order.id);
    await db.batch([
      ...(transaction ? [db.prepare(
        "UPDATE payment_transactions SET status = 'failed', provider_status = ?, updated_at = ? WHERE id = ?",
        [event.rawType.slice(0, 120), now, transaction.id],
      )] : []),
      db.prepare(
        "UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status <> 'paid'",
        [now, order.id],
      ),
    ]);
    await markProcessed("failed");
    return { result: "processed", orderId: order.id };
  }

  if (event.type === "refund") {
    const refunded = Math.min(order.total_cents, order.refunded_cents + event.amountCents);
    const fully = refunded >= order.total_cents;
    await db.batch([
      db.prepare(
        `UPDATE orders SET refunded_cents = ?, payment_status = ?, status = ?, updated_at = ? WHERE id = ?`,
        [refunded, fully ? "refunded" : "partially_refunded", fully ? "refunded" : "partially_refunded", now, order.id],
      ),
      db.prepare(
        `INSERT INTO payment_transactions (id, order_id, plugin_id, provider_id, status, amount_cents, currency,
           provider_status, metadata_json, created_at, updated_at, paid_at)
         VALUES (?, ?, ?, ?, 'refunded', ?, ?, ?, '{}', ?, ?, ?)`,
        [
          newId("txn"), order.id, pluginId, event.providerTransactionId ?? null,
          event.amountCents, order.currency, event.rawType.slice(0, 120), now, now, now,
        ],
      ),
    ]);
    await writeAuditLog(db, {
      adminId: null,
      action: "payment.refunded",
      entityType: "order",
      entityId: order.id,
      details: { plugin: pluginId, eventId: event.eventId, amountCents: event.amountCents },
    });
    await markProcessed("refunded");
    return { result: "processed", orderId: order.id };
  }

  await markProcessed("pending");
  return { result: "processed", orderId: order.id };
}

async function resolveOrder(db: Database, pluginId: string, event: PaymentEvent): Promise<OrderRow | null> {
  if (event.orderId) {
    const byId = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [event.orderId]);
    if (byId) return byId;
  }
  const identifiers = [event.providerOrderId, event.providerTransactionId].filter((value): value is string => Boolean(value));
  for (const identifier of identifiers) {
    const transaction = await db.first<PaymentTransactionRow>(
      "SELECT * FROM payment_transactions WHERE plugin_id = ? AND provider_id = ? LIMIT 1",
      [pluginId, identifier],
    );
    if (transaction) {
      const order = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [transaction.order_id]);
      if (order) return order;
    }
  }
  return null;
}

async function findTransaction(
  db: Database,
  pluginId: string,
  event: PaymentEvent,
  orderId: string,
): Promise<PaymentTransactionRow | null> {
  const identifiers = [event.providerOrderId, event.providerTransactionId].filter((value): value is string => Boolean(value));
  for (const identifier of identifiers) {
    const row = await db.first<PaymentTransactionRow>(
      "SELECT * FROM payment_transactions WHERE plugin_id = ? AND provider_id = ? LIMIT 1",
      [pluginId, identifier],
    );
    if (row) return row;
  }
  return db.first<PaymentTransactionRow>(
    "SELECT * FROM payment_transactions WHERE order_id = ? AND plugin_id = ? ORDER BY created_at DESC LIMIT 1",
    [orderId, pluginId],
  );
}

export function assertEventShape(event: PaymentEvent): void {
  if (!event.eventId || event.eventId.length > 200) {
    throw new HttpError(400, "invalid_event", "The payment event is missing a valid id.");
  }
  if (!Number.isSafeInteger(event.amountCents) || event.amountCents < 0) {
    throw new HttpError(400, "invalid_event", "The payment event amount is invalid.");
  }
}
