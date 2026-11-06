import type { Database } from "@cloudcart/database";
import type { CategoryRow } from "@cloudcart/database";
import { HttpError, newId, newSlugSuffix, nowIso, slugify } from "@cloudcart/shared";
import { z } from "zod";

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(20_000).default(""),
  parentId: z.string().max(120).nullable().optional(),
  position: z.coerce.number().int().min(0).max(9999).default(0),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(400).nullable().optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

async function uniqueSlug(db: Database, desired: string, excludeId?: string): Promise<string> {
  const base = slugify(desired) || `category-${newSlugSuffix(6)}`;
  let candidate = base;
  for (let i = 0; i < 10; i += 1) {
    const row = await db.first<{ id: string }>(
      "SELECT id FROM categories WHERE slug = ? AND (? IS NULL OR id <> ?)",
      [candidate, excludeId ?? null, excludeId ?? null],
    );
    if (!row) return candidate;
    candidate = `${base}-${newSlugSuffix(4)}`;
  }
  return `${base}-${newSlugSuffix(8)}`;
}

export async function listCategories(db: Database): Promise<Array<CategoryRow & { product_count: number }>> {
  return db.all<CategoryRow & { product_count: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM product_categories pc JOIN products p ON p.id = pc.product_id
       WHERE pc.category_id = c.id AND p.status = 'active') AS product_count
     FROM categories c ORDER BY c.position, c.name`,
  );
}

export async function getCategory(db: Database, id: string): Promise<CategoryRow | null> {
  return db.first<CategoryRow>("SELECT * FROM categories WHERE id = ?", [id]);
}

export async function createCategory(db: Database, input: CategoryInput): Promise<string> {
  if (input.parentId) {
    const parent = await db.first<{ id: string }>("SELECT id FROM categories WHERE id = ?", [input.parentId]);
    if (!parent) throw new HttpError(400, "invalid_parent", "Parent category does not exist.");
  }
  const id = newId("cat");
  const slug = await uniqueSlug(db, input.slug || input.name);
  const now = nowIso();
  await db.run(
    `INSERT INTO categories (id, slug, name, description, parent_id, position, seo_title, seo_description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, slug, input.name.trim(), input.description, input.parentId || null, input.position, input.seoTitle || null, input.seoDescription || null, now, now],
  );
  return id;
}

export async function updateCategory(db: Database, id: string, input: CategoryInput): Promise<void> {
  const existing = await getCategory(db, id);
  if (!existing) throw new HttpError(404, "category_not_found", "Category not found.");
  if (input.parentId === id) throw new HttpError(400, "invalid_parent", "A category cannot be its own parent.");
  if (input.parentId) {
    const parent = await db.first<{ id: string }>("SELECT id FROM categories WHERE id = ?", [input.parentId]);
    if (!parent) throw new HttpError(400, "invalid_parent", "Parent category does not exist.");
  }
  const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(db, input.slug, id) : existing.slug;
  await db.run(
    `UPDATE categories SET slug = ?, name = ?, description = ?, parent_id = ?, position = ?,
       seo_title = ?, seo_description = ?, updated_at = ? WHERE id = ?`,
    [slug, input.name.trim(), input.description, input.parentId || null, input.position, input.seoTitle || null, input.seoDescription || null, nowIso(), id],
  );
}

export async function deleteCategory(db: Database, id: string): Promise<void> {
  const result = await db.run("DELETE FROM categories WHERE id = ?", [id]);
  if (!result.meta.changes) throw new HttpError(404, "category_not_found", "Category not found.");
}

export async function getCategoryBySlug(db: Database, slug: string): Promise<CategoryRow | null> {
  return db.first<CategoryRow>("SELECT * FROM categories WHERE slug = ?", [slug]);
}
