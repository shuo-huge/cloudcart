import type { Database } from "@cloudcart/database";
import { nowIso } from "@cloudcart/shared";
import { writeAuditLog } from "./audit";
import { cancelOrderAndRestock } from "./orders";

export interface ExpireOrdersSummary {
  expired: number;
  failed: number;
}

/**
 * Cancels online orders that were never paid, restoring stock and releasing
 * coupon usage. Run from the Worker cron trigger; manual-payment orders are
 * deliberately left alone because the customer may still be paying offline.
 */
export async function expireStaleOrders(
  db: Database,
  options: { olderThanMinutes?: number; limit?: number } = {},
): Promise<ExpireOrdersSummary> {
  const minutes = Math.max(1, Math.trunc(options.olderThanMinutes ?? 60));
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200);
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const rows = await db.all<{ id: string; order_number: string }>(
    `SELECT id, order_number FROM orders
     WHERE status = 'pending_payment'
       AND payment_status IN ('unpaid', 'failed', 'pending')
       AND created_at < ?
     ORDER BY created_at
     LIMIT ?`,
    [cutoff, limit],
  );

  let expired = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await cancelOrderAndRestock(db, row.id);
      if (!result.ok) {
        failed += 1;
        continue;
      }
      await writeAuditLog(db, {
        adminId: null,
        action: "order.expired",
        entityType: "order",
        entityId: row.id,
        details: { orderNumber: row.order_number, olderThanMinutes: minutes, expiredAt: nowIso() },
      });
      expired += 1;
    } catch {
      failed += 1;
    }
  }
  return { expired, failed };
}
