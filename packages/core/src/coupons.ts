import type { Database } from "@cloudcart/database";
import type { CouponRow } from "@cloudcart/database";
import { HttpError, newId, nowIso, parseMoneyInput } from "@cloudcart/shared";
import { z } from "zod";

export const couponInputSchema = z.object({
  code: z.string().trim().min(1).max(60),
  type: z.enum(["fixed", "percent"]),
  value: z.coerce.number().int().min(0).max(100_000_000),
  minSubtotal: z.string().trim().default("0"),
  startsAt: z.string().trim().nullable().optional(),
  endsAt: z.string().trim().nullable().optional(),
  maxUses: z.coerce.number().int().min(1).max(10_000_000).nullable().optional(),
  appliesTo: z.enum(["all", "products", "categories"]).default("all"),
  status: z.enum(["active", "disabled"]).default("active"),
  productIds: z.array(z.string()).max(500).default([]),
  categoryIds: z.array(z.string()).max(500).default([]),
});

export type CouponInput = z.infer<typeof couponInputSchema>;

export interface CouponLine {
  productId: string;
  lineTotalCents: number;
}

export interface CouponEvaluation {
  coupon: CouponRow | null;
  discountCents: number;
  error?: string;
}

export async function listCoupons(db: Database): Promise<CouponRow[]> {
  return db.all<CouponRow>("SELECT * FROM coupons ORDER BY created_at DESC");
}

export async function getCoupon(db: Database, id: string): Promise<CouponRow | null> {
  return db.first<CouponRow>("SELECT * FROM coupons WHERE id = ?", [id]);
}

export async function createCoupon(db: Database, input: CouponInput, currency: string): Promise<string> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,60}$/.test(code)) {
    throw new HttpError(400, "invalid_code", "Coupon codes may only contain letters, numbers, dashes and underscores.");
  }
  if (input.type === "percent" && input.value > 100) {
    throw new HttpError(400, "invalid_value", "A percentage discount cannot exceed 100%.");
  }
  if (input.value <= 0) throw new HttpError(400, "invalid_value", "Discount value must be greater than zero.");
  if (await db.exists("SELECT 1 FROM coupons WHERE code = ? COLLATE NOCASE", [code])) {
    throw new HttpError(409, "code_taken", "A coupon with this code already exists.");
  }
  const minSubtotal = parseMoneyOrZero(input.minSubtotal, currency);
  const id = newId("cpn");
  const now = nowIso();
  const statements = [
    db.prepare(
      `INSERT INTO coupons (id, code, type, value, min_subtotal_cents, starts_at, ends_at, max_uses, used_count,
         applies_to, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        id, code, input.type, input.value, minSubtotal,
        input.startsAt || null, input.endsAt || null, input.maxUses ?? null,
        input.appliesTo, input.status, now, now,
      ],
    ),
  ];
  for (const productId of input.productIds) {
    statements.push(db.prepare("INSERT OR IGNORE INTO coupon_products (coupon_id, product_id) VALUES (?, ?)", [id, productId]));
  }
  for (const categoryId of input.categoryIds) {
    statements.push(db.prepare("INSERT OR IGNORE INTO coupon_categories (coupon_id, category_id) VALUES (?, ?)", [id, categoryId]));
  }
  await db.batch(statements);
  return id;
}

export async function updateCoupon(db: Database, id: string, input: CouponInput, currency: string): Promise<void> {
  const existing = await getCoupon(db, id);
  if (!existing) throw new HttpError(404, "coupon_not_found", "Coupon not found.");
  const code = input.code.trim().toUpperCase();
  if (input.type === "percent" && input.value > 100) {
    throw new HttpError(400, "invalid_value", "A percentage discount cannot exceed 100%.");
  }
  const conflicting = await db.first<{ id: string }>(
    "SELECT id FROM coupons WHERE code = ? COLLATE NOCASE AND id <> ?",
    [code, id],
  );
  if (conflicting) throw new HttpError(409, "code_taken", "A coupon with this code already exists.");
  const statements = [
    db.prepare(
      `UPDATE coupons SET code = ?, type = ?, value = ?, min_subtotal_cents = ?, starts_at = ?, ends_at = ?,
         max_uses = ?, applies_to = ?, status = ?, updated_at = ? WHERE id = ?`,
      [
        code, input.type, input.value, parseMoneyOrZero(input.minSubtotal, currency),
        input.startsAt || null, input.endsAt || null, input.maxUses ?? null,
        input.appliesTo, input.status, nowIso(), id,
      ],
    ),
    db.prepare("DELETE FROM coupon_products WHERE coupon_id = ?", [id]),
    db.prepare("DELETE FROM coupon_categories WHERE coupon_id = ?", [id]),
  ];
  for (const productId of input.productIds) {
    statements.push(db.prepare("INSERT OR IGNORE INTO coupon_products (coupon_id, product_id) VALUES (?, ?)", [id, productId]));
  }
  for (const categoryId of input.categoryIds) {
    statements.push(db.prepare("INSERT OR IGNORE INTO coupon_categories (coupon_id, category_id) VALUES (?, ?)", [id, categoryId]));
  }
  await db.batch(statements);
}

export async function deleteCoupon(db: Database, id: string): Promise<void> {
  const result = await db.run("DELETE FROM coupons WHERE id = ?", [id]);
  if (!result.meta.changes) throw new HttpError(404, "coupon_not_found", "Coupon not found.");
}

/**
 * Validates a coupon and computes its discount against the server-side cart.
 * Scope eligibility is resolved from D1, never from client input.
 */
export async function evaluateCoupon(
  db: Database,
  code: string,
  lines: CouponLine[],
  at = new Date(),
): Promise<CouponEvaluation> {
  const coupon = await db.first<CouponRow>(
    "SELECT * FROM coupons WHERE code = ? COLLATE NOCASE LIMIT 1",
    [code.trim()],
  );
  if (!coupon) return { coupon: null, discountCents: 0, error: "This coupon code is not valid." };
  if (coupon.status !== "active") return { coupon, discountCents: 0, error: "This coupon is no longer active." };
  if (coupon.starts_at && Date.parse(coupon.starts_at) > at.getTime()) {
    return { coupon, discountCents: 0, error: "This coupon is not active yet." };
  }
  if (coupon.ends_at && Date.parse(coupon.ends_at) < at.getTime()) {
    return { coupon, discountCents: 0, error: "This coupon has expired." };
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { coupon, discountCents: 0, error: "This coupon has reached its usage limit." };
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  if (subtotal < coupon.min_subtotal_cents) {
    return {
      coupon,
      discountCents: 0,
      error: "The cart subtotal does not meet the minimum for this coupon.",
    };
  }

  let eligibleSubtotal = subtotal;
  if (coupon.applies_to === "products" || coupon.applies_to === "categories") {
    const rows = coupon.applies_to === "products"
      ? await db.all<{ product_id: string }>("SELECT product_id FROM coupon_products WHERE coupon_id = ?", [coupon.id])
      : await db.all<{ product_id: string }>(
        `SELECT pc.product_id FROM coupon_categories cc
         JOIN product_categories pc ON pc.category_id = cc.category_id
         WHERE cc.coupon_id = ?`,
        [coupon.id],
      );
    const eligible = new Set(rows.map((row) => row.product_id));
    eligibleSubtotal = lines
      .filter((line) => eligible.has(line.productId))
      .reduce((sum, line) => sum + line.lineTotalCents, 0);
    if (eligibleSubtotal <= 0) {
      return { coupon, discountCents: 0, error: "This coupon does not apply to the items in your cart." };
    }
  }

  const discount = coupon.type === "fixed"
    ? Math.min(coupon.value, eligibleSubtotal)
    : Math.min(eligibleSubtotal, Math.round((eligibleSubtotal * coupon.value) / 100));
  return { coupon, discountCents: Math.max(0, discount) };
}

function parseMoneyOrZero(value: string, currency: string): number {
  if (!value || value.trim() === "") return 0;
  try {
    return parseMoneyInput(value.replace(/,/g, ""), currency);
  } catch {
    throw new HttpError(400, "invalid_amount", "Invalid amount.");
  }
}
