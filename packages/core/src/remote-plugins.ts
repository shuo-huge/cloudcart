import type { Database } from "@cloudcart/database";
import type { PluginHealthStatus, PluginRow } from "@cloudcart/database";
import type { RemotePluginManifest } from "@cloudcart/plugin-sdk";
import { decryptSecret, encryptSecret, newOpaqueToken } from "@cloudcart/security";
import { HttpError, nowIso } from "@cloudcart/shared";

export const REMOTE_SERVICE_SECRET_KEY = "_serviceSecret";

export interface InstallRemotePluginInput {
  manifest: RemotePluginManifest;
  manifestUrl: string;
  manifestHash: string;
  serviceSecret?: string;
  masterKey: string;
  bundledIds: Set<string>;
}

export interface InstallRemotePluginResult {
  id: string;
  /** Returned only once, when CloudCart generated the secret. */
  serviceSecret?: string;
}

async function saveServiceSecret(
  db: Database,
  pluginId: string,
  secret: string,
  masterKey: string,
): Promise<void> {
  const encrypted = await encryptSecret(secret, masterKey);
  await db.run(
    `INSERT INTO plugin_settings (plugin_id, key, value, encrypted, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value, encrypted = 1, updated_at = excluded.updated_at`,
    [pluginId, REMOTE_SERVICE_SECRET_KEY, encrypted, nowIso()],
  );
}

export async function getRemoteServiceSecret(
  db: Database,
  pluginId: string,
  masterKey: string,
): Promise<string | null> {
  const row = await db.first<{ value: string; encrypted: number }>(
    "SELECT value, encrypted FROM plugin_settings WHERE plugin_id = ? AND key = ?",
    [pluginId, REMOTE_SERVICE_SECRET_KEY],
  );
  if (!row) return null;
  if (!row.encrypted) return row.value;
  try {
    return await decryptSecret(row.value, masterKey);
  } catch {
    return null;
  }
}

export async function getRemotePluginRow(
  db: Database,
  id: string,
  options: { includeUninstalled?: boolean } = {},
): Promise<PluginRow | null> {
  const row = await db.first<PluginRow>("SELECT * FROM plugins WHERE id = ? AND runtime = 'remote'", [id]);
  if (!row) return null;
  if (!options.includeUninstalled && row.uninstalled_at) return null;
  return row;
}

export function storedRemoteManifest(row: PluginRow): RemotePluginManifest | null {
  if (!row.manifest_json) return null;
  try {
    return JSON.parse(row.manifest_json) as RemotePluginManifest;
  } catch {
    return null;
  }
}

export function storedManifestPermissions(row: PluginRow): string[] {
  return storedRemoteManifest(row)?.permissions ?? [];
}

export function storedManifestPages(row: PluginRow) {
  return storedRemoteManifest(row)?.admin?.pages ?? [];
}

export async function installRemotePlugin(
  db: Database,
  input: InstallRemotePluginInput,
): Promise<InstallRemotePluginResult> {
  const { manifest } = input;
  if (input.bundledIds.has(manifest.id)) {
    throw new HttpError(409, "plugin_id_conflict", "A bundled plugin already uses this id.");
  }
  const existing = await db.first<PluginRow>("SELECT * FROM plugins WHERE id = ?", [manifest.id]);
  if (existing && !existing.uninstalled_at) {
    throw new HttpError(409, "plugin_already_installed", "This plugin is already installed. Use Update instead.");
  }

  const generatedSecret = input.serviceSecret ? null : newOpaqueToken(32);
  const secret = input.serviceSecret ?? generatedSecret!;
  const manifestJson = JSON.stringify(manifest);
  const adminOrigin = new URL(manifest.admin.entryUrl).origin;
  const now = nowIso();

  if (existing) {
    await db.run(
      `UPDATE plugins SET name = ?, version = ?, type = ?, description = ?, icon = ?, author = ?,
         enabled = 0, built_in = 0, runtime = 'remote', manifest_url = ?, manifest_json = ?,
         service_base_url = ?, admin_entry_url = ?, admin_origin = ?, manifest_hash = ?,
         health_status = 'unknown', last_health_check_at = NULL, last_error = NULL,
         uninstalled_at = NULL, updated_at = ?
       WHERE id = ?`,
      [
        manifest.name, manifest.version, manifest.type, manifest.description,
        manifest.icon ?? null, manifest.author ?? null,
        input.manifestUrl, manifestJson,
        manifest.service.baseUrl, manifest.admin.entryUrl, adminOrigin, input.manifestHash,
        now, manifest.id,
      ],
    );
  } else {
    await db.run(
      `INSERT INTO plugins (id, name, version, type, description, icon, author, enabled, built_in,
         last_error, installed_at, updated_at, runtime, manifest_url, manifest_json,
         service_base_url, admin_entry_url, admin_origin, manifest_hash, health_status,
         last_health_check_at, uninstalled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, 'remote', ?, ?, ?, ?, ?, ?, 'unknown', NULL, NULL)`,
      [
        manifest.id, manifest.name, manifest.version, manifest.type, manifest.description,
        manifest.icon ?? null, manifest.author ?? null, now, now,
        input.manifestUrl, manifestJson, manifest.service.baseUrl,
        manifest.admin.entryUrl, adminOrigin, input.manifestHash,
      ],
    );
  }

  await saveServiceSecret(db, manifest.id, secret, input.masterKey);
  return { id: manifest.id, serviceSecret: generatedSecret ?? undefined };
}

export interface UpdateRemotePluginInput {
  manifest: RemotePluginManifest;
  manifestUrl: string;
  manifestHash: string;
  serviceSecret?: string;
  masterKey: string;
}

export async function updateRemotePlugin(
  db: Database,
  id: string,
  input: UpdateRemotePluginInput,
): Promise<InstallRemotePluginResult> {
  const row = await getRemotePluginRow(db, id);
  if (!row) throw new HttpError(404, "plugin_not_found", "Remote plugin not found.");
  if (input.manifest.id !== id) {
    throw new HttpError(400, "plugin_id_mismatch", "The updated manifest uses a different plugin id.");
  }
  const previous = storedRemoteManifest(row);
  const previousOrigin = previous ? new URL(previous.service.baseUrl).origin : null;
  const nextOrigin = new URL(input.manifest.service.baseUrl).origin;
  const secretRequired = previousOrigin !== nextOrigin;
  const generatedSecret = secretRequired && !input.serviceSecret ? newOpaqueToken(32) : null;
  const manifestJson = JSON.stringify(input.manifest);
  const adminOrigin = new URL(input.manifest.admin.entryUrl).origin;
  const now = nowIso();

  await db.run(
    `UPDATE plugins SET name = ?, version = ?, type = ?, description = ?, icon = ?, author = ?,
       manifest_url = ?, manifest_json = ?, service_base_url = ?, admin_entry_url = ?,
       admin_origin = ?, manifest_hash = ?, health_status = 'unknown',
       last_health_check_at = NULL, last_error = NULL, updated_at = ?
     WHERE id = ? AND runtime = 'remote' AND uninstalled_at IS NULL`,
    [
      input.manifest.name, input.manifest.version, input.manifest.type, input.manifest.description,
      input.manifest.icon ?? null, input.manifest.author ?? null,
      input.manifestUrl, manifestJson, input.manifest.service.baseUrl,
      input.manifest.admin.entryUrl, adminOrigin, input.manifestHash, now, id,
    ],
  );

  const secret = input.serviceSecret ?? generatedSecret;
  if (secret) await saveServiceSecret(db, id, secret, input.masterKey);
  return { id, serviceSecret: generatedSecret ?? undefined };
}

export async function uninstallRemotePlugin(db: Database, id: string): Promise<void> {
  const row = await getRemotePluginRow(db, id);
  if (!row) throw new HttpError(404, "plugin_not_found", "Remote plugin not found.");
  const now = nowIso();
  await db.run(
    "UPDATE plugins SET enabled = 0, uninstalled_at = ?, updated_at = ? WHERE id = ? AND runtime = 'remote'",
    [now, now, id],
  );
}

export async function updateRemotePluginHealth(
  db: Database,
  id: string,
  status: PluginHealthStatus,
  error: string | null,
): Promise<void> {
  await db.run(
    `UPDATE plugins SET health_status = ?, last_health_check_at = ?, last_error = ?, updated_at = ?
     WHERE id = ? AND runtime = 'remote'`,
    [status, nowIso(), error?.slice(0, 500) ?? null, nowIso(), id],
  );
}

export async function listEnabledRemoteAdminOrigins(db: Database): Promise<string[]> {
  const rows = await db.all<{ admin_origin: string }>(
    `SELECT DISTINCT admin_origin FROM plugins
     WHERE runtime = 'remote' AND enabled = 1 AND uninstalled_at IS NULL AND admin_origin IS NOT NULL`,
  );
  return rows.map((row) => row.admin_origin).filter((origin) => typeof origin === "string" && origin.length > 0);
}

export async function listEnabledRemoteMenus(db: Database): Promise<Array<{
  pluginId: string;
  pluginName: string;
  pages: Array<{ id: string; label: string; icon?: string }>;
}>> {
  const rows = await db.all<PluginRow>(
    "SELECT * FROM plugins WHERE runtime = 'remote' AND enabled = 1 AND uninstalled_at IS NULL ORDER BY name",
  );
  return rows.map((row) => {
    const manifest = storedRemoteManifest(row);
    return {
      pluginId: row.id,
      pluginName: row.name,
      pages: manifest?.admin?.pages ?? [],
    };
  }).filter((entry) => entry.pages.length > 0);
}
