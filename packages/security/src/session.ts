import { fromBase64Url, randomToken, toBase64Url } from "@cloudcart/shared";
import { constantTimeEqual, hashToken, hmacSha256Base64Url, newOpaqueToken, randomBytes, utf8 } from "./crypto";

export interface SessionTokenParts {
  token: string;
  tokenHash: string;
  sessionId: string;
}

/**
 * Session cookie value: <sessionId>.<secret>.<hmac>.
 * The HMAC is derived from APP_MASTER_KEY so forged cookies are rejected
 * before any database lookup. Only the hash of the full token is stored.
 */
export async function createSessionToken(masterKey: string, sessionId: string): Promise<SessionTokenParts> {
  const secret = newOpaqueToken(32);
  const signature = await hmacSha256Base64Url(masterKey, `${sessionId}.${secret}`, "cloudcart:session:v1");
  const token = `${sessionId}.${secret}.${signature}`;
  return { token, tokenHash: await hashToken(token), sessionId };
}

export async function parseSessionToken(masterKey: string, token: string): Promise<{ sessionId: string; tokenHash: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, secret, signature] = parts as [string, string, string];
  if (!sessionId || !secret || !signature) return null;
  const expected = await hmacSha256Base64Url(masterKey, `${sessionId}.${secret}`, "cloudcart:session:v1");
  if (!constantTimeEqual(expected, signature)) return null;
  return { sessionId, tokenHash: await hashToken(token) };
}

export function newCsrfToken(): string {
  return newOpaqueToken(24);
}

/** CSPRNG-backed request identifier used for rate limiting keys. */
export function newRequestId(): string {
  return toBase64Url(randomBytes(12));
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Strict" | "Lax" | "None"; path?: string } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  return parts.join("; ");
}

export function cookieIsSecure(requestUrl: string): boolean {
  try {
    return new URL(requestUrl).protocol === "https:";
  } catch {
    return true;
  }
}

/** Verify a double-submit CSRF token. */
export function verifyCsrf(headerToken: string | null | undefined, storedToken: string | null | undefined): boolean {
  if (!headerToken || !storedToken) return false;
  return constantTimeEqual(headerToken, storedToken);
}

/** Used for tests and legacy payload inspection. */
export function decodeBase64Url(value: string): Uint8Array {
  return fromBase64Url(value);
}

export function bytesEqual(a: string, b: string): boolean {
  return constantTimeEqual(utf8(a), utf8(b));
}
