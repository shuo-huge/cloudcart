import type { Database } from "@cloudcart/database";
import type { PageVersionRow } from "@cloudcart/database";
import { HttpError, newId, nowIso, type PageDocument, type PageSection } from "@cloudcart/shared";
import { z } from "zod";

const MAX_PAGE_JSON_BYTES = 256 * 1024;
const MAX_SECTIONS = 100;

const sectionSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.string().min(1).max(60),
  enabled: z.boolean().default(true),
  settings: z.record(z.string(), z.unknown()).default({}),
  blocks: z.array(z.unknown()).max(50).optional(),
});

const pageSchema = z.object({
  version: z.number().int().min(1).max(1000),
  page: z.string().min(1).max(80),
  sections: z.array(sectionSchema).max(MAX_SECTIONS),
});

export function validatePageDocument(input: unknown): PageDocument {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_page", "The page configuration is invalid.", parsed.error.issues);
  }
  const json = JSON.stringify(parsed.data);
  if (json.length > MAX_PAGE_JSON_BYTES) {
    throw new HttpError(413, "page_too_large", "The page configuration is too large.");
  }
  if (/<script/i.test(json)) {
    // Scripts are never allowed in page JSON; Custom HTML is sanitized at render time.
    throw new HttpError(400, "script_not_allowed", "Scripts cannot be embedded in page content.");
  }
  return parsed.data as PageDocument;
}

export function emptyPage(page = "home"): PageDocument {
  return { version: 1, page, sections: [] };
}

export async function getPage(db: Database, slug: string) {
  return db.first<{
    id: string;
    slug: string;
    title: string;
    type: "home" | "content";
    draft_json: string;
    published_version: number | null;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM pages WHERE slug = ?", [slug]);
}

export async function listPages(db: Database) {
  return db.all<{ id: string; slug: string; title: string; type: string; published_version: number | null; updated_at: string }>(
    "SELECT id, slug, title, type, published_version, updated_at FROM pages ORDER BY type DESC, updated_at DESC",
  );
}

export async function getDraftDocument(db: Database, slug: string): Promise<{ page: Awaited<ReturnType<typeof getPage>>; document: PageDocument } | null> {
  const page = await getPage(db, slug);
  if (!page) return null;
  let document: PageDocument;
  try {
    document = JSON.parse(page.draft_json) as PageDocument;
  } catch {
    document = emptyPage(slug);
  }
  return { page, document };
}

export async function getPublishedDocument(db: Database, slug: string): Promise<PageDocument | null> {
  const page = await getPage(db, slug);
  if (!page) return null;
  if (page.published_version === null) return null;
  const version = await db.first<PageVersionRow>(
    "SELECT * FROM page_versions WHERE page_id = ? AND version = ?",
    [page.id, page.published_version],
  );
  if (!version) return null;
  try {
    return JSON.parse(version.data_json) as PageDocument;
  } catch {
    return null;
  }
}

export async function saveDraft(db: Database, slug: string, input: unknown): Promise<PageDocument> {
  const page = await getPage(db, slug);
  if (!page) throw new HttpError(404, "page_not_found", "Page not found.");
  const document = validatePageDocument(input);
  await db.run("UPDATE pages SET draft_json = ?, updated_at = ? WHERE id = ?", [JSON.stringify(document), nowIso(), page.id]);
  return document;
}

export async function publishPage(db: Database, slug: string, adminId: string): Promise<{ version: number }> {
  const page = await getPage(db, slug);
  if (!page) throw new HttpError(404, "page_not_found", "Page not found.");
  let document: PageDocument;
  try {
    document = validatePageDocument(JSON.parse(page.draft_json));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_page", "The draft page configuration is invalid.");
  }
  const latest = await db.first<{ version: number | null }>(
    "SELECT MAX(version) AS version FROM page_versions WHERE page_id = ?",
    [page.id],
  );
  const version = (latest?.version ?? 0) + 1;
  const now = nowIso();
  await db.batch([
    db.prepare(
      `INSERT INTO page_versions (id, page_id, version, data_json, published_by, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId("pv"), page.id, version, JSON.stringify(document), adminId, now, now],
    ),
    db.prepare("UPDATE pages SET published_version = ?, updated_at = ? WHERE id = ?", [version, now, page.id]),
  ]);
  return { version };
}

export async function listPageVersions(db: Database, slug: string) {
  const page = await getPage(db, slug);
  if (!page) return [];
  return db.all<{ version: number; published_at: string; published_by: string | null }>(
    "SELECT version, published_at, published_by FROM page_versions WHERE page_id = ? ORDER BY version DESC LIMIT 50",
    [page.id],
  );
}

export async function createContentPage(db: Database, slug: string, title: string): Promise<string> {
  if (await db.exists("SELECT 1 FROM pages WHERE slug = ?", [slug])) {
    throw new HttpError(409, "slug_taken", "A page with this slug already exists.");
  }
  const id = newId("page");
  const now = nowIso();
  const document = emptyPage(slug);
  await db.run(
    "INSERT INTO pages (id, slug, title, type, draft_json, published_version, created_at, updated_at) VALUES (?, ?, ?, 'content', ?, NULL, ?, ?)",
    [id, slug, title, JSON.stringify(document), now, now],
  );
  return id;
}

export type { PageSection, PageDocument };
