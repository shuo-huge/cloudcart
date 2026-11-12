import type { Database } from "@cloudcart/database";
import type { OrderRow, PaymentTransactionRow } from "@cloudcart/database";
import { newId, nowIso } from "@cloudcart/shared";

export interface RefundInput {
  orderId: string;
  pluginId: string;
  amountCents: number;
  providerRefundId?: string | null;
  providerStatus?: string | null;
  metadata?: Record<string, unknown>;
}

export type RefundOutcome =
  | {
    ok: true;
    applied: boolean;
    duplicate: boolean;
    refundedCents: number;
    totalCents: number;
    fullyRefunded: boolean;
    paymentStatus: string;
  }
  | { ok: false; message: string };

/**
 * Records a refund and updates the order balance atomically.
 *
 * The refund transactions are the ledger: the insert is gated on the current
 * sum of refunded transactions plus the new amount not exceeding the order
 * total, and the order balance is recomputed from the ledger in the same D1
 * batch. Concurrent refunds therefore accumulate instead of overwriting each
 * other, and a duplicate provider refund id is a no-op.
 */
export async function applyRefund(db: Database, input: RefundInput): Promise<RefundOutcome> {
  const order = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [input.orderId]);
  if (!order) return { ok: false, message: "Order not found." };
  if (!["paid", "partially_refunded"].includes(order.payment_status)) {
    return { ok: false, message: "Only paid orders can be refunded." };
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, message: "Refund amount is invalid." };
  }
  const remaining = order.total_cents - order.refunded_cents;
  if (input.amountCents > remaining) {
    return { ok: false, message: "The refund amount exceeds the remaining balance." };
  }

  const pluginId = input.pluginId || order.payment_method || "manual";
  const providerId = input.providerRefundId?.trim() || `refund-${order.id}-${newId("rfnd")}`;
  const existing = await db.first<PaymentTransactionRow>(
    "SELECT * FROM payment_transactions WHERE plugin_id = ? AND provider_id = ?",
    [pluginId, providerId],
  );
  if (existing) {
    return {
      ok: true,
      applied: false,
      duplicate: true,
      refundedCents: order.refunded_cents,
      totalCents: order.total_cents,
      fullyRefunded: order.refunded_cents >= order.total_cents,
      paymentStatus: order.payment_status,
    };
  }

  const now = nowIso();
  const txnId = newId("txn");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO payment_transactions
       (id, order_id, plugin_id, provider_id, status, amount_cents, currency, provider_status,
        metadata_json, created_at, updated_at, paid_at)
     SELECT ?, ?, ?, ?, 'refunded', ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT refunded_cents FROM orders
              WHERE id = ? AND payment_status IN ('paid', 'partially_refunded')) + ?
           <= (SELECT total_cents FROM orders WHERE id = ?)`,
    [
      txnId, order.id, pluginId, providerId, input.amountCents, order.currency,
      input.providerStatus ?? "refund",
      JSON.stringify({ ...(input.metadata ?? {}), refundAmountCents: input.amountCents }),
      now, now, now,
      order.id, input.amountCents, order.id,
    ],
  );
  const update = db.prepare(
    `UPDATE orders
     SET refunded_cents = refunded_cents + ?,
         payment_status = CASE WHEN refunded_cents + ? >= total_cents
           THEN 'refunded' ELSE 'partially_refunded' END,
         updated_at = ?
     WHERE id = ?
       AND payment_status IN ('paid', 'partially_refunded')
       AND refunded_cents + ? <= total_cents
       AND EXISTS (SELECT 1 FROM payment_transactions WHERE id = ?)`,
    [input.amountCents, input.amountCents, now, order.id, input.amountCents, txnId],
  );
  await db.batch([insert, update]);

  const after = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [order.id]);
  if (!after) return { ok: false, message: "Order not found." };
  const applied = after.refunded_cents > order.refunded_cents;
  if (!applied) {
    const inserted = await db.first<PaymentTransactionRow>(
      "SELECT * FROM payment_transactions WHERE id = ?",
      [txnId],
    );
    if (inserted) {
      return { ok: false, message: "The refund transaction was recorded but the order balance was not updated." };
    }
    const duplicate = await db.first<PaymentTransactionRow>(
      "SELECT * FROM payment_transactions WHERE plugin_id = ? AND provider_id = ?",
      [pluginId, providerId],
    );
    if (duplicate) {
      return {
        ok: true,
        applied: false,
        duplicate: true,
        refundedCents: after.refunded_cents,
        totalCents: after.total_cents,
        fullyRefunded: after.refunded_cents >= after.total_cents,
        paymentStatus: after.payment_status,
      };
    }
    return { ok: false, message: "The refund amount exceeds the remaining balance." };
  }
  return {
    ok: true,
    applied: true,
    duplicate: false,
    refundedCents: after.refunded_cents,
    totalCents: after.total_cents,
    fullyRefunded: after.refunded_cents >= after.total_cents,
    paymentStatus: after.payment_status,
  };
}
