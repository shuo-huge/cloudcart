import type { Database } from "@cloudcart/database";
import type {
  OrderItemRow,
  OrderReturnItemRow,
  OrderReturnRow,
} from "@cloudcart/database";
import { HttpError, newId, nowIso } from "@cloudcart/shared";

export interface OrderReturnItemInput {
  orderItemId: string;
  quantity: number;
}

export interface CreateOrderReturnInput {
  items: OrderReturnItemInput[];
  restock: boolean;
  reason?: string | null;
  note?: string | null;
}

export interface OrderReturnView {
  return: OrderReturnRow;
  items: Array<OrderReturnItemRow & { name: string; sku: string | null }>;
}

export async function listOrderReturns(db: Database, orderId: string): Promise<OrderReturnView[]> {
  const returns = await db.all<OrderReturnRow>(
    "SELECT * FROM order_returns WHERE order_id = ? ORDER BY created_at DESC",
    [orderId],
  );
  if (returns.length === 0) return [];
  const items = await db.all<OrderReturnItemRow & { name: string; sku: string | null }>(
    `SELECT ri.*, oi.name, oi.sku
     FROM order_return_items ri
     JOIN order_returns r ON r.id = ri.return_id
     JOIN order_items oi ON oi.id = ri.order_item_id
     WHERE r.order_id = ?
     ORDER BY ri.created_at`,
    [orderId],
  );
  return returns.map((entry) => ({
    return: entry,
    items: items.filter((item) => item.return_id === entry.id),
  }));
}

export async function createOrderReturn(
  db: Database,
  orderId: string,
  input: CreateOrderReturnInput,
  adminId: string,
): Promise<OrderReturnView> {
  const order = await db.first<{ id: string }>("SELECT id FROM orders WHERE id = ?", [orderId]);
  if (!order) throw new HttpError(404, "order_not_found", "Order not found.");
  if (input.items.length === 0) throw new HttpError(400, "empty_return", "Select at least one item to return.");

  const seen = new Set<string>();
  for (const item of input.items) {
    if (seen.has(item.orderItemId)) {
      throw new HttpError(400, "duplicate_return_item", "Each order item can only appear once.");
    }
    seen.add(item.orderItemId);
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 10_000) {
      throw new HttpError(400, "invalid_return_quantity", "Return quantities must be positive integers.");
    }
  }

  const orderItems = await db.all<OrderItemRow>("SELECT * FROM order_items WHERE order_id = ?", [orderId]);
  const byId = new Map(orderItems.map((item) => [item.id, item]));
  const previous = await db.all<{ order_item_id: string; quantity: number }>(
    `SELECT ri.order_item_id, COALESCE(SUM(ri.quantity), 0) AS quantity
     FROM order_return_items ri
     JOIN order_returns r ON r.id = ri.return_id
     WHERE r.order_id = ?
     GROUP BY ri.order_item_id`,
    [orderId],
  );
  const returned = new Map(previous.map((row) => [row.order_item_id, Number(row.quantity)]));

  for (const item of input.items) {
    const line = byId.get(item.orderItemId);
    if (!line) throw new HttpError(400, "invalid_return_item", "An item does not belong to this order.");
    const already = returned.get(item.orderItemId) ?? 0;
    if (item.quantity > line.quantity - already) {
      throw new HttpError(
        409,
        "return_quantity_exceeded",
        `Only ${Math.max(0, line.quantity - already)} of ${line.name} can still be returned.`,
      );
    }
    if (input.restock && !line.product_id) {
      throw new HttpError(409, "return_restock_unavailable", `${line.name} no longer has a product to restock.`);
    }
  }

  const now = nowIso();
  const returnId = newId("ret");
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO order_returns (id, order_id, status, reason, note, restock, created_by, created_at, updated_at)
       VALUES (?, ?, 'recorded', ?, ?, ?, ?, ?, ?)`,
      [
        returnId, orderId, input.reason?.slice(0, 500) || null, input.note?.slice(0, 5000) || null,
        input.restock ? 1 : 0, adminId, now, now,
      ],
    ),
  ];

  for (const item of input.items) {
    const line = byId.get(item.orderItemId)!;
    statements.push(db.prepare(
      `INSERT INTO order_return_items
         (id, return_id, order_item_id, product_id, variant_id, quantity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId("rei"), returnId, line.id, line.product_id, line.variant_id, item.quantity, now],
    ));
    if (!input.restock || !line.product_id) continue;
    if (line.variant_id) {
      statements.push(db.prepare(
        "UPDATE product_variants SET stock = stock + ?, updated_at = ? WHERE id = ?",
        [item.quantity, now, line.variant_id],
      ));
    } else {
      statements.push(db.prepare(
        "UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ? AND manage_stock = 1",
        [item.quantity, now, line.product_id],
      ));
    }
    statements.push(db.prepare(
      `INSERT INTO inventory_movements
         (id, product_id, variant_id, delta, reason, reference_type, reference_id, created_by, created_at)
       VALUES (?, ?, ?, ?, 'return_restock', 'order_return', ?, ?, ?)`,
      [newId("inv"), line.product_id, line.variant_id, item.quantity, returnId, adminId, now],
    ));
  }

  await db.batch(statements);
  const created = await db.first<OrderReturnRow>("SELECT * FROM order_returns WHERE id = ?", [returnId]);
  if (!created) throw new HttpError(500, "return_failed", "The return could not be recorded.");
  const items = await db.all<OrderReturnItemRow & { name: string; sku: string | null }>(
    `SELECT ri.*, oi.name, oi.sku
     FROM order_return_items ri JOIN order_items oi ON oi.id = ri.order_item_id
     WHERE ri.return_id = ?`,
    [returnId],
  );
  return { return: created, items };
}
