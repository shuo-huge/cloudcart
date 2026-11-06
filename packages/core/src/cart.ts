import type { Database } from "@cloudcart/database";
import type { CartRow } from "@cloudcart/database";
import { HttpError, newId, nowIso, randomToken } from "@cloudcart/shared";
import { hashToken } from "@cloudcart/security";
import { evaluateCoupon } from "./coupons";
import { getShippingOptions } from "./shipping";

export const CART_COOKIE = "cc_cart";
export const MAX_LINE_QUANTITY = 9999;

export interface CartLineView {
  itemId: string;
  productId: string;
  variantId: string | null;
  variantTitle: string | null;
  name: string;
  slug: string;
  imageKey: string | null;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  stock: number;
  managedStock: boolean;
  available: boolean;
  error?: string;
}

export interface CartView {
  cartId: string;
  currency: string;
  lines: CartLineView[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  couponCode: string | null;
  couponError: string | null;
  shippingRateId: string | null;
  freeShippingThreshold: number | null;
}

interface CartLineRow {
  item_id: string;
  quantity: number;
  product_id: string;
  slug: string;
  name: string;
  price_cents: number;
  stock: number;
  manage_stock: number;
  status: string;
  currency: string;
  variant_id: string | null;
  variant_title: string | null;
  variant_price: number | null;
  variant_stock: number | null;
  variant_active: number | null;
  image_key: string | null;
}

export interface CartHandle {
  cart: CartRow;
  /** Present when a new cart/cookie was created. */
  newToken?: string;
}

export async function getOrCreateCart(
  db: Database,
  token: string | null,
  currency: string,
): Promise<CartHandle> {
  if (token) {
    const tokenHash = await hashToken(token);
    const cart = await db.first<CartRow>("SELECT * FROM carts WHERE token = ?", [tokenHash]);
    if (cart) {
      if (cart.currency !== currency) {
        await db.run("UPDATE carts SET currency = ?, updated_at = ? WHERE id = ?", [currency, nowIso(), cart.id]);
        cart.currency = currency;
      }
      return { cart };
    }
  }
  const newToken = randomToken(32);
  const tokenHash = await hashToken(newToken);
  const now = nowIso();
  const id = newId("cart");
  await db.run(
    "INSERT INTO carts (id, token, customer_id, currency, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)",
    [id, tokenHash, currency, now, now],
  );
  return {
    cart: {
      id, token: tokenHash, customer_id: null, currency,
      coupon_code: null, shipping_rate_id: null,
      created_at: now, updated_at: now,
    },
    newToken,
  };
}

export async function loadCart(
  db: Database,
  cart: CartRow,
  options: { country?: string; shippingRateId?: string | null; includeShipping?: boolean } = {},
): Promise<CartView> {
  const rows = await db.all<CartLineRow>(
    `SELECT ci.id AS item_id, ci.quantity,
            p.id AS product_id, p.slug, p.name, p.price_cents, p.stock, p.manage_stock, p.status, p.currency,
            v.id AS variant_id, v.title AS variant_title, v.price_cents AS variant_price,
            v.stock AS variant_stock, v.active AS variant_active,
            (SELECT r2_key FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position LIMIT 1) AS image_key
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN product_variants v ON v.id = ci.variant_id
     WHERE ci.cart_id = ?
     ORDER BY ci.created_at, ci.id`,
    [cart.id],
  );

  const lines: CartLineView[] = rows.map((row) => {
    const unitPrice = row.variant_id !== null ? (row.variant_price ?? row.price_cents) : row.price_cents;
    const stock = row.variant_id !== null ? (row.variant_stock ?? 0) : (row.manage_stock ? row.stock : MAX_LINE_QUANTITY);
    const available = row.status === "active" &&
      (row.variant_id === null || row.variant_active === 1) &&
      (row.manage_stock === 0 || stock >= row.quantity);
    return {
      itemId: row.item_id,
      productId: row.product_id,
      variantId: row.variant_id,
      variantTitle: row.variant_title,
      name: row.name,
      slug: row.slug,
      imageKey: row.image_key,
      unitPriceCents: unitPrice,
      quantity: row.quantity,
      totalCents: unitPrice * row.quantity,
      stock,
      managedStock: row.variant_id !== null || row.manage_stock === 1,
      available,
      error: available ? undefined : (row.status !== "active" ? "This product is no longer available." : "Not enough stock."),
    };
  });

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  let discountCents = 0;
  let couponError: string | null = null;
  if (cart.coupon_code) {
    const evaluation = await evaluateCoupon(
      db,
      cart.coupon_code,
      lines.map((line) => ({ productId: line.productId, lineTotalCents: line.totalCents })),
    );
    discountCents = evaluation.discountCents;
    couponError = evaluation.error ?? null;
  }

  let shippingCents = 0;
  let freeShippingThreshold: number | null = null;
  if (options.includeShipping !== false && subtotalCents > 0) {
    const country = options.country || "";
    const optionsList = await getShippingOptions(db, country, subtotalCents);
    const chosen = (options.shippingRateId
      ? optionsList.find((option) => option.id === options.shippingRateId)
      : undefined) ?? optionsList[0];
    if (chosen) {
      shippingCents = chosen.priceCents;
    }
    const zone = optionsList[0];
    if (zone) {
      const rate = await db.first<{ free_over_cents: number | null }>(
        "SELECT free_over_cents FROM shipping_rates WHERE id = ?",
        [zone.id],
      );
      freeShippingThreshold = rate?.free_over_cents ?? null;
    }
  }

  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

  return {
    cartId: cart.id,
    currency: cart.currency,
    lines,
    itemCount,
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents,
    couponCode: cart.coupon_code,
    couponError,
    shippingRateId: cart.shipping_rate_id,
    freeShippingThreshold,
  };
}

export async function addCartItem(
  db: Database,
  cart: CartRow,
  input: { productId: string; variantId?: string | null; quantity: number },
): Promise<void> {
  const quantity = Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.trunc(input.quantity)));
  const product = await db.first<{ id: string; stock: number; manage_stock: number; status: string }>(
    "SELECT id, stock, manage_stock, status FROM products WHERE id = ?",
    [input.productId],
  );
  if (!product || product.status !== "active") {
    throw new HttpError(404, "product_not_found", "This product is not available.");
  }

  let available = product.manage_stock ? product.stock : MAX_LINE_QUANTITY;
  if (input.variantId) {
    const variant = await db.first<{ id: string; stock: number; active: number }>(
      "SELECT id, stock, active FROM product_variants WHERE id = ? AND product_id = ?",
      [input.variantId, input.productId],
    );
    if (!variant || variant.active !== 1) {
      throw new HttpError(400, "invalid_variant", "This product option is not available.");
    }
    available = variant.stock;
  }
  if (available <= 0) throw new HttpError(409, "out_of_stock", "This item is out of stock.");

  const existing = await db.first<{ id: string; quantity: number }>(
    "SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id IS ?",
    [cart.id, input.productId, input.variantId ?? null],
  );
  const nextQuantity = Math.min(available, (existing?.quantity ?? 0) + quantity);
  const now = nowIso();
  if (existing) {
    await db.run("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?", [nextQuantity, now, existing.id]);
  } else {
    await db.run(
      `INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId("ci"), cart.id, input.productId, input.variantId ?? null, nextQuantity, now, now],
    );
  }
  await db.run("UPDATE carts SET updated_at = ? WHERE id = ?", [now, cart.id]);
}

export async function updateCartItem(
  db: Database,
  cart: CartRow,
  itemId: string,
  quantity: number,
): Promise<void> {
  const item = await db.first<{ id: string; product_id: string; variant_id: string | null }>(
    "SELECT id, product_id, variant_id FROM cart_items WHERE id = ? AND cart_id = ?",
    [itemId, cart.id],
  );
  if (!item) throw new HttpError(404, "item_not_found", "Cart item not found.");
  if (quantity <= 0) {
    await db.run("DELETE FROM cart_items WHERE id = ?", [itemId]);
    return;
  }
  const product = await db.first<{ stock: number; manage_stock: number }>(
    "SELECT stock, manage_stock FROM products WHERE id = ?",
    [item.product_id],
  );
  let available = product?.manage_stock ? (product?.stock ?? 0) : MAX_LINE_QUANTITY;
  if (item.variant_id) {
    const variant = await db.first<{ stock: number }>("SELECT stock FROM product_variants WHERE id = ?", [item.variant_id]);
    available = variant?.stock ?? 0;
  }
  const next = Math.min(available, Math.max(1, Math.trunc(quantity)));
  await db.run("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?", [next, nowIso(), itemId]);
}

export async function removeCartItem(db: Database, cart: CartRow, itemId: string): Promise<void> {
  await db.run("DELETE FROM cart_items WHERE id = ? AND cart_id = ?", [itemId, cart.id]);
}

export async function applyCouponToCart(db: Database, cart: CartRow, code: string | null): Promise<void> {
  if (!code || code.trim() === "") {
    await db.run("UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?", [nowIso(), cart.id]);
    cart.coupon_code = null;
    return;
  }
  const view = await loadCart(db, cart, { includeShipping: false });
  const evaluation = await evaluateCoupon(
    db,
    code,
    view.lines.map((line) => ({ productId: line.productId, lineTotalCents: line.totalCents })),
  );
  if (evaluation.error) throw new HttpError(400, "invalid_coupon", evaluation.error);
  await db.run("UPDATE carts SET coupon_code = ?, updated_at = ? WHERE id = ?", [code.trim().toUpperCase(), nowIso(), cart.id]);
  cart.coupon_code = code.trim().toUpperCase();
}

export async function countCartItemsByToken(db: Database, token: string | null): Promise<number> {
  if (!token) return 0;
  const tokenHash = await hashToken(token);
  const row = await db.first<{ count: number }>(
    `SELECT COALESCE(SUM(ci.quantity), 0) AS count
     FROM carts c LEFT JOIN cart_items ci ON ci.cart_id = c.id
     WHERE c.token = ?`,
    [tokenHash],
  );
  return Number(row?.count ?? 0);
}

export async function cartItemCount(db: Database, cartId: string | null): Promise<number> {
  if (!cartId) return 0;
  const row = await db.first<{ count: number }>(
    "SELECT COALESCE(SUM(quantity), 0) AS count FROM cart_items WHERE cart_id = ?",
    [cartId],
  );
  return Number(row?.count ?? 0);
}

export async function clearCart(db: Database, cartId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM cart_items WHERE cart_id = ?", [cartId]),
    db.prepare("DELETE FROM carts WHERE id = ?", [cartId]),
  ]);
}
