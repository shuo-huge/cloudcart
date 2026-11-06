import { fromBase64Url, randomToken, toBase64Url } from "@cloudcart/shared";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

export function fromUtf8(bytes: ArrayBuffer | Uint8Array): string {
  return decoder.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const data = typeof value === "string" ? utf8(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function constantTimeEqual(a: string | Uint8Array, b: string | Uint8Array): boolean {
  const left = typeof a === "string" ? utf8(a) : a;
  const right = typeof b === "string" ? utf8(b) : b;
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

async function importHkdf(masterKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", utf8(masterKey) as BufferSource, "HKDF", false, ["deriveKey", "deriveBits"]);
}

export async function deriveAesKey(masterKey: string, info = "cloudcart:aes-gcm:v1"): Promise<CryptoKey> {
  const ikm = await importHkdf(masterKey);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: utf8("cloudcart-master-salt-v1") as BufferSource,
      info: utf8(info) as BufferSource,
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function deriveHmacKey(masterKey: string, info = "cloudcart:hmac:v1"): Promise<CryptoKey> {
  const ikm = await importHkdf(masterKey);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: utf8("cloudcart-master-salt-v1") as BufferSource,
      info: utf8(info) as BufferSource,
    },
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}

export async function hmacSha256Base64Url(masterKey: string, message: string, info?: string): Promise<string> {
  const key = await deriveHmacKey(masterKey, info);
  const signature = await crypto.subtle.sign("HMAC", key, utf8(message) as BufferSource);
  return toBase64Url(new Uint8Array(signature));
}

/** Encrypt a secret for storage in D1. Format: v1.<iv_b64url>.<ciphertext_b64url> */
export async function encryptSecret(plaintext: string, masterKey: string): Promise<string> {
  if (!masterKey || masterKey.length < 16) throw new Error("APP_MASTER_KEY is missing or too short");
  const key = await deriveAesKey(masterKey);
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, utf8(plaintext) as BufferSource);
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptSecret(payload: string, masterKey: string): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Unsupported secret payload");
  const iv = fromBase64Url(parts[1]!);
  const cipher = fromBase64Url(parts[2]!);
  const key = await deriveAesKey(masterKey);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  );
  return fromUtf8(plain);
}

/** Constant-time token comparison helper for hashes stored in D1. */
export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function newOpaqueToken(bytes = 32): string {
  return randomToken(bytes);
}
