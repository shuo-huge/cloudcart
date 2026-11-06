import type { Database } from "@cloudcart/database";

export interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
  salesTotalCents: number;
  currency: string;
  productCount: number;
  customerCount: number;
  pendingReviews: number;
  recentOrders: Array<Record<string, unknown>>;
  topProducts: Array<Record<string, unknown>>;
}

export async function getDashboardStats(db: Database, currency: string): Promise<DashboardStats> {
  const [counts, recent, top, products, customers, pending, pendingPayment] = await db.batch([
    db.prepare(
      `SELECT
         COUNT(*) AS total_orders,
         COALESCE(SUM(CASE WHEN status IN ('draft','pending_payment','awaiting_manual_payment','paid','processing') THEN 1 ELSE 0 END), 0) AS pending_orders,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid_orders,
         COALESCE(SUM(CASE WHEN payment_status IN ('paid','partially_refunded','refunded') THEN total_cents - refunded_cents ELSE 0 END), 0) AS sales_total
       FROM orders`,
    ),
    db.prepare(
      `SELECT o.id, o.order_number, o.status, o.payment_status, o.total_cents, o.currency, o.email, o.created_at,
              c.name AS customer_name
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC LIMIT 8`,
    ),
    db.prepare(
      `SELECT oi.product_id, oi.name, SUM(oi.quantity) AS quantity, SUM(oi.total_cents) AS revenue_cents
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.payment_status IN ('paid','partially_refunded')
       GROUP BY oi.product_id, oi.name ORDER BY revenue_cents DESC LIMIT 5`,
    ),
    db.prepare("SELECT COUNT(*) AS count FROM products"),
    db.prepare("SELECT COUNT(*) AS count FROM customers"),
    db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('awaiting_manual_payment','pending_payment')"),
    db.prepare("SELECT COUNT(*) AS count FROM orders WHERE payment_status = 'unpaid'"),
  ]);
  const countRow = (counts?.results?.[0] ?? {}) as Record<string, number>;
  return {
    totalOrders: Number(countRow.total_orders ?? 0),
    pendingOrders: Number((pending?.results?.[0] as { count?: number } | undefined)?.count ?? countRow.pending_orders ?? 0),
    paidOrders: Number(countRow.paid_orders ?? 0),
    salesTotalCents: Number(countRow.sales_total ?? 0),
    currency,
    productCount: Number((products?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
    customerCount: Number((customers?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
    pendingReviews: Number((pendingPayment?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
    recentOrders: (recent?.results ?? []) as Array<Record<string, unknown>>,
    topProducts: (top?.results ?? []) as Array<Record<string, unknown>>,
  };
}
