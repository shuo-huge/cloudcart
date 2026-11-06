import type { Database } from "@cloudcart/database";
import type { ThemeRow } from "@cloudcart/database";
import { HttpError, nowIso } from "@cloudcart/shared";

export async function listThemes(db: Database): Promise<ThemeRow[]> {
  return db.all<ThemeRow>("SELECT * FROM themes ORDER BY active DESC, name");
}

export async function getActiveTheme(db: Database): Promise<ThemeRow | null> {
  return db.first<ThemeRow>("SELECT * FROM themes WHERE active = 1 LIMIT 1");
}

export async function getThemeSettings(db: Database, themeId: string): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string }>(
    "SELECT key, value FROM theme_settings WHERE theme_id = ?",
    [themeId],
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function setThemeSettings(db: Database, themeId: string, values: Record<string, string>): Promise<void> {
  const now = nowIso();
  const statements = Object.entries(values).map(([key, value]) =>
    db.prepare(
      `INSERT INTO theme_settings (theme_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(theme_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [themeId, key, value.slice(0, 4000), now],
    ),
  );
  if (statements.length > 0) await db.batch(statements);
}

export async function activateTheme(db: Database, themeId: string): Promise<void> {
  const theme = await db.first<{ id: string }>("SELECT id FROM themes WHERE id = ?", [themeId]);
  if (!theme) throw new HttpError(404, "theme_not_found", "Theme not found.");
  const now = nowIso();
  await db.batch([
    db.prepare("UPDATE themes SET active = 0, updated_at = ? WHERE active = 1", [now]),
    db.prepare("UPDATE themes SET active = 1, updated_at = ? WHERE id = ?", [now, themeId]),
  ]);
}

export async function registerThemes(
  db: Database,
  themes: Array<{ id: string; name: string; version: string; description: string; previewImage?: string }>,
): Promise<void> {
  const now = nowIso();
  const statements = themes.map((theme) =>
    db.prepare(
      `INSERT INTO themes (id, name, version, description, preview_image, built_in, active, installed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version,
         description = excluded.description, preview_image = excluded.preview_image, updated_at = excluded.updated_at`,
      [theme.id, theme.name, theme.version, theme.description, theme.previewImage ?? null, now, now],
    ),
  );
  if (statements.length > 0) await db.batch(statements);
}
