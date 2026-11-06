import type { Database } from "@cloudcart/database";
import { HttpError, newId, nowIso } from "@cloudcart/shared";

export async function subscribeToNewsletter(db: Database, email: string, source: string): Promise<{ created: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    throw new HttpError(400, "invalid_email", "Enter a valid email address.");
  }
  const existing = await db.first<{ id: string }>(
    "SELECT id FROM newsletter_subscribers WHERE email = ? COLLATE NOCASE",
    [normalized],
  );
  if (existing) return { created: false };
  await db.run(
    "INSERT INTO newsletter_subscribers (id, email, source, created_at) VALUES (?, ?, ?, ?)",
    [newId("sub"), normalized, source.slice(0, 120), nowIso()],
  );
  return { created: true };
}

export async function listSubscribers(db: Database, page: number, perPage: number) {
  const [count, list] = await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM newsletter_subscribers"),
    db.prepare(
      "SELECT id, email, source, created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [perPage, (page - 1) * perPage],
    ),
  ]);
  return {
    items: (list?.results ?? []) as Array<{ id: string; email: string; source: string | null; created_at: string }>,
    total: Number((count?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
  };
}
