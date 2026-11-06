import type { Database } from "@cloudcart/database";
import type {
  CartRow,
  OrderAddressRow,
  OrderItemRow,
  OrderRow,
  PaymentTransactionRow,
} from "@cloudcart/database";
import { constantTimeEqual, hmacSha256Base64Url, utf8 } from "@cloudcart/security";
import {
  HttpError,
  fromBase64Url,
  newId,
  newOrderNumber,
  nowIso,
  ORDER_STATUSES,
  toBase64Url,
  type OrderStatus,
} from "@cloudcart/shared";
import { z } from "zod";
import { loadCart } from "./cart";
import { resolveShippingRate } from "./shipping";

export const checkoutSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().max(120).optional().default(""),
  postalCode: z.string().trim().min(1).max(30),
  country: z.string().trim().length(2).transform((v) => v.toUpperCase()),
  shippingRateId: z.string().trim().max(120).optional().nullable(),
  paymentMethod: z.string().trim().max(60).default("manual"),
  couponCode: z.string().trim().max(60).optional().default(""),
  customerNote: z.string().trim().max(2000).optional().default(""),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface CreatedOrder {
  order: OrderRow;
  accessToken: string;
  redirectUrl: string;
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["pending_payment", "awaiting_manual_payment", "cancelled"],
  pending_payment: ["paid", "awaiting_manual_payment", "cancelled"],
  awaiting_manual_payment: ["paid", "cancelled"],
  paid: ["processing", "shipped", "completed", "cancelled", "refunded", "partially_refunded"],
  processing: ["shipped", "completed", "cancelled", "refunded", "partially_refunded"],
  shipped: ["completed", "refunded", "partially_refunded"],
  completed: ["refunded", "partially_refunded"],
  cancelled: [],
  refunded: [],
  partially_refunded: ["refunded"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createOrderAccessToken(masterKey: string, orderId: string): Promise<string> {
  const encoded = toBase64Url(utf8(orderId));
  const signature = await hmacSha256Base64Url(masterKey, orderId, "cloudcart:order-access:v1");
  return `${encoded}.${signature}`;
}

export async function parseOrderAccessToken(masterKey: string, token: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  let orderId: string;
  try {
    orderId = new TextDecoder().decode(fromBase64Url(parts[0]!));
  } catch {
    return null;
  }
  const expected = await hmacSha256Base64Url(masterKey, orderId, "cloudcart:order-access:v1");
  return constantTimeEqual(expected, parts[1]!) ? orderId : null;
}

interface CheckoutContext {
  db: Database;
  cart: CartRow;
  input: CheckoutInput;
  masterKey: string;
  ip: string | null;
  userAgent: string | null;
}

interface StockUpdate {
  productId: string;
  variantId: string | null;
  quantity: number;
  name: string;
  statement: D1PreparedStatement;
}

export async function createOrderFromCart(ctx: CheckoutContext): Promise<CreatedOrder> {
  const { db, cart, input } = ctx;
  const view = await loadCart(db, cart, {
    country: input.country,
    shippingRateId: input.shippingRateId ?? cart.shipping_rate_id,
    includeShipping: true,
  });

  if (view.lines.length === 0) {
    throw new HttpError(400, "empty_cart", "Your cart is empty.");
  }
  const unavailable = view.lines.find((line) => !line.available);
  if (unavailable) {
    throw new HttpError(409, "line_unavailable", `${unavailable.name}: ${unavailable.error ?? "not available"}`);
  }
  if (view.couponError) {
    throw new HttpError(400, "invalid_coupon", view.couponError);
  }

  const shipping = await resolveShippingRate(
    db,
    input.shippingRateId ?? cart.shipping_rate_id,
    input.country,
    view.subtotalCents,
  );
  const totalCents = Math.max(0, view.subtotalCents - view.discountCents + shipping.priceCents);

  const now = nowIso();
  const customerId = await upsertCustomer(db, input, now);
  const orderId = newId("ord");
  const orderNumber = newOrderNumber();
  const isManual = input.paymentMethod === "manual";
  const status: OrderStatus = isManual ? "awaiting_manual_payment" : "pending_payment";
  const paymentStatus = isManual ? "pending" : "unpaid";

  // Reserve the coupon first so a race cannot exceed max_uses. The reservation
  // is released if stock reservation or order persistence fails.
  let coupon: { id: string } | null = null;
  if (view.couponCode) {
    coupon = await db.first<{ id: string }>(
      "SELECT id FROM coupons WHERE code = ? COLLATE NOCASE",
      [view.couponCode],
    );
    if (!coupon) throw new HttpError(400, "invalid_coupon", "This coupon is no longer valid.");
    const reserved = await db.run(
      `UPDATE coupons SET used_count = used_count + 1, updated_at = ?
       WHERE id = ? AND status = 'active' AND (max_uses IS NULL OR used_count < max_uses)`,
      [now, coupon.id],
    );
    if (!reserved.meta.changes) {
      throw new HttpError(409, "coupon_exhausted", "This coupon has reached its usage limit.");
    }
  }

  const releaseCoupon = async (): Promise<void> => {
    if (!coupon) return;
    await db.run("UPDATE coupons SET used_count = MAX(0, used_count - 1), updated_at = ? WHERE id = ?", [nowIso(), coupon.id]);
  };

  // Phase 1: reserve stock. Only products with stock management enabled are
  // decremented; conditional updates prevent overselling across requests.
  const stockUpdates: StockUpdate[] = [];
  for (const line of view.lines) {
    if (!line.managedStock) continue;
    stockUpdates.push({
      statement: line.variantId
        ? db.prepare(
          "UPDATE product_variants SET stock = stock - ?, updated_at = ? WHERE id = ? AND product_id = ? AND active = 1 AND stock >= ?",
          [line.quantity, now, line.variantId, line.productId, line.quantity],
        )
        : db.prepare(
          "UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND manage_stock = 1 AND stock >= ?",
          [line.quantity, now, line.productId, line.quantity],
        ),
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
      name: line.name,
    });
  }

  const stockResults = await db.batch(stockUpdates.map((update) => update.statement));
  const failedIndex = stockResults.findIndex((result) => Number(result.meta.changes ?? 0) < 1);
  if (failedIndex !== -1) {
    const succeeded = stockUpdates.filter((_, index) => Number(stockResults[index]?.meta.changes ?? 0) > 0);
    await compensateStock(db, succeeded, nowIso());
    await releaseCoupon();
    throw new HttpError(
      409,
      "out_of_stock",
      `${stockUpdates[failedIndex]!.name} does not have enough stock. Please update your cart.`,
    );
  }

  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO orders (id, order_number, status, payment_status, customer_id, email, phone, currency,
         subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, refunded_cents,
         coupon_code, payment_method, shipping_method, shipping_rate_id, customer_note, internal_note,
         ip, user_agent, metadata_json, created_at, updated_at, paid_at, cancelled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, NULL, ?, ?, '{}', ?, ?, NULL, NULL)`,
      [
        orderId, orderNumber, status, paymentStatus, customerId, input.email.toLowerCase(), input.phone || null,
        view.currency, view.subtotalCents, view.discountCents, shipping.priceCents, totalCents,
        view.couponCode, input.paymentMethod, shipping.name, shipping.id,
        input.customerNote || null, ctx.ip, ctx.userAgent, now, now,
      ],
    ),
  ];

  for (const line of view.lines) {
    statements.push(db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, variant_id, name, sku, unit_price_cents, quantity,
         total_cents, options_json, image_key, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, '{}',
         (SELECT r2_key FROM product_images pi WHERE pi.product_id = ? ORDER BY pi.position LIMIT 1), ?)`,
      [
        newId("oi"), orderId, line.productId, line.variantId, line.name,
        line.unitPriceCents, line.quantity, line.totalCents, line.productId, now,
      ],
    ));
    if (line.managedStock) {
      statements.push(db.prepare(
        `INSERT INTO inventory_movements (id, product_id, variant_id, delta, reason, reference_type, reference_id, created_by, created_at)
         VALUES (?, ?, ?, ?, 'sale', 'order', ?, NULL, ?)`,
        [newId("inv"), line.productId, line.variantId, -line.quantity, orderId, now],
      ));
    }
  }

  statements.push(db.prepare(
    `INSERT INTO order_addresses (id, order_id, type, name, line1, line2, city, state, postal_code, country, phone, email)
     VALUES (?, ?, 'shipping', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId("addr"), orderId, input.name, input.line1, input.line2 || null, input.city,
      input.state || null, input.postalCode, input.country, input.phone || null, input.email.toLowerCase(),
    ],
  ));
  statements.push(db.prepare(
    `INSERT INTO order_addresses (id, order_id, type, name, line1, line2, city, state, postal_code, country, phone, email)
     VALUES (?, ?, 'billing', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId("addr"), orderId, input.name, input.line1, input.line2 || null, input.city,
      input.state || null, input.postalCode, input.country, input.phone || null, input.email.toLowerCase(),
    ],
  ));

  if (coupon) {
    statements.push(db.prepare(
      `INSERT INTO coupon_redemptions (id, coupon_id, order_id, customer_email, amount_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId("red"), coupon.id, orderId, input.email.toLowerCase(), view.discountCents, now],
    ));
  }

  statements.push(db.prepare(
    "UPDATE customers SET orders_count = orders_count + 1, total_spent_cents = total_spent_cents + ?, updated_at = ? WHERE id = ?",
    [totalCents, now, customerId],
  ));
  statements.push(db.prepare("DELETE FROM cart_items WHERE cart_id = ?", [cart.id]));
  statements.push(db.prepare("DELETE FROM carts WHERE id = ?", [cart.id]));

  try {
    await db.batch(statements);
  } catch {
    await compensateStock(db, stockUpdates, nowIso());
    await releaseCoupon();
    throw new HttpError(500, "order_failed", "The order could not be created. Please try again.");
  }

  const accessToken = await createOrderAccessToken(ctx.masterKey, orderId);
  const order = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) throw new HttpError(500, "order_failed", "The order could not be created.");
  return { order, accessToken, redirectUrl: `/orders/${accessToken}` };
}

async function compensateStock(db: Database, updates: StockUpdate[], now: string): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  for (const update of updates) {
    if (update.variantId) {
      statements.push(db.prepare(
        "UPDATE product_variants SET stock = stock + ?, updated_at = ? WHERE id = ?",
        [update.quantity, now, update.variantId],
      ));
    } else {
      statements.push(db.prepare(
        "UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ? AND manage_stock = 1",
        [update.quantity, now, update.productId],
      ));
    }
  }
  if (statements.length > 0) await db.batch(statements);
}

async function upsertCustomer(db: Database, input: CheckoutInput, now: string): Promise<string> {
  const email = input.email.toLowerCase();
  const existing = await db.first<{ id: string }>("SELECT id FROM customers WHERE email = ? COLLATE NOCASE", [email]);
  if (existing) {
    await db.run(
      "UPDATE customers SET name = ?, phone = ?, updated_at = ? WHERE id = ?",
      [input.name, input.phone || null, now, existing.id],
    );
    const address = await db.first<{ id: string }>(
      "SELECT id FROM customer_addresses WHERE customer_id = ? AND line1 = ? AND city = ? AND postal_code = ? LIMIT 1",
      [existing.id, input.line1, input.city, input.postalCode],
    );
    if (!address) {
      await db.run(
        `INSERT INTO customer_addresses (id, customer_id, name, line1, line2, city, state, postal_code, country, phone, is_default, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [newId("caddr"), existing.id, input.name, input.line1, input.line2 || null, input.city,
          input.state || null, input.postalCode, input.country, input.phone || null, now],
      );
    }
    return existing.id;
  }
  const id = newId("cus");
  await db.batch([
    db.prepare(
      `INSERT INTO customers (id, email, name, phone, notes, orders_count, total_spent_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', 0, 0, ?, ?)`,
      [id, email, input.name, input.phone || null, now, now],
    ),
    db.prepare(
      `INSERT INTO customer_addresses (id, customer_id, name, line1, line2, city, state, postal_code, country, phone, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [newId("caddr"), id, input.name, input.line1, input.line2 || null, input.city,
        input.state || null, input.postalCode, input.country, input.phone || null, now],
    ),
  ]);
  return id;
}

export interface OrderDetail {
  order: OrderRow;
  items: OrderItemRow[];
  addresses: OrderAddressRow[];
  transactions: PaymentTransactionRow[];
}

export async function getOrderDetail(db: Database, orderId: string): Promise<OrderDetail | null> {
  const order = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return null;
  const [items, addresses, transactions] = await db.batch([
    db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at, id", [orderId]),
    db.prepare("SELECT * FROM order_addresses WHERE order_id = ?", [orderId]),
    db.prepare("SELECT * FROM payment_transactions WHERE order_id = ? ORDER BY created_at DESC", [orderId]),
  ]);
  return {
    order,
    items: (items?.results ?? []) as unknown as OrderItemRow[],
    addresses: (addresses?.results ?? []) as unknown as OrderAddressRow[],
    transactions: (transactions?.results ?? []) as unknown as PaymentTransactionRow[],
  };
}

export async function getOrderDetailByNumber(db: Database, orderNumber: string): Promise<OrderDetail | null> {
  const order = await db.first<OrderRow>("SELECT * FROM orders WHERE order_number = ?", [orderNumber]);
  if (!order) return null;
  return getOrderDetail(db, order.id);
}

export async function getOrderByAccessToken(
  db: Database,
  masterKey: string,
  token: string,
): Promise<OrderDetail | null> {
  const orderId = await parseOrderAccessToken(masterKey, token);
  if (!orderId) return null;
  return getOrderDetail(db, orderId);
}

export async function listOrders(
  db: Database,
  query: { page: number; perPage: number; status?: string; search?: string; paymentStatus?: string },
): Promise<{ items: Array<OrderRow & { customer_name: string | null }>; total: number }> {
  const conditions: string[] = [];
  const params: Array<string | number | null> = [];
  if (query.status && query.status !== "all") {
    conditions.push("o.status = ?");
    params.push(query.status);
  }
  if (query.paymentStatus && query.paymentStatus !== "all") {
    conditions.push("o.payment_status = ?");
    params.push(query.paymentStatus);
  }
  if (query.search) {
    conditions.push("(o.order_number LIKE ? ESCAPE '\\' OR o.email LIKE ? ESCAPE '\\')");
    const pattern = `%${query.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    params.push(pattern, pattern);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const [count, list] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS count FROM orders o ${where}`, params),
    db.prepare(
      `SELECT o.*, c.name AS customer_name FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, query.perPage, (query.page - 1) * query.perPage],
    ),
  ]);
  return {
    items: (list?.results ?? []) as unknown as Array<OrderRow & { customer_name: string | null }>,
    total: Number((count?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
  };
}

export async function updateOrderStatus(
  db: Database,
  orderId: string,
  nextStatus: OrderStatus,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const order = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status === nextStatus) return { ok: true };
  if (!(ORDER_STATUSES as readonly string[]).includes(nextStatus)) {
    return { ok: false, message: "Unknown order status." };
  }
  if (nextStatus === "paid" && order.payment_method !== "manual") {
    return { ok: false, message: "This order must be marked paid by a verified payment webhook." };
  }
  if (!canTransition(order.status, nextStatus)) {
    return { ok: false, message: `Cannot change an order from ${order.status} to ${nextStatus}.` };
  }
  const now = nowIso();
  await db.run(
    `UPDATE orders SET status = ?, updated_at = ?,
       payment_status = CASE WHEN ? = 'paid' THEN 'paid' ELSE payment_status END,
       paid_at = CASE WHEN ? = 'paid' AND paid_at IS NULL THEN ? ELSE paid_at END,
       cancelled_at = CASE WHEN ? = 'cancelled' AND cancelled_at IS NULL THEN ? ELSE cancelled_at END
     WHERE id = ?`,
    [nextStatus, now, nextStatus, nextStatus, now, nextStatus, now, orderId],
  );
  return { ok: true };
}

export async function confirmManualPayment(
  db: Database,
  orderId: string,
  adminId: string,
  note: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const order = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return { ok: false, message: "Order not found." };
  if (order.payment_method !== "manual") {
    return { ok: false, message: "Only manual payments can be confirmed by an administrator." };
  }
  if (order.payment_status === "paid") return { ok: true };
  if (order.status === "cancelled" || order.status === "refunded") {
    return { ok: false, message: "This order can no longer accept payment." };
  }
  const now = nowIso();
  await db.batch([
    db.prepare(
      "UPDATE orders SET payment_status = 'paid', status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?",
      [now, now, orderId],
    ),
    db.prepare(
      `INSERT INTO payment_transactions (id, order_id, plugin_id, provider_id, status, amount_cents, currency,
         provider_status, metadata_json, created_at, updated_at, paid_at)
       VALUES (?, ?, 'manual', ?, 'succeeded', ?, ?, 'manually_confirmed', ?, ?, ?, ?)`,
      [
        newId("txn"), orderId, `manual-${orderId}`, order.total_cents, order.currency,
        JSON.stringify({ confirmedBy: adminId, note: note ?? "" }), now, now, now,
      ],
    ),
  ]);
  return { ok: true };
}

export async function addOrderInternalNote(db: Database, orderId: string, note: string): Promise<void> {
  const order = await db.first<{ internal_note: string | null }>("SELECT internal_note FROM orders WHERE id = ?", [orderId]);
  if (!order) throw new HttpError(404, "order_not_found", "Order not found.");
  const timestamp = nowIso();
  const line = `[${timestamp}] ${note.trim()}`;
  const combined = order.internal_note ? `${order.internal_note}\n${line}` : line;
  await db.run("UPDATE orders SET internal_note = ?, updated_at = ? WHERE id = ?", [combined, timestamp, orderId]);
}

export async function cancelOrderAndRestock(db: Database, orderId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const detail = await getOrderDetail(db, orderId);
  if (!detail) return { ok: false, message: "Order not found." };
  if (["shipped", "completed", "refunded"].includes(detail.order.status)) {
    return { ok: false, message: "A shipped or completed order cannot be cancelled." };
  }
  if (detail.order.status === "cancelled") return { ok: true };
  const now = nowIso();
  const statements: D1PreparedStatement[] = [];
  for (const item of detail.items) {
    if (item.variant_id) {
      statements.push(db.prepare(
        "UPDATE product_variants SET stock = stock + ?, updated_at = ? WHERE id = ?",
        [item.quantity, now, item.variant_id],
      ));
    } else {
      statements.push(db.prepare(
        "UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ? AND manage_stock = 1",
        [item.quantity, now, item.product_id],
      ));
    }
    statements.push(db.prepare(
      `INSERT INTO inventory_movements (id, product_id, variant_id, delta, reason, reference_type, reference_id, created_by, created_at)
       VALUES (?, ?, ?, ?, 'restock', 'order', ?, NULL, ?)`,
      [newId("inv"), item.product_id, item.variant_id, item.quantity, orderId, now],
    ));
  }
  statements.push(db.prepare(
    "UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?",
    [now, now, orderId],
  ));
  await db.batch(statements);
  return { ok: true };
}

export async function recordManualRefund(
  db: Database,
  orderId: string,
  amountCents: number,
  adminId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const order = await db.first<OrderRow>("SELECT * FROM orders WHERE id = ?", [orderId]);
  if (!order) return { ok: false, message: "Order not found." };
  if (amountCents <= 0 || amountCents > order.total_cents - order.refunded_cents) {
    return { ok: false, message: "Refund amount is invalid." };
  }
  const refunded = order.refunded_cents + amountCents;
  const fullyRefunded = refunded >= order.total_cents;
  const now = nowIso();
  await db.batch([
    db.prepare(
      "UPDATE orders SET refunded_cents = ?, payment_status = ?, status = ?, updated_at = ? WHERE id = ?",
      [refunded, fullyRefunded ? "refunded" : "partially_refunded",
        fullyRefunded ? "refunded" : "partially_refunded", now, orderId],
    ),
    db.prepare(
      `INSERT INTO payment_transactions (id, order_id, plugin_id, provider_id, status, amount_cents, currency,
         provider_status, metadata_json, created_at, updated_at, paid_at)
       VALUES (?, ?, ?, ?, 'refunded', ?, ?, 'manual_refund', ?, ?, ?, ?)`,
      [
        newId("txn"), orderId, order.payment_method ?? "manual", `refund-${orderId}-${Date.now()}`,
        amountCents, order.currency, JSON.stringify({ refundedBy: adminId }), now, now, now,
      ],
    ),
  ]);
  return { ok: true };
}
