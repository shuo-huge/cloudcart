import type { Database } from "@cloudcart/database";
import type { PluginRow } from "@cloudcart/database";
import {
  getOrCreateStoreId,
  getRemotePluginRow,
  installRemotePlugin,
  storedRemoteManifest,
  uninstallRemotePlugin,
  updateRemotePlugin,
  type InstallRemotePluginResult,
} from "@cloudcart/core";
import {
  parseRemotePluginManifest,
  RemoteManifestValidationError,
  validateRemoteUrl,
  type RemotePluginManifest,
  type RemotePluginPreview,
} from "@cloudcart/plugin-sdk";
import { createPluginJwt, sha256Hex } from "@cloudcart/security";
import { HttpError } from "@cloudcart/shared";
import type { Env } from "./env";
import { checkRemotePluginHealth } from "./remote-plugin-client";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MANIFEST_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

export function insecurePluginsAllowed(env: Env): boolean {
  return env.PLUGIN_ALLOW_INSECURE_ORIGINS === "1" &&
    (env.APP_ENV === "e2e" || env.APP_ENV === "test" || env.APP_ENV === "development");
}

export interface FetchedManifest {
  manifest: RemotePluginManifest;
  manifestUrl: string;
  manifestHash: string;
}

export async function fetchRemoteManifest(
  manifestUrl: string,
  options: { allowInsecure?: boolean } = {},
): Promise<FetchedManifest> {
  let current: string;
  try {
    current = validateRemoteUrl(manifestUrl, options);
  } catch (error) {
    throw new HttpError(400, "manifest_invalid", error instanceof Error ? error.message : "Invalid manifest URL.");
  }

  let response: Response | null = null;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    try {
      response = await fetch(current, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new HttpError(
        timedOut ? 504 : 502,
        timedOut ? "manifest_timeout" : "manifest_unreachable",
        timedOut ? "The plugin manifest request timed out." : "The plugin manifest could not be fetched.",
      );
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new HttpError(502, "manifest_unreachable", "The plugin manifest returned a redirect without a location.");
      }
      let next: string;
      try {
        next = validateRemoteUrl(new URL(location, current).toString(), options);
      } catch (error) {
        throw new HttpError(400, "manifest_invalid", error instanceof Error ? error.message : "Unsafe redirect.");
      }
      current = next;
      continue;
    }
    break;
  }
  if (!response) throw new HttpError(502, "manifest_unreachable", "The plugin manifest could not be fetched.");
  if (response.status >= 300 && response.status < 400) {
    throw new HttpError(502, "manifest_unreachable", "The plugin manifest redirected too many times.");
  }
  if (!response.ok) {
    throw new HttpError(502, "manifest_unreachable", `The plugin manifest returned HTTP ${response.status}.`);
  }
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("json")) {
    throw new HttpError(400, "manifest_invalid", "The plugin manifest must be served as JSON.");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MANIFEST_BYTES) {
    throw new HttpError(413, "manifest_too_large", "The plugin manifest is too large.");
  }
  const raw = await response.text();
  if (raw.length > MAX_MANIFEST_BYTES) {
    throw new HttpError(413, "manifest_too_large", "The plugin manifest is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "manifest_invalid", "The plugin manifest is not valid JSON.");
  }
  let manifest: RemotePluginManifest;
  try {
    manifest = parseRemotePluginManifest(parsed, options);
  } catch (error) {
    if (error instanceof RemoteManifestValidationError) {
      throw new HttpError(400, "manifest_invalid", error.message, error.issues);
    }
    throw error;
  }
  return {
    manifest,
    manifestUrl: current,
    manifestHash: await sha256Hex(raw),
  };
}

export interface RemotePluginPreviewResult extends RemotePluginPreview {
  warnings: string[];
}

export async function previewRemotePlugin(
  manifestUrl: string,
  options: { allowInsecure?: boolean } = {},
): Promise<RemotePluginPreviewResult> {
  const fetched = await fetchRemoteManifest(manifestUrl, options);
  const warnings: string[] = [];
  if (fetched.manifest.admin.pages.length === 0) {
    warnings.push("This plugin does not register an admin page; its iframe menu will not appear.");
  }
  if (fetched.manifest.permissions.length === 0) {
    warnings.push("This plugin does not request access to store data.");
  }
  return {
    manifest: fetched.manifest,
    manifestUrl: fetched.manifestUrl,
    manifestHash: fetched.manifestHash,
    adminOrigin: new URL(fetched.manifest.admin.entryUrl).origin,
    permissions: fetched.manifest.permissions,
    warnings,
  };
}

function assertExpectedHash(fetched: FetchedManifest, expectedHash: string | undefined): void {
  if (expectedHash && expectedHash !== fetched.manifestHash) {
    throw new HttpError(
      409,
      "manifest_changed",
      "The plugin manifest changed after preview. Preview it again before installing.",
    );
  }
}

export async function installRemotePluginFromUrl(
  db: Database,
  env: Env,
  input: {
    manifestUrl: string;
    manifestHash?: string;
    serviceSecret?: string;
    bundledIds: Set<string>;
  },
): Promise<InstallRemotePluginResult> {
  const fetched = await fetchRemoteManifest(input.manifestUrl, { allowInsecure: insecurePluginsAllowed(env) });
  assertExpectedHash(fetched, input.manifestHash);
  return installRemotePlugin(db, {
    manifest: fetched.manifest,
    manifestUrl: fetched.manifestUrl,
    manifestHash: fetched.manifestHash,
    serviceSecret: input.serviceSecret,
    masterKey: env.APP_MASTER_KEY,
    bundledIds: input.bundledIds,
  });
}

export async function updateRemotePluginFromUrl(
  db: Database,
  env: Env,
  id: string,
  input: { manifestUrl: string; manifestHash?: string; serviceSecret?: string },
): Promise<InstallRemotePluginResult> {
  const fetched = await fetchRemoteManifest(input.manifestUrl, { allowInsecure: insecurePluginsAllowed(env) });
  assertExpectedHash(fetched, input.manifestHash);
  if (fetched.manifest.id !== id) {
    throw new HttpError(400, "plugin_id_mismatch", "The updated manifest uses a different plugin id.");
  }
  return updateRemotePlugin(db, id, {
    manifest: fetched.manifest,
    manifestUrl: fetched.manifestUrl,
    manifestHash: fetched.manifestHash,
    serviceSecret: input.serviceSecret,
    masterKey: env.APP_MASTER_KEY,
  });
}

export { uninstallRemotePlugin };

export async function healthCheckRemotePlugin(
  db: Database,
  env: Env,
  plugin: PluginRow,
): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  return checkRemotePluginHealth(db, env.APP_MASTER_KEY, plugin);
}

export async function launchRemotePlugin(
  db: Database,
  env: Env,
  pluginId: string,
  adminId: string,
  pageId?: string,
): Promise<{
  token: string;
  expiresAt: string;
  storeId: string;
  pluginId: string;
  permissions: string[];
  pageId?: string;
}> {
  const plugin = await getRemotePluginRow(db, pluginId);
  if (!plugin) throw new HttpError(404, "plugin_not_found", "Remote plugin not found.");
  if (plugin.enabled !== 1) throw new HttpError(403, "plugin_disabled", "Enable the plugin before opening it.");
  const manifest = storedRemoteManifest(plugin);
  if (!manifest) throw new HttpError(400, "manifest_invalid", "The installed plugin manifest is invalid.");
  if (pageId && !manifest.admin.pages.some((page) => page.id === pageId)) {
    throw new HttpError(400, "invalid_page", "This page is not registered by the plugin.");
  }
  const storeId = await getOrCreateStoreId(db);
  const { token, claims } = await createPluginJwt(env.APP_MASTER_KEY, {
    pluginId: plugin.id,
    storeId,
    adminId,
    permissions: manifest.permissions,
  });
  return {
    token,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    storeId,
    pluginId: plugin.id,
    permissions: claims.permissions,
    pageId,
  };
}
