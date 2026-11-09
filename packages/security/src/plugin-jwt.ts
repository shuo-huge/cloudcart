import { fromBase64Url, toBase64Url } from "@cloudcart/shared";
import { constantTimeEqual, fromUtf8, hmacSha256Base64Url, newOpaqueToken, utf8 } from "./crypto";

/** Domain-separated key use for plugin admin tokens. */
const PLUGIN_JWT_INFO = "cloudcart:plugin-jwt:v1";
export const PLUGIN_JWT_TTL_SECONDS = 5 * 60;

export interface PluginJwtClaims {
  iss: "cloudcart";
  aud: string;
  plugin_id: string;
  store_id: string;
  admin_id: string;
  permissions: string[];
  iat: number;
  exp: number;
  jti: string;
}

export interface CreatePluginJwtInput {
  pluginId: string;
  storeId: string;
  adminId: string;
  permissions: string[];
  ttlSeconds?: number;
  now?: number;
}

export type VerifyPluginJwtResult =
  | { valid: true; claims: PluginJwtClaims }
  | { valid: false; reason: "malformed" | "signature" | "expired" | "not_yet_valid" | "audience" };

function encodeJson(value: unknown): string {
  return toBase64Url(utf8(JSON.stringify(value)));
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(fromUtf8(fromBase64Url(value))) as T;
  } catch {
    return null;
  }
}

export async function createPluginJwt(
  masterKey: string,
  input: CreatePluginJwtInput,
): Promise<{ token: string; claims: PluginJwtClaims }> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(Math.max(input.ttlSeconds ?? PLUGIN_JWT_TTL_SECONDS, 30), 3600);
  const claims: PluginJwtClaims = {
    iss: "cloudcart",
    aud: input.pluginId,
    plugin_id: input.pluginId,
    store_id: input.storeId,
    admin_id: input.adminId,
    permissions: [...new Set(input.permissions)],
    iat: now,
    exp: now + ttl,
    jti: newOpaqueToken(16),
  };
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson(claims);
  const signature = await hmacSha256Base64Url(masterKey, `${header}.${payload}`, PLUGIN_JWT_INFO);
  return { token: `${header}.${payload}.${signature}`, claims };
}

export async function verifyPluginJwt(
  masterKey: string,
  token: string,
  options: { pluginId?: string; now?: number } = {},
): Promise<VerifyPluginJwtResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeJson<{ alg?: string; typ?: string }>(headerPart);
  if (!header || header.alg !== "HS256" || header.typ !== "JWT") {
    return { valid: false, reason: "malformed" };
  }
  const expected = await hmacSha256Base64Url(masterKey, `${headerPart}.${payloadPart}`, PLUGIN_JWT_INFO);
  if (!constantTimeEqual(signaturePart, expected)) return { valid: false, reason: "signature" };

  const claims = decodeJson<PluginJwtClaims>(payloadPart);
  if (!claims || claims.iss !== "cloudcart" ||
      typeof claims.aud !== "string" || typeof claims.plugin_id !== "string" ||
      typeof claims.store_id !== "string" || typeof claims.admin_id !== "string" ||
      !Array.isArray(claims.permissions) || typeof claims.jti !== "string" ||
      !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) {
    return { valid: false, reason: "malformed" };
  }
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (claims.exp <= now) return { valid: false, reason: "expired" };
  if (claims.iat > now + 60) return { valid: false, reason: "not_yet_valid" };
  if (options.pluginId && claims.aud !== options.pluginId) return { valid: false, reason: "audience" };
  return { valid: true, claims };
}
