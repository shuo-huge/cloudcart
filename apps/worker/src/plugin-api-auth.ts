import type { MiddlewareHandler } from "hono";
import type { PluginRow } from "@cloudcart/database";
import { getOrCreateStoreId, storedRemoteManifest } from "@cloudcart/core";
import { verifyPluginJwt } from "@cloudcart/security";
import type { AppContext } from "./env";
import { db, jsonError } from "./lib";

const CORS_METHODS = "GET, POST, PUT, OPTIONS";
const CORS_HEADERS = "Authorization, Content-Type";

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

async function enabledPluginByOrigin(database: ReturnType<typeof db>, origin: string): Promise<PluginRow | null> {
  return database.first<PluginRow>(
    `SELECT * FROM plugins WHERE runtime = 'remote' AND enabled = 1 AND uninstalled_at IS NULL
       AND admin_origin = ? LIMIT 1`,
    [origin],
  );
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export const pluginApiAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const database = db(c);
  const origin = c.req.header("origin") ?? "";

  if (c.req.method === "OPTIONS") {
    if (!origin) return c.body(null, 403);
    const plugin = await enabledPluginByOrigin(database, origin);
    if (!plugin) return c.body(null, 403);
    for (const [key, value] of Object.entries(corsHeaders(origin))) c.header(key, value);
    return c.body(null, 204);
  }

  const token = bearerToken(c.req.header("authorization"));
  if (!token) return jsonError(c, 401, "token_missing", "A plugin bearer token is required.");
  const masterKey = c.env.APP_MASTER_KEY;
  if (!masterKey) return jsonError(c, 500, "not_configured", "APP_MASTER_KEY is not configured.");

  const verified = await verifyPluginJwt(masterKey, token);
  if (!verified.valid) {
    const code = verified.reason === "expired" ? "token_expired" : "token_invalid";
    return jsonError(c, 401, code, "The plugin token is invalid or expired.");
  }
  const claims = verified.claims;
  if (claims.plugin_id !== claims.aud) {
    return jsonError(c, 401, "token_invalid", "The plugin token audience is invalid.");
  }
  const plugin = await database.first<PluginRow>(
    `SELECT * FROM plugins WHERE id = ? AND runtime = 'remote' AND enabled = 1 AND uninstalled_at IS NULL`,
    [claims.plugin_id],
  );
  if (!plugin) return jsonError(c, 403, "plugin_disabled", "The plugin is not installed or enabled.");
  const manifest = storedRemoteManifest(plugin);
  if (!manifest || !plugin.manifest_hash) {
    return jsonError(c, 403, "manifest_invalid", "The plugin manifest is invalid.");
  }
  const storeId = await getOrCreateStoreId(database);
  if (claims.store_id !== storeId) {
    return jsonError(c, 401, "token_invalid", "The plugin token belongs to a different store.");
  }
  if (origin && origin !== plugin.admin_origin) {
    return jsonError(c, 403, "origin_denied", "This origin is not allowed for the plugin.");
  }

  const manifestPermissions = new Set(manifest.permissions);
  const permissions = claims.permissions.filter((permission) => manifestPermissions.has(permission));
  c.set("pluginId", plugin.id);
  c.set("pluginPermissions", permissions);
  c.set("pluginStoreId", storeId);
  c.set("pluginAdminId", claims.admin_id);

  await next();
  if (origin && origin === plugin.admin_origin) {
    for (const [key, value] of Object.entries(corsHeaders(origin))) c.header(key, value);
  }
};

export function requirePluginPermission(c: { get: (key: "pluginPermissions") => string[] | undefined }, permission: string): boolean {
  return (c.get("pluginPermissions") ?? []).includes(permission);
}
