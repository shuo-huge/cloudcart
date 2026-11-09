import type { Database } from "@cloudcart/database";
import type { ProductImageRow, ProductRow, ProductVariantRow } from "@cloudcart/database";
import {
  HttpError,
  newId,
  newSlugSuffix,
  nowIso,
  parseMoneyInput,
  slugify,
  type ProductStatus,
  type ProductType,
} from "@cloudcart/shared";
import { z } from "zod";

export const variantInputSchema = z.object({
  id: z.string().max(120).optional(),
  title: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(100).nullable().optional(),
  price: z.string().trim(),
  compareAtPrice: z.string().trim().nullable().optional(),
  stock: z.coerce.number().int().min(0).max(10_000_000).default(0),
  options: z.record(z.string(), z.string().max(120)).default({}),
  active: z.boolean().default(true),
});

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(200_000).default(""),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  type: z.enum(["simple", "variable"]).default("simple"),
  price: z.string().trim(),
  compareAtPrice: z.string().trim().nullable().optional(),
  sku: z.string().trim().max(100).nullable().optional(),
  stock: z.coerce.number().int().min(0).max(10_000_000).default(0),
  manageStock: z.boolean().default(true),
  featured: z.boolean().default(false),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(400).nullable().optional(),
  categoryIds: z.array(z.string().max(120)).max(50).default([]),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
  variants: z.array(variantInputSchema).max(100).default([]),
  imageIds: z.array(z.string().max(120)).max(50).optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export interface AdminProduct extends ProductRow {
  images: ProductImageRow[];
  variants: ProductVariantRow[];
  category_ids: string[];
  tags: string[];
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  image_key: string | null;
  image_alt: string;
  stock: number;
  manage_stock: number;
  featured: number;
  tags: string[];
  seo_title?: string | null;
  seo_description?: string | null;
}

export interface ProductListQuery {
  page: number;
  perPage: number;
  search?: string;
  status?: string;
  featured?: boolean;
  sort?: string;
  categorySlug?: string;
  includeAll?: boolean;
}

export async function ensureUniqueProductSlug(db: Database, desired: string, excludeId?: string): Promise<string> {
  const base = slugify(desired) || `product-${newSlugSuffix(6)}`;
  let candidate = base;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const row = await db.first<{ id: string }>(
      "SELECT id FROM products WHERE slug = ? AND (? IS NULL OR id <> ?) LIMIT 1",
      [candidate, excludeId ?? null, excludeId ?? null],
    );
    if (!row) return candidate;
    candidate = `${base}-${newSlugSuffix(4)}`;
  }
  return `${base}-${newSlugSuffix(8)}`;
}

function parseOptionalMoney(value: string | null | undefined, currency: string): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  try {
    return parseMoneyInput(value, currency);
  } catch {
    throw new HttpError(400, "invalid_price", `Invalid price: ${value}`);
  }
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 50);
}

export async function createProduct(
  db: Database,
  input: ProductInput,
  currency: string,
  adminId: string,
  ip: string | null,
): Promise<string> {
  const priceCents = parseOptionalMoney(input.price, currency);
  if (priceCents === null) throw new HttpError(400, "invalid_price", "Price is required.");
  const compareAt = parseOptionalMoney(input.compareAtPrice, currency);
  if (compareAt !== null && compareAt < priceCents) {
    throw new HttpError(400, "invalid_compare_price", "Compare-at price must be greater than or equal to the price.");
  }
  const id = newId("prd");
  const slug = await ensureUniqueProductSlug(db, input.slug || input.name);
  const now = nowIso();

  if (input.type === "variable" && input.variants.length === 0) {
    throw new HttpError(400, "variants_required", "A variable product needs at least one variant.");
  }

  const statements = [
    db.prepare(
      `INSERT INTO products (id, slug, name, description, status, type, price_cents, compare_at_price_cents,
         currency, sku, stock, manage_stock, featured, seo_title, seo_description, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, slug, input.name.trim(), input.description, input.status, input.type,
        priceCents, compareAt, currency, input.sku || null, input.stock,
        input.manageStock ? 1 : 0, input.featured ? 1 : 0,
        input.seoTitle || null, input.seoDescription || null,
        input.status === "active" ? now : null, now, now,
      ],
    ),
    ...(input.manageStock && input.stock > 0
      ? [db.prepare(
        `INSERT INTO inventory_movements (id, product_id, variant_id, delta, reason, reference_type, reference_id, created_by, created_at)
         VALUES (?, ?, NULL, ?, 'initial', 'admin', ?, ?, ?)`,
        [newId("inv"), id, input.stock, adminId, adminId, now],
      )]
      : []),
  ];

  input.variants.forEach((variant, index) => {
    statements.push(db.prepare(
      `INSERT INTO product_variants (id, product_id, title, sku, price_cents, compare_at_price_cents, stock,
         options_json, position, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId("var"), id, variant.title, variant.sku || null,
        parseOptionalMoney(variant.price, currency) ?? priceCents,
        parseOptionalMoney(variant.compareAtPrice, currency),
        variant.stock, JSON.stringify(variant.options), index, variant.active ? 1 : 0, now, now,
      ],
    ));
  });

  for (const categoryId of [...new Set(input.categoryIds)]) {
    statements.push(db.prepare(
      "INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)",
      [id, categoryId],
    ));
  }
  for (const tag of normalizeTags(input.tags)) {
    statements.push(db.prepare("INSERT INTO product_tags (product_id, tag) VALUES (?, ?)", [id, tag]));
  }
  if (input.imageIds && input.imageIds.length > 0) {
    input.imageIds.forEach((imageId, index) => {
      statements.push(db.prepare(
        "UPDATE product_images SET product_id = ?, position = ? WHERE id = ?",
        [id, index, imageId],
      ));
    });
  }

  await db.batch(statements);
  return id;
}

export async function updateProduct(
  db: Database,
  id: string,
  input: ProductInput,
  currency: string,
  adminId: string,
): Promise<void> {
  const existing = await db.first<ProductRow>("SELECT * FROM products WHERE id = ?", [id]);
  if (!existing) throw new HttpError(404, "product_not_found", "Product not found.");

  const priceCents = parseOptionalMoney(input.price, currency);
  if (priceCents === null) throw new HttpError(400, "invalid_price", "Price is required.");
  const compareAt = parseOptionalMoney(input.compareAtPrice, currency);
  if (compareAt !== null && compareAt < priceCents) {
    throw new HttpError(400, "invalid_compare_price", "Compare-at price must be greater than or equal to the price.");
  }
  const slug = input.slug && input.slug !== existing.slug
    ? await ensureUniqueProductSlug(db, input.slug, id)
    : existing.slug;
  const now = nowIso();
  const existingVariants = await db.all<ProductVariantRow>(
    "SELECT * FROM product_variants WHERE product_id = ?",
    [id],
  );

  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE products SET slug = ?, name = ?, description = ?, status = ?, type = ?, price_cents = ?,
         compare_at_price_cents = ?, currency = ?, sku = ?, stock = ?, manage_stock = ?, featured = ?,
         seo_title = ?, seo_description = ?, published_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        slug, input.name.trim(), input.description, input.status, input.type, priceCents,
        compareAt, currency, input.sku || null, input.stock, input.manageStock ? 1 : 0,
        input.featured ? 1 : 0, input.seoTitle || null, input.seoDescription || null,
        input.status === "active" ? (existing.published_at ?? now) : existing.published_at,
        now, id,
      ],
    ),
  ];

  if (existing.manage_stock !== (input.manageStock ? 1 : 0) || existing.stock !== input.stock) {
    const delta = input.stock - existing.stock;
    if (input.manageStock && delta !== 0) {
      statements.push(db.prepare(
        `INSERT INTO inventory_movements (id, product_id, variant_id, delta, reason, reference_type, reference_id, created_by, created_at)
         VALUES (?, ?, NULL, ?, 'adjustment', 'admin', ?, ?, ?)`,
        [newId("inv"), id, delta, adminId, adminId, now],
      ));
    }
  }

  const incomingVariantIds = new Set(input.variants.map((variant) => variant.id).filter(Boolean));
  for (const variant of existingVariants) {
    if (!incomingVariantIds.has(variant.id)) {
      statements.push(db.prepare("DELETE FROM product_variants WHERE id = ?", [variant.id]));
    }
  }
  input.variants.forEach((variant, index) => {
    const variantId = variant.id && existingVariants.some((v) => v.id === variant.id)
      ? variant.id
      : newId("var");
    const current = existingVariants.find((v) => v.id === variantId);
    if (current) {
      statements.push(db.prepare(
        `UPDATE product_variants SET title = ?, sku = ?, price_cents = ?, compare_at_price_cents = ?,
           stock = ?, options_json = ?, position = ?, active = ?, updated_at = ? WHERE id = ?`,
        [
          variant.title, variant.sku || null,
          parseOptionalMoney(variant.price, currency) ?? priceCents,
          parseOptionalMoney(variant.compareAtPrice, currency),
          variant.stock, JSON.stringify(variant.options), index, variant.active ? 1 : 0, now, variantId,
        ],
      ));
      if (current.stock !== variant.stock) {
        statements.push(db.prepare(
          `INSERT INTO inventory_movements (id, product_id, variant_id, delta, reason, reference_type, reference_id, created_by, created_at)
           VALUES (?, ?, ?, ?, 'adjustment', 'admin', ?, ?, ?)`,
          [newId("inv"), id, variantId, variant.stock - current.stock, adminId, adminId, now],
        ));
      }
    } else {
      statements.push(db.prepare(
        `INSERT INTO product_variants (id, product_id, title, sku, price_cents, compare_at_price_cents, stock,
           options_json, position, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          variantId, id, variant.title, variant.sku || null,
          parseOptionalMoney(variant.price, currency) ?? priceCents,
          parseOptionalMoney(variant.compareAtPrice, currency),
          variant.stock, JSON.stringify(variant.options), index, variant.active ? 1 : 0, now, now,
        ],
      ));
    }
  });

  statements.push(db.prepare("DELETE FROM product_categories WHERE product_id = ?", [id]));
  for (const categoryId of [...new Set(input.categoryIds)]) {
    statements.push(db.prepare("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)", [id, categoryId]));
  }
  statements.push(db.prepare("DELETE FROM product_tags WHERE product_id = ?", [id]));
  for (const tag of normalizeTags(input.tags)) {
    statements.push(db.prepare("INSERT INTO product_tags (product_id, tag) VALUES (?, ?)", [id, tag]));
  }

  await db.batch(statements);
}

export async function deleteProduct(db: Database, id: string): Promise<void> {
  const exists = await db.first<{ id: string }>("SELECT id FROM products WHERE id = ?", [id]);
  if (!exists) throw new HttpError(404, "product_not_found", "Product not found.");
  await db.run("DELETE FROM products WHERE id = ?", [id]);
}

export async function setProductStatus(db: Database, id: string, status: ProductStatus): Promise<void> {
  const now = nowIso();
  const result = await db.run(
    "UPDATE products SET status = ?, updated_at = ?, published_at = CASE WHEN ? = 'active' AND published_at IS NULL THEN ? ELSE published_at END WHERE id = ?",
    [status, now, status, now, id],
  );
  if (!result.meta.changes) throw new HttpError(404, "product_not_found", "Product not found.");
}

export async function getAdminProduct(db: Database, id: string): Promise<AdminProduct | null> {
  const product = await db.first<ProductRow>("SELECT * FROM products WHERE id = ?", [id]);
  if (!product) return null;
  const [images, variants, categories, tags] = await db.batch([
    db.prepare("SELECT * FROM product_images WHERE product_id = ? ORDER BY position, created_at, id", [id]),
    db.prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY position", [id]),
    db.prepare("SELECT category_id FROM product_categories WHERE product_id = ?", [id]),
    db.prepare("SELECT tag FROM product_tags WHERE product_id = ? ORDER BY tag", [id]),
  ]);
  return {
    ...product,
    images: (images?.results ?? []) as unknown as ProductImageRow[],
    variants: (variants?.results ?? []) as unknown as ProductVariantRow[],
    category_ids: ((categories?.results ?? []) as Array<{ category_id: string }>).map((r) => r.category_id),
    tags: ((tags?.results ?? []) as Array<{ tag: string }>).map((r) => r.tag),
  };
}

export interface AdminProductListItem extends ProductRow {
  image_key: string | null;
  image_alt: string | null;
  category_names: string | null;
}

export async function listAdminProducts(
  db: Database,
  query: ProductListQuery,
): Promise<{ items: AdminProductListItem[]; total: number }> {
  const conditions: string[] = [];
  const params: Array<string | number | null> = [];
  if (query.search) {
    conditions.push("(p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\')");
    const pattern = `%${query.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    params.push(pattern, pattern);
  }
  if (query.status && query.status !== "all") {
    conditions.push("p.status = ?");
    params.push(query.status);
  }
  if (query.featured !== undefined) {
    conditions.push("p.featured = ?");
    params.push(query.featured ? 1 : 0);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countStmt = db.prepare(`SELECT COUNT(*) AS count FROM products p ${where}`, params);
  const listStmt = db.prepare(
    `SELECT p.*,
       (SELECT r2_key FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at, pi.id LIMIT 1) AS image_key,
       (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at, pi.id LIMIT 1) AS image_alt,
       (SELECT GROUP_CONCAT(c.name, ', ') FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id) AS category_names
     FROM products p ${where}
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, query.perPage, (query.page - 1) * query.perPage],
  );
  const [countResult, listResult] = await db.batch([countStmt, listStmt]);
  return {
    items: (listResult?.results ?? []) as unknown as AdminProductListItem[],
    total: Number((countResult?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
  };
}

const PUBLIC_SORT: Record<string, string> = {
  newest: "p.created_at DESC",
  oldest: "p.created_at ASC",
  price_asc: "p.price_cents ASC",
  price_desc: "p.price_cents DESC",
  name: "p.name ASC",
  featured: "p.featured DESC, p.created_at DESC",
};

export async function listPublicProducts(
  db: Database,
  query: ProductListQuery,
): Promise<{ items: PublicProduct[]; total: number }> {
  const conditions: string[] = ["p.status = 'active'"];
  const params: Array<string | number | null> = [];
  if (query.search) {
    conditions.push("(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
    const pattern = `%${query.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    params.push(pattern, pattern);
  }
  if (query.featured) {
    conditions.push("p.featured = 1");
  }
  if (query.categorySlug) {
    conditions.push(
      "EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id AND c.slug = ?)",
    );
    params.push(query.categorySlug);
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const orderBy = PUBLIC_SORT[query.sort ?? "newest"] ?? PUBLIC_SORT.newest;

  const [countResult, listResult] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS count FROM products p ${where}`, params),
    db.prepare(
      `SELECT p.id, p.slug, p.name, p.description, p.price_cents, p.compare_at_price_cents, p.currency,
              p.stock, p.manage_stock, p.featured,
              (SELECT r2_key FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at, pi.id LIMIT 1) AS image_key,
              (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at, pi.id LIMIT 1) AS image_alt
       FROM products p ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, query.perPage, (query.page - 1) * query.perPage],
    ),
  ]);
  const items = (listResult?.results ?? []) as unknown as PublicProduct[];
  const ids = items.map((item) => item.id);
  if (ids.length > 0) {
    const tagRows = await db.all<{ product_id: string; tag: string }>(
      `SELECT product_id, tag FROM product_tags WHERE product_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    const byProduct = new Map<string, string[]>();
    for (const row of tagRows) {
      const list = byProduct.get(row.product_id) ?? [];
      list.push(row.tag);
      byProduct.set(row.product_id, list);
    }
    for (const item of items) item.tags = byProduct.get(item.id) ?? [];
  }
  return {
    items,
    total: Number((countResult?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
  };
}

export interface PublicProductDetail {
  product: PublicProduct;
  images: ProductImageRow[];
  variants: ProductVariantRow[];
  categories: Array<{ id: string; slug: string; name: string }>;
  related: PublicProduct[];
}

export async function getPublicProductBySlug(db: Database, slug: string): Promise<PublicProductDetail | null> {
  const product = await db.first<PublicProduct>(
    `SELECT p.id, p.slug, p.name, p.description, p.price_cents, p.compare_at_price_cents, p.currency,
            p.stock, p.manage_stock, p.featured, p.seo_title, p.seo_description,
            (SELECT r2_key FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at, pi.id LIMIT 1) AS image_key,
            (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at, pi.id LIMIT 1) AS image_alt
     FROM products p WHERE p.slug = ? AND p.status = 'active' LIMIT 1`,
    [slug],
  );
  if (!product) return null;

  const [images, variants, categories, tags] = await db.batch([
    db.prepare("SELECT * FROM product_images WHERE product_id = ? ORDER BY position, created_at, id", [product.id]),
    db.prepare("SELECT * FROM product_variants WHERE product_id = ? AND active = 1 ORDER BY position", [product.id]),
    db.prepare(
      `SELECT c.id, c.slug, c.name FROM product_categories pc JOIN categories c ON c.id = pc.category_id
       WHERE pc.product_id = ? ORDER BY c.position`,
      [product.id],
    ),
    db.prepare("SELECT tag FROM product_tags WHERE product_id = ? ORDER BY tag", [product.id]),
  ]);
  product.tags = ((tags?.results ?? []) as Array<{ tag: string }>).map((r) => r.tag);
  const categoryList = (categories?.results ?? []) as Array<{ id: string; slug: string; name: string }>;

  let related: PublicProduct[] = [];
  if (categoryList.length > 0) {
    const categoryIds = categoryList.map((c) => c.id);
    const rows = await db.all<PublicProduct>(
      `SELECT DISTINCT p.id, p.slug, p.name, p.description, p.price_cents, p.compare_at_price_cents, p.currency,
              p.stock, p.manage_stock, p.featured,
              (SELECT r2_key FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at, pi.id LIMIT 1) AS image_key,
              (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.created_at, pi.id LIMIT 1) AS image_alt
       FROM products p
       JOIN product_categories pc ON pc.product_id = p.id
       WHERE pc.category_id IN (${categoryIds.map(() => "?").join(",")})
         AND p.id <> ? AND p.status = 'active'
       ORDER BY p.featured DESC, p.created_at DESC
       LIMIT 4`,
      [...categoryIds, product.id],
    );
    related = rows;
    const relatedIds = related.map((r) => r.id);
    if (relatedIds.length > 0) {
      const tagRows = await db.all<{ product_id: string; tag: string }>(
        `SELECT product_id, tag FROM product_tags WHERE product_id IN (${relatedIds.map(() => "?").join(",")})`,
        relatedIds,
      );
      const byProduct = new Map<string, string[]>();
      for (const row of tagRows) {
        const list = byProduct.get(row.product_id) ?? [];
        list.push(row.tag);
        byProduct.set(row.product_id, list);
      }
      for (const item of related) item.tags = byProduct.get(item.id) ?? [];
    }
  }

  return {
    product,
    images: (images?.results ?? []) as unknown as ProductImageRow[],
    variants: (variants?.results ?? []) as unknown as ProductVariantRow[],
    categories: categoryList,
    related,
  };
}

export interface PublicVariant {
  id: string;
  title: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  stock: number;
  options: Record<string, string>;
}

export function toPublicVariants(rows: ProductVariantRow[]): PublicVariant[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    price_cents: row.price_cents,
    compare_at_price_cents: row.compare_at_price_cents,
    stock: row.stock,
    options: safeJson<Record<string, string>>(row.options_json, {}),
  }));
}

export function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
