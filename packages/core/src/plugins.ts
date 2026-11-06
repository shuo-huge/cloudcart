import type { Database } from "@cloudcart/database";
import type { PluginRow } from "@cloudcart/database";
import { decryptSecret, encryptSecret } from "@cloudcart/security";
import { HttpError, nowIso } from "@cloudcart/shared";
import type { PluginManifest } from "@cloudcart/plugin-sdk";

export interface PluginView extends PluginRow {
  bundled: boolean;
  capabilities: string[];
  permissions: string[];
  dependencies: string[];
}

/**
 * The registry of plugins actually bundled into this Worker build. Plugin
 * rows in D1 never enable code that is not present in the bundle.
 */
export class PluginRegistry {
  private readonly byId = new Map<string, PluginManifest>();

  constructor(manifests: PluginManifest[]) {
    for (const manifest of manifests) {
      if (this.byId.has(manifest.id)) throw new Error(`Duplicate plugin id: ${manifest.id}`);
      this.byId.set(manifest.id, manifest);
    }
  }

  all(): PluginManifest[] {
    return [...this.byId.values()];
  }

  get(id: string): PluginManifest | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }
}

export async function listPlugins(db: Database, registry: PluginRegistry): Promise<PluginView[]> {
  const rows = await db.all<PluginRow>("SELECT * FROM plugins ORDER BY type, name");
  const byId = new Map(rows.map((row) => [row.id, row]));
  const views: PluginView[] = [];
  for (const manifest of registry.all()) {
    const row = byId.get(manifest.id);
    views.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      type: manifest.type,
      description: manifest.description,
      icon: manifest.icon ?? null,
      author: manifest.author ?? null,
      enabled: row?.enabled ?? 0,
      built_in: 1,
      last_error: row?.last_error ?? null,
      installed_at: row?.installed_at ?? nowIso(),
      updated_at: row?.updated_at ?? nowIso(),
      bundled: true,
      capabilities: manifest.capabilities,
      permissions: manifest.permissions,
      dependencies: manifest.dependencies ?? [],
    });
    byId.delete(manifest.id);
  }
  // Rows whose code is not in this build are surfaced honestly as unavailable.
  for (const row of byId.values()) {
    views.push({
      ...row,
      bundled: false,
      capabilities: [],
      permissions: [],
      dependencies: [],
    });
  }
  return views;
}

export async function setPluginEnabled(
  db: Database,
  registry: PluginRegistry,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  if (!registry.has(pluginId)) {
    throw new HttpError(400, "plugin_not_bundled", "This plugin is not bundled into the current Worker build. Redeploy with the plugin included.");
  }
  const manifest = registry.get(pluginId)!;
  const now = nowIso();
  const existing = await db.first<{ id: string }>("SELECT id FROM plugins WHERE id = ?", [pluginId]);
  if (!existing) {
    await db.run(
      `INSERT INTO plugins (id, name, version, type, description, icon, author, enabled, built_in, last_error, installed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)`,
      [manifest.id, manifest.name, manifest.version, manifest.type, manifest.description,
        manifest.icon ?? null, manifest.author ?? null, enabled ? 1 : 0, now, now],
    );
  } else {
    await db.run("UPDATE plugins SET enabled = ?, updated_at = ? WHERE id = ?", [enabled ? 1 : 0, now, pluginId]);
  }
}

export async function getPluginSettings(db: Database, pluginId: string): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string; encrypted: number }>(
    "SELECT key, value, encrypted FROM plugin_settings WHERE plugin_id = ?",
    [pluginId],
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.encrypted ? "••••••••" : row.value]));
}

export async function getPluginSecret(
  db: Database,
  pluginId: string,
  key: string,
  masterKey: string,
): Promise<string | null> {
  const row = await db.first<{ value: string; encrypted: number }>(
    "SELECT value, encrypted FROM plugin_settings WHERE plugin_id = ? AND key = ?",
    [pluginId, key],
  );
  if (!row) return null;
  if (!row.encrypted) return row.value;
  return decryptSecret(row.value, masterKey);
}

export async function setPluginSettings(
  db: Database,
  pluginId: string,
  values: Record<string, string>,
  masterKey: string,
  secretKeys: string[] = [],
): Promise<void> {
  const now = nowIso();
  const statements: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(key)) {
      throw new HttpError(400, "invalid_setting", `Invalid plugin setting key: ${key}`);
    }
    if (secretKeys.includes(key)) {
      if (value === "" || value.startsWith("••")) continue; // keep existing secret
      const encrypted = await encryptSecret(value, masterKey);
      statements.push(db.prepare(
        `INSERT INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value, encrypted = 1, updated_at = excluded.updated_at`,
        [pluginId, key, encrypted, now],
      ));
    } else {
      statements.push(db.prepare(
        `INSERT INTO plugin_settings (plugin_id, key, value, encrypted, updated_at) VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value, encrypted = 0, updated_at = excluded.updated_at`,
        [pluginId, key, value.slice(0, 10_000), now],
      ));
    }
  }
  if (statements.length > 0) await db.batch(statements);
}

export function manifestIsCompatible(manifest: PluginManifest, coreApiVersion: string): boolean {
  return manifest.apiVersion === coreApiVersion;
}
