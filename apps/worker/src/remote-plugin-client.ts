import type { Database } from "@cloudcart/database";
import type { PluginRow } from "@cloudcart/database";
import { getOrCreateStoreId, getRemoteServiceSecret, updateRemotePluginHealth } from "@cloudcart/core";
import { hmacSha256RawBase64Url, sha256Hex } from "@cloudcart/security";
import { newOpaqueToken } from "@cloudcart/security";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

export class RemotePluginError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = "RemotePluginError";
    this.code = code;
    this.status = status;
  }
}

export interface RemoteRequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  trackHealth?: boolean;
}

export interface RemoteResponse<T = unknown> {
  status: number;
  data: T | null;
}

function joinUrl(baseUrl: string, path: string): URL {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");
  return new URL(`${base}/${suffix}`);
}

function headerRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export { headerRecord };

/**
 * Signs and sends one request from CloudCart to a remote plugin service.
 * Canonical string: timestamp \n nonce \n METHOD \n path+query \n bodyHash.
 */
export async function remotePluginRequest<T = unknown>(
  db: Database,
  masterKey: string,
  plugin: PluginRow,
  path: string,
  options: RemoteRequestOptions = {},
): Promise<RemoteResponse<T>> {
  if (!plugin.service_base_url) {
    throw new RemotePluginError("service_error", "The remote plugin has no service URL.");
  }
  const secret = await getRemoteServiceSecret(db, plugin.id, masterKey);
  if (!secret) {
    throw new RemotePluginError("service_error", "The remote plugin service secret is missing.");
  }
  const method = (options.method ?? "GET").toUpperCase();
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  const url = joinUrl(plugin.service_base_url, path);
  const timestamp = new Date().toISOString();
  const nonce = newOpaqueToken(16);
  const bodyHash = await sha256Hex(body);
  const canonical = `${timestamp}\n${nonce}\n${method}\n${url.pathname}${url.search}\n${bodyHash}`;
  const signature = await hmacSha256RawBase64Url(secret, canonical);
  const storeId = await getOrCreateStoreId(db);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-CloudCart-Plugin": plugin.id,
    "X-CloudCart-Store-Id": storeId,
    "X-CloudCart-Timestamp": timestamp,
    "X-CloudCart-Nonce": nonce,
    "X-CloudCart-Signature": signature,
  };
  if (body) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body || undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1000), 30_000)),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The remote plugin service timed out."
      : "The remote plugin service could not be reached.";
    if (options.trackHealth !== false) await updateRemotePluginHealth(db, plugin.id, "error", message);
    throw new RemotePluginError(message.includes("timed out") ? "service_timeout" : "service_error", message);
  }

  if (response.status >= 300 && response.status < 400) {
    if (options.trackHealth !== false) await updateRemotePluginHealth(db, plugin.id, "error", "Unexpected redirect.");
    throw new RemotePluginError("service_error", "The remote plugin service returned an unexpected redirect.", response.status);
  }
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    if (options.trackHealth !== false) await updateRemotePluginHealth(db, plugin.id, "error", "Response too large.");
    throw new RemotePluginError("service_error", "The remote plugin response is too large.", response.status);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    if (options.trackHealth !== false) await updateRemotePluginHealth(db, plugin.id, "error", "Response too large.");
    throw new RemotePluginError("service_error", "The remote plugin response is too large.", response.status);
  }
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      if (options.trackHealth !== false) await updateRemotePluginHealth(db, plugin.id, "error", "Invalid JSON response.");
      throw new RemotePluginError("service_error", "The remote plugin returned invalid JSON.", response.status);
    }
  }
  if (!response.ok) {
    const message = typeof (data as { message?: unknown } | null)?.message === "string"
      ? String((data as { message: string }).message)
      : `The remote plugin returned HTTP ${response.status}.`;
    if (options.trackHealth !== false) await updateRemotePluginHealth(db, plugin.id, "error", message);
    throw new RemotePluginError("service_error", message, response.status);
  }
  if (options.trackHealth !== false) await updateRemotePluginHealth(db, plugin.id, "ok", null);
  return { status: response.status, data };
}

export async function checkRemotePluginHealth(
  db: Database,
  masterKey: string,
  plugin: PluginRow,
): Promise<{ ok: boolean; message?: string; data?: unknown }> {
  try {
    const result = await remotePluginRequest<{ ok?: boolean; version?: string; message?: string }>(
      db,
      masterKey,
      plugin,
      "/health",
      { trackHealth: true, timeoutMs: 5000 },
    );
    const ok = result.data?.ok === true;
    return { ok, message: ok ? undefined : result.data?.message ?? "Health check did not report ok.", data: result.data };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Health check failed.",
    };
  }
}
