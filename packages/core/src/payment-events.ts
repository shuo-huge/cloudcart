import type { Database } from "@cloudcart/database";
import type { OrderRow, PaymentTransactionRow } from "@cloudcart/database";
import type { PaymentEvent } from "@cloudcart/plugin-sdk";
import { HttpError, newId, nowIso } from "@cloudcart/shared";
import { auditLogStatement } from "./audit";

export type PaymentEventResult = "processed" | "duplicate" | "ignored" | "mismatch" | "closed";

export interface PaymentEventOutcome {
  result: PaymentEventResult;
  orderId: string | null;
  message?: string;
}

/**
 * Applies a verified provider event exactly once.
 *
 * The event row is inserted first as an unprocessed marker. All state changes
 * and the processed marker are then written in one D1 batch, so a crash cannot
 * leave the event marked as processed without applying it. If an earlier
 * attempt only inserted the marker, the next delivery is retried instead of
 * being skipped as a duplicate.
 *
 * Refunds use the provider refund id when available, or an event-scoped id
 * otherwise, so repeated partial-refund callbacks cannot be applied twice.
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

  const eventKey = event.eventId.slice(0, 200);
  const existing = await db.first<{ processed_at: string | null }>(
    "SELECT processed_at FROM payment_events WHERE plugin_id = ? AND event_id = ?",
    [pluginId, eventKey],
  );
  if (existing?.processed_at) {
    return { result: "duplicate", orderId: order.id };
  }
  if (!existing) {
    const insert = await db.run(
      `INSERT OR IGNORE INTO payment_events
         (id, plugin_id, event_id, event_type, order_id, payload_json, processed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        newId("pev"),
        pluginId,
        eventKey,
        event.rawType.slice(0, 120),
        order.id,
        JSON.stringify(event).slice(0, 20_000),
        nowIso(),
      ],
    );
    if (Number(insert.meta.changes ?? 0) === 0) {
      const row = await db.first<{ processed_at: string | null }>(
        "SELECT processed_at FROM payment_events WHERE plugin_id = ? AND event_id = ?",
        [pluginId, eventKey],
      );
      if (row?.processed_at) return { result: "duplicate", orderId: order.id };
    }
  }

  const now = nowIso();
  const processedStatement = (detail: string): D1PreparedStatement => db.prepare(
    `UPDATE payment_events SET processed_at = ?, payload_json = ?
     WHERE plugin_id = ? AND event_id = ? AND processed_at IS NULL`,
    [
      now,
      JSON.stringify({ ...event, result: detail }).slice(0, 20_000),
      pluginId,
      eventKey,
    ],
  );

  const finish = async (
    detail: string,
    result: PaymentEventResult,
    message?: string,
  ): Promise<PaymentEventOutcome> => {
    const update = await processedStatement(detail).run();
    if (Number(update.meta.changes ?? 0) === 0) {
      return { result: "duplicate", orderId: order.id };
    }
    return { result, orderId: order.id, message };
  };

  const finalize = async (
    statements: D1PreparedStatement[],
    detail: string,
  ): Promise<PaymentEventOutcome> => {
    statements.push(processedStatement(detail));
    try {
      await db.batch(statements);
    } catch (error) {
      // A concurrent delivery may have won the race. If it also marked the
      // event processed, this delivery is a duplicate rather than a failure.
      const row = await db.first<{ processed_at: string | null }>(
        "SELECT processed_at FROM payment_events WHERE plugin_id = ? AND event_id = ?",
        [pluginId, eventKey],
      );
      if (row?.processed_at) return { result: "duplicate", orderId: order.id };
      throw error;
    }
    return { result: "processed", orderId: order.id };
  };

  if (event.type === "payment.succeeded") {
    if (event.amountCents !== order.total_cents ||
        event.currency.toUpperCase() !== order.currency.toUpperCase()) {
      return finish("amount_mismatch", "mismatch", "The provider amount does not match the order total.");
    }
    if (["cancelled", "refunded"].includes(order.status)) {
      return finish("order_closed", "closed", "The order is no longer payable.");
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
    statements.push(auditLogStatement(db, {
      adminId: null,
      action: "payment.received",
      entityType: "order",
      entityId: order.id,
      details: { plugin: pluginId, eventId: event.eventId, amountCents: event.amountCents },
    }));
    return finalize(statements, "processed");
  }

  if (event.type === "payment.failed") {
    const transaction = await findTransaction(db, pluginId, event, order.id);
    const statements: D1PreparedStatement[] = [
      ...(transaction ? [db.prepare(
        "UPDATE payment_transactions SET status = 'failed', provider_status = ?, updated_at = ? WHERE id = ?",
        [event.rawType.slice(0, 120), now, transaction.id],
      )] : []),
      db.prepare(
        "UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status <> 'paid'",
        [now, order.id],
      ),
      auditLogStatement(db, {
        adminId: null,
        action: "payment.failed",
        entityType: "order",
        entityId: order.id,
        details: { plugin: pluginId, eventId: event.eventId, amountCents: event.amountCents },
      }),
    ];
    return finalize(statements, "failed");
  }

  if (event.type === "refund") {
    const cumulativeTarget = event.refundedTotalCents;
    if (!Number.isSafeInteger(event.amountCents) || event.amountCents <= 0 ||
        event.currency.toUpperCase() !== order.currency.toUpperCase()) {
      return finish("refund_mismatch", "mismatch", "The refund event is invalid.");
    }

    let target: number;
    if (cumulativeTarget !== undefined) {
      if (!Number.isSafeInteger(cumulativeTarget) || cumulativeTarget < 0 || cumulativeTarget > order.total_cents) {
        return finish("refund_mismatch", "mismatch", "The refund total does not match the order total.");
      }
      target = Math.max(order.refunded_cents, cumulativeTarget);
    } else {
      target = order.refunded_cents + event.amountCents;
      if (target > order.total_cents) {
        return finish("refund_mismatch", "mismatch", "The refund exceeds the amount paid.");
      }
    }

    if (target <= order.refunded_cents) {
      return finish("duplicate_refund", "duplicate");
    }

    const refundProviderId = event.providerRefundId || `refund-event:${event.eventId}`;
    const existingRefund = await db.first<{ id: string }>(
      "SELECT id FROM payment_transactions WHERE plugin_id = ? AND provider_id = ?",
      [pluginId, refundProviderId],
    );
    if (existingRefund) {
      return finish("duplicate_refund", "duplicate");
    }

    const delta = target - order.refunded_cents;
    const fully = target >= order.total_cents;
    return finalize([
      db.prepare(
        `UPDATE orders SET refunded_cents = ?, payment_status = ?, status = ?, updated_at = ? WHERE id = ?`,
        [target, fully ? "refunded" : "partially_refunded",
          fully ? "refunded" : "partially_refunded", now, order.id],
      ),
      db.prepare(
        `INSERT INTO payment_transactions (id, order_id, plugin_id, provider_id, status, amount_cents, currency,
           provider_status, metadata_json, created_at, updated_at, paid_at)
         VALUES (?, ?, ?, ?, 'refunded', ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId("txn"), order.id, pluginId, refundProviderId,
          delta, order.currency, event.rawType.slice(0, 120),
          JSON.stringify({
            providerTransactionId: event.providerTransactionId,
            providerOrderId: event.providerOrderId,
            cumulativeRefundedCents: target,
          }),
          now, now, now,
        ],
      ),
      auditLogStatement(db, {
        adminId: null,
        action: "payment.refunded",
        entityType: "order",
        entityId: order.id,
        details: { plugin: pluginId, eventId: event.eventId, amountCents: delta, refundedCents: target },
      }),
    ], "refunded");
  }

  return finish("pending", "processed");
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
    // Stripe charge events carry the PaymentIntent in `payment_intent` and may
    // omit the Checkout Session metadata. The original transaction stores it
    // in metadata_json, so use that as a fallback rather than dropping the
    // refund event as an unknown order.
    const byMetadata = await db.first<PaymentTransactionRow>(
      `SELECT * FROM payment_transactions
       WHERE plugin_id = ?
         AND (json_extract(metadata_json, '$.providerTransactionId') = ?
              OR json_extract(metadata_json, '$.providerOrderId') = ?)
       ORDER BY created_at ASC LIMIT 1`,
      [pluginId, identifier, identifier],
    );
    if (byMetadata) {
      const order = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [byMetadata.order_id]);
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
