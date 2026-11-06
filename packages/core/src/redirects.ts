import type { Database } from "@cloudcart/database";
import type { RedirectRow } from "@cloudcart/database";
import { HttpError, newId, normalizePath, nowIso } from "@cloudcart/shared";
import { z } from "zod";

export const redirectInputSchema = z.object({
  fromPath: z.string().trim().min(1).max(500),
  toPath: z.string().trim().min(1).max(500),
  statusCode: z.union([z.literal(301), z.literal(302)]).default(301),
});

export async function listRedirects(db: Database): Promise<RedirectRow[]> {
  return db.all<RedirectRow>("SELECT * FROM redirects ORDER BY created_at DESC");
}

export async function createRedirect(db: Database, input: z.infer<typeof redirectInputSchema>): Promise<string> {
  const from = normalizePath(input.fromPath);
  if (from === "/") throw new HttpError(400, "invalid_redirect", "The home page cannot be redirected.");
  if (!input.toPath.startsWith("/") && !/^https?:\/\//.test(input.toPath)) {
    throw new HttpError(400, "invalid_redirect", "Redirect targets must be a site path or an absolute URL.");
  }
  if (await db.exists("SELECT 1 FROM redirects WHERE from_path = ?", [from])) {
    throw new HttpError(409, "redirect_exists", "A redirect for this path already exists.");
  }
  const id = newId("redir");
  await db.run(
    "INSERT INTO redirects (id, from_path, to_path, status_code, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, from, input.toPath, input.statusCode, nowIso()],
  );
  return id;
}

export async function deleteRedirect(db: Database, id: string): Promise<void> {
  const result = await db.run("DELETE FROM redirects WHERE id = ?", [id]);
  if (!result.meta.changes) throw new HttpError(404, "redirect_not_found", "Redirect not found.");
}

export async function resolveRedirect(db: Database, path: string): Promise<{ toPath: string; statusCode: number } | null> {
  const row = await db.first<{ to_path: string; status_code: number }>(
    "SELECT to_path, status_code FROM redirects WHERE from_path = ?",
    [normalizePath(path)],
  );
  return row ? { toPath: row.to_path, statusCode: row.status_code } : null;
}
