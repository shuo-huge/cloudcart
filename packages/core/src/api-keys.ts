import type { Database } from "@cloudcart/database";
import type { AdminApiKeyRow, AdminRow } from "@cloudcart/database";
import { constantTimeEqual, sha256Hex } from "@cloudcart/security";
import { HttpError } from "@cloudcart/shared";
import { nowIso, randomToken } from "@cloudcart/shared";

/**
 * Long-lived API keys are scoped to one administrator and one store (the
 * Worker). The plaintext token is returned exactly once; only a SHA-256 hash
 * and the public key id are persisted.
 */
export type ApiKeyScope =
  | "*"
  | "dashboard:read"
  | "products:read"
  | "products:write"
  | "categories:read"
  | "categories:write"
  | "media:read"
  | "media:write"
  | "pages:read"
  | "pages:write"
  | "orders:read"
  | "orders:write"
  | "customers:read"
  | "customers:write"
  | "coupons:read"
  | "coupons:write"
  | "shipping:read"
  | "shipping:write"
  | "tax:read"
  | "tax:write";

export const API_KEY_SCOPES: readonly ApiKeyScope[] = [
  "*",
  "dashboard:read",
  "products:read",
  "products:write",
  "categories:read",
  "categories:write",
  "media:read",
  "media:write",
  "pages:read",
  "pages:write",
  "orders:read",
  "orders:write",
  "customers:read",
  "customers:write",
  "coupons:read",
  "coupons:write",
  "shipping:read",
  "shipping:write",
  "tax:read",
  "tax:write",
];

/** Defaults for the CLI: content + commerce operations, no wildcard. */
export const DEFAULT_API_KEY_SCOPES: readonly ApiKeyScope[] = [
  "dashboard:read",
  "products:read",
  "products:write",
  "categories:read",
  "categories:write",
  "media:read",
  "media:write",
  "pages:read",
  "pages:write",
  "orders:read",
  "orders:write",
  "customers:read",
  "customers:write",
  "coupons:read",
  "coupons:write",
  "shipping:read",
  "shipping:write",
  "tax:read",
  "tax:write",
];

const MAX_KEYS_PER_ADMIN = 20;
const LAST_USED_THROTTLE_MS = 60_000;
const TOKEN_PATTERN = /^cck_([a-f0-9]{32})\.([A-Za-z0-9_-]{20,})$/;

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyPrincipal {
  key: AdminApiKeyRow & { scopes: ApiKeyScope[] };
  admin: AdminRow;
}

export function generateApiKey(): { id: string; token: string; tokenHash: Promise<string> } {
  const raw = crypto.randomUUID().replace(/-/g, "");
  const token = `cck_${raw}.${randomToken(32)}`;
  return { id: `apk_${raw}`, token, tokenHash: sha256Hex(token) };
}

export function parseApiKeyScopes(raw: string | null | undefined): ApiKeyScope[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is ApiKeyScope =>
      typeof value === "string" && (API_KEY_SCOPES as readonly string[]).includes(value));
  } catch {
    return [];
  }
}

export function normalizeApiKeyScopes(input?: string[] | null): ApiKeyScope[] {
  const values = Array.isArray(input) && input.length > 0 ? input : [...DEFAULT_API_KEY_SCOPES];
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  for (const value of unique) {
    if (!(API_KEY_SCOPES as readonly string[]).includes(value)) {
      throw new HttpError(400, "invalid_scope", `Unknown API key scope: ${value}`);
    }
  }
  return unique.includes("*") ? ["*"] : unique as ApiKeyScope[];
}

export function apiKeyHasScope(scopes: ApiKeyScope[], required: string): boolean {
  if (scopes.includes("*") || scopes.includes(required as ApiKeyScope)) return true;
  // Write permission implies read permission for the same resource.
  if (required.endsWith(":read")) {
    const writeScope = `${required.slice(0, -5)}:write`;
    if (scopes.includes(writeScope as ApiKeyScope)) return true;
  }
  return false;
}

/**
 * Maps an admin route to the scope needed by an API key. `null` means the
 * route is available to any authenticated administrator (still subject to the
 * session-only rules). Unmapped routes require the wildcard scope so new admin
 * APIs are not silently exposed to business-scoped keys.
 */
export function requiredScopesForRequest(method: string, path: string): string | null {
  const normalized = path.replace(/\/+$/, "") || "/";
  const upper = method.toUpperCase();
  if (upper === "OPTIONS") return null;

  if (
    normalized === "/api/admin/me" ||
    normalized === "/api/admin/capabilities" ||
    normalized === "/api/admin/logout" ||
    normalized === "/api/admin/api-keys" ||
    normalized.startsWith("/api/admin/api-keys/")
  ) {
    return null;
  }

  // Page preview is a POST but only reads a draft document.
  if (/^\/api\/admin\/pages\/[^/]+\/preview$/.test(normalized)) return "pages:read";

  // Storage credentials are sensitive: any write/test requires the wildcard,
  // while reading provider status is part of normal media access.
  if (normalized.startsWith("/api/admin/media/storage")) {
    return ["GET", "HEAD"].includes(upper) ? "media:read" : "*";
  }

  const write = !["GET", "HEAD"].includes(upper);
  const resource = (() => {
    if (normalized === "/api/admin/dashboard") return "dashboard";
    if (normalized.startsWith("/api/admin/products")) return "products";
    if (normalized.startsWith("/api/admin/categories")) return "categories";
    if (normalized.startsWith("/api/admin/media")) return "media";
    if (normalized.startsWith("/api/admin/pages")) return "pages";
    if (normalized.startsWith("/api/admin/orders")) return "orders";
    if (normalized.startsWith("/api/admin/customers")) return "customers";
    if (normalized.startsWith("/api/admin/coupons")) return "coupons";
    if (normalized.startsWith("/api/admin/shipping")) return "shipping";
    if (normalized.startsWith("/api/admin/tax-rates")) return "tax";
    return null;
  })();

  if (!resource) return "*";
  if (resource === "dashboard") return "dashboard:read";
  return `${resource}:${write ? "write" : "read"}`;
}

/** Operations that a bearer key must never perform, even with `*`. */
export function isApiKeySessionOnly(method: string, path: string): boolean {
  const normalized = path.replace(/\/+$/, "") || "/";
  const upper = method.toUpperCase();
  if (normalized.startsWith("/api/admin/plugins")) return true;
  if (normalized === "/api/admin/settings/password") return true;
  if (normalized === "/api/admin/logout") return true;
  if (normalized === "/api/admin/api-keys" && upper === "POST") return true;
  if (normalized.startsWith("/api/admin/api-keys/") && upper === "DELETE" && normalized !== "/api/admin/api-keys/self") {
    return true;
  }
  return false;
}

function toView(row: AdminApiKeyRow): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    prefix: `cck_${row.id.slice(4, 12)}…`,
    scopes: parseApiKeyScopes(row.scopes_json),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export async function createApiKey(
  db: Database,
  adminId: string,
  input: { name?: string; scopes?: string[]; expiresAt?: string | null } = {},
): Promise<ApiKeyView & { token: string }> {
  const name = String(input.name ?? "").trim() || "CLI";
  if (name.length > 80) throw new HttpError(400, "invalid_name", "API key names must be 80 characters or fewer.");
  const scopes = normalizeApiKeyScopes(input.scopes);
  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const timestamp = Date.parse(input.expiresAt);
    if (!Number.isFinite(timestamp)) throw new HttpError(400, "invalid_expiry", "expiresAt must be an ISO-8601 date.");
    if (timestamp <= Date.now()) throw new HttpError(400, "invalid_expiry", "expiresAt must be in the future.");
    expiresAt = new Date(timestamp).toISOString();
  }

  const active = await db.first<{ count: number }>(
    "SELECT COUNT(*) AS count FROM admin_api_keys WHERE admin_id = ? AND revoked_at IS NULL",
    [adminId],
  );
  if (Number(active?.count ?? 0) >= MAX_KEYS_PER_ADMIN) {
    throw new HttpError(409, "key_limit_reached", `Each administrator can have at most ${MAX_KEYS_PER_ADMIN} active API keys.`);
  }

  const generated = generateApiKey();
  const now = nowIso();
  const tokenHash = await generated.tokenHash;
  await db.run(
    `INSERT INTO admin_api_keys (id, admin_id, name, token_hash, scopes_json, created_at, last_used_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
    [generated.id, adminId, name, tokenHash, JSON.stringify(scopes), now, expiresAt],
  );

  return {
    id: generated.id,
    name,
    prefix: `cck_${generated.id.slice(4, 12)}…`,
    scopes,
    createdAt: now,
    lastUsedAt: null,
    expiresAt,
    revokedAt: null,
    token: generated.token,
  };
}

export async function listApiKeys(db: Database, adminId: string): Promise<ApiKeyView[]> {
  const rows = await db.all<AdminApiKeyRow>(
    "SELECT * FROM admin_api_keys WHERE admin_id = ? ORDER BY created_at DESC",
    [adminId],
  );
  return rows.map(toView);
}

export async function revokeApiKey(db: Database, adminId: string, keyId: string): Promise<boolean> {
  const result = await db.run(
    "UPDATE admin_api_keys SET revoked_at = ? WHERE id = ? AND admin_id = ? AND revoked_at IS NULL",
    [nowIso(), keyId, adminId],
  );
  return Number(result.meta.changes ?? 0) > 0;
}

export async function revokeAllApiKeysForAdmin(db: Database, adminId: string): Promise<number> {
  const result = await db.run(
    "UPDATE admin_api_keys SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL",
    [nowIso(), adminId],
  );
  return Number(result.meta.changes ?? 0);
}

export async function authenticateApiKey(db: Database, token: string): Promise<ApiKeyPrincipal | null> {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const keyId = `apk_${match[1]}`;
  const row = await db.first<AdminApiKeyRow & {
    admin_email: string;
    admin_name: string;
    admin_role: AdminRow["role"];
    password_hash: string;
    admin_created_at: string;
    admin_updated_at: string;
    last_login_at: string | null;
  }>(
    `SELECT k.*, a.email AS admin_email, a.name AS admin_name, a.role AS admin_role,
            a.password_hash, a.created_at AS admin_created_at, a.updated_at AS admin_updated_at,
            a.last_login_at
     FROM admin_api_keys k JOIN admins a ON a.id = k.admin_id
     WHERE k.id = ? LIMIT 1`,
    [keyId],
  );
  if (!row || row.revoked_at) return null;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null;

  const hash = await sha256Hex(token);
  if (!constantTimeEqual(hash, row.token_hash)) return null;

  const admin: AdminRow = {
    id: row.admin_id,
    email: row.admin_email,
    name: row.admin_name,
    role: row.admin_role,
    password_hash: row.password_hash,
    created_at: row.admin_created_at,
    updated_at: row.admin_updated_at,
    last_login_at: row.last_login_at,
  };

  return {
    key: { ...row, scopes: parseApiKeyScopes(row.scopes_json) },
    admin,
  };
}

export async function touchApiKey(db: Database, keyId: string): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - LAST_USED_THROTTLE_MS).toISOString();
  try {
    await db.run(
      "UPDATE admin_api_keys SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
      [now.toISOString(), keyId, cutoff],
    );
  } catch {
    // Usage accounting must never fail an authenticated request.
  }
}
