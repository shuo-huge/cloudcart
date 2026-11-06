import { base64ToBytes, bytesToBase64, constantTimeEqual, randomBytes, utf8 } from "./crypto";

/**
 * PBKDF2-HMAC-SHA256 password hashing via Web Crypto.
 *
 * The iteration count is chosen so that login stays well inside the Workers
 * Free CPU budget (PBKDF2 runs in the native crypto layer). 100,000 iterations
 * is the OWASP 2023 minimum recommendation for PBKDF2-SHA256.
 */
export const PBKDF2_ITERATIONS = 100_000;
const MAX_ITERATIONS = 1_000_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export async function hashPassword(
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (password.length > 1024) throw new Error("Password is too long");
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(key)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return false;
  try {
    const salt = base64ToBytes(parts[2]!);
    const expected = base64ToBytes(parts[3]!);
    const actual = await derive(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(stored: string): boolean {
  const parts = stored.split("$");
  return parts.length !== 4 || Number(parts[1]) !== PBKDF2_ITERATIONS;
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 1024) return "Password is too long.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations,
    },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}
