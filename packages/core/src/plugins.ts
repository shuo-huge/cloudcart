import type { Database } from "@cloudcart/database";
import type { PluginHealthStatus, PluginRow, PluginRuntime } from "@cloudcart/database";
import { decryptSecret, encryptSecret } from "@cloudcart/security";
import { HttpError, nowIso } from "@cloudcart/shared";
import type { PluginManifest, RemotePluginAdminPage } from "@cloudcart/plugin-sdk";
import { getRemotePluginRow, storedRemoteManifest } from "./remote-plugins";

export interface PluginView extends PluginRow {
  bundled: boolean;
  runtime: PluginRuntime;
  capabilities: string[];
  permissions: string[];
  dependencies: string[];
  manifestUrl: string | null;
  serviceBaseUrl: string | null;
  adminEntryUrl: string | null;
  adminOrigin: string | null;
  adminPages: RemotePluginAdminPage[];
  healthStatus: PluginHealthStatus;
  lastHealthCheckAt: string | null;
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
      manifest_url: null,
      manifest_json: null,
      service_base_url: null,
      admin_entry_url: null,
      admin_origin: null,
      manifest_hash: null,
      health_status: "unknown",
      last_health_check_at: null,
      uninstalled_at: null,
      bundled: true,
      runtime: row?.runtime ?? "bundled",
      capabilities: manifest.capabilities,
      permissions: manifest.permissions,
      dependencies: manifest.dependencies ?? [],
      manifestUrl: null,
      serviceBaseUrl: null,
      adminEntryUrl: null,
      adminOrigin: null,
      adminPages: [],
      healthStatus: "unknown",
      lastHealthCheckAt: null,
    });
    byId.delete(manifest.id);
  }
  // Remote plugins are installed by pointer and are not part of the bundle.
  // Rows without bundled code and without a remote runtime are surfaced as
  // unavailable instead of pretending they can run.
  for (const row of byId.values()) {
    if (row.uninstalled_at) continue;
    if (row.runtime === "remote") {
      const manifest = storedRemoteManifest(row);
      views.push({
        ...row,
        bundled: false,
        runtime: "remote",
        capabilities: manifest?.capabilities ?? [],
        permissions: manifest?.permissions ?? [],
        dependencies: manifest?.dependencies ?? [],
        manifestUrl: row.manifest_url,
        serviceBaseUrl: row.service_base_url,
        adminEntryUrl: row.admin_entry_url,
        adminOrigin: row.admin_origin,
        adminPages: manifest?.admin?.pages ?? [],
        healthStatus: row.health_status,
        lastHealthCheckAt: row.last_health_check_at,
      });
      continue;
    }
    views.push({
      ...row,
      bundled: false,
      runtime: "bundled",
      capabilities: [],
      permissions: [],
      dependencies: [],
      manifestUrl: null,
      serviceBaseUrl: null,
      adminEntryUrl: null,
      adminOrigin: null,
      adminPages: [],
      healthStatus: "unknown",
      lastHealthCheckAt: null,
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
  const now = nowIso();
  if (!registry.has(pluginId)) {
    const remote = await getRemotePluginRow(db, pluginId);
    if (!remote) {
      throw new HttpError(400, "plugin_not_bundled", "This plugin is not installed or bundled into the current Worker build.");
    }
    await db.run("UPDATE plugins SET enabled = ?, updated_at = ? WHERE id = ? AND runtime = 'remote'",
      [enabled ? 1 : 0, now, pluginId]);
    return;
  }
  const manifest = registry.get(pluginId)!;
  const existing = await db.first<{ id: string }>("SELECT id FROM plugins WHERE id = ?", [pluginId]);
  if (!existing) {
    await db.run(
      `INSERT INTO plugins (id, name, version, type, description, icon, author, enabled, built_in, runtime, last_error, installed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'bundled', NULL, ?, ?)`,
      [manifest.id, manifest.name, manifest.version, manifest.type, manifest.description,
        manifest.icon ?? null, manifest.author ?? null, enabled ? 1 : 0, now, now],
    );
  } else {
    await db.run(
      "UPDATE plugins SET enabled = ?, runtime = 'bundled', updated_at = ? WHERE id = ?",
      [enabled ? 1 : 0, now, pluginId],
    );
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

/**
 * Loads runtime configuration for any bundled plugin. Encrypted values are
 * decrypted in memory only; they are never returned to the browser or logged.
 */
export async function loadPluginRuntimeConfig(
  db: Database,
  pluginId: string,
  masterKey: string,
): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string; encrypted: number }>(
    "SELECT key, value, encrypted FROM plugin_settings WHERE plugin_id = ?",
    [pluginId],
  );
  const config: Record<string, string> = {};
  for (const row of rows) {
    if (row.encrypted) {
      try {
        config[row.key] = await decryptSecret(row.value, masterKey);
      } catch {
        // A corrupt secret makes configuration invalid; do not surface ciphertext.
        config[row.key] = "";
      }
    } else {
      config[row.key] = row.value;
    }
  }
  return config;
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
