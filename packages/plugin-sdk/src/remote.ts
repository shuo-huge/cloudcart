import { z } from "zod";
import { PLUGIN_TYPES, type PluginType } from "@cloudcart/shared";
import { PLUGIN_API_VERSION, type PluginManifest } from "./manifest";

/** Permissions a remote plugin may request. Nothing else is accepted. */
export const REMOTE_PLUGIN_PERMISSIONS = [
  "store:read",
  "products:read",
  "orders:read",
  "settings:read",
  "settings:write",
  "events:write",
] as const;

export type RemotePluginPermission = (typeof REMOTE_PLUGIN_PERMISSIONS)[number];

export interface RemotePluginAdminPage {
  id: string;
  label: string;
  icon?: string;
}

export interface RemotePluginServiceConfig {
  baseUrl: string;
  auth: "hmac-sha256";
}

export interface RemotePluginAdminConfig {
  entryUrl: string;
  pages: RemotePluginAdminPage[];
}

export interface RemotePluginManifest extends PluginManifest {
  runtime: "remote";
  type: PluginType;
  service: RemotePluginServiceConfig;
  admin: RemotePluginAdminConfig;
}

export interface RemotePluginPreview {
  manifest: RemotePluginManifest;
  manifestUrl: string;
  manifestHash: string;
  adminOrigin: string;
  permissions: string[];
}

export interface RemotePluginHealth {
  ok: boolean;
  version?: string;
  message?: string;
}

export type RemotePluginErrorCode =
  | "manifest_invalid"
  | "manifest_unreachable"
  | "manifest_too_large"
  | "plugin_not_found"
  | "plugin_not_remote"
  | "plugin_disabled"
  | "plugin_not_installed"
  | "invalid_url"
  | "permission_denied"
  | "token_invalid"
  | "token_expired"
  | "service_timeout"
  | "service_error"
  | "replay_detected";

export class RemoteManifestValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "RemoteManifestValidationError";
    this.issues = issues;
  }
}

export interface RemoteUrlOptions {
  /** Test/E2E only. Never enable in production. */
  allowInsecure?: boolean;
}

const PRIVATE_V4 = [
  [0, 0, 0, 0, 8],
  [10, 0, 0, 0, 8],
  [100, 64, 0, 0, 10],
  [127, 0, 0, 0, 8],
  [169, 254, 0, 0, 16],
  [172, 16, 0, 0, 12],
  [192, 0, 0, 0, 24],
  [192, 168, 0, 0, 16],
  [198, 18, 0, 0, 15],
] as const;

function ipv4Bytes(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return NaN;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : NaN;
  });
  return bytes.every((value) => Number.isFinite(value)) ? bytes : null;
}

function isPrivateIpv4(bytes: number[]): boolean {
  return PRIVATE_V4.some(([a, b, c, d, bits]) => {
    const value = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
    const address = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (address & mask) === (value & mask);
  });
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") ||
      host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home.arpa")) {
    return true;
  }
  const bytes = ipv4Bytes(host);
  if (bytes) return isPrivateIpv4(bytes);
  if (host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  return false;
}

/**
 * Validates a remote plugin URL. Production requires HTTPS on port 443 and a
 * public hostname. `allowInsecure` is only for local development/E2E.
 */
export function validateRemoteUrl(value: string, options: RemoteUrlOptions = {}): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteManifestValidationError("The URL is invalid.");
  }
  if (url.username || url.password) {
    throw new RemoteManifestValidationError("URLs must not contain embedded credentials.");
  }
  const hostname = url.hostname.toLowerCase();
  const isLocal = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  if (options.allowInsecure && isLocal) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new RemoteManifestValidationError("Only HTTP(S) is allowed for local plugin URLs.");
    }
    return url.toString();
  }
  if (url.protocol !== "https:") {
    throw new RemoteManifestValidationError("Remote plugin URLs must use HTTPS.");
  }
  if (url.port && url.port !== "443") {
    throw new RemoteManifestValidationError("Remote plugin URLs must use port 443.");
  }
  if (!hostname.includes(".")) {
    throw new RemoteManifestValidationError("Remote plugin URLs must use a public hostname.");
  }
  if (isPrivateHost(hostname)) {
    throw new RemoteManifestValidationError("Private, loopback, and internal hosts are not allowed.");
  }
  return url.toString();
}

export function remoteAdminOrigin(manifest: RemotePluginManifest): string {
  return new URL(manifest.admin.entryUrl).origin;
}

const pluginIdSchema = z.string().regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/, "Invalid plugin id.").max(80);
const semverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "Use Semantic Versioning.");
const pageSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Invalid page id."),
  label: z.string().trim().min(1).max(60),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/, "Invalid icon name.").optional(),
}).strict();

function urlSchema(options: RemoteUrlOptions) {
  return z.string().trim().min(8).max(2048).superRefine((value, ctx) => {
    try {
      validateRemoteUrl(value, options);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid URL.",
      });
    }
  });
}

export function remotePluginManifestSchema(options: RemoteUrlOptions = {}) {
  const url = urlSchema(options);
  return z.object({
    id: pluginIdSchema,
    name: z.string().trim().min(1).max(120),
    version: semverSchema,
    apiVersion: z.literal(PLUGIN_API_VERSION),
    type: z.enum(PLUGIN_TYPES),
    runtime: z.literal("remote"),
    description: z.string().trim().min(1).max(500),
    author: z.string().trim().max(120).optional(),
    icon: z.string().trim().max(120).optional(),
    capabilities: z.array(z.string().regex(/^[a-z0-9_.-]{1,80}$/)).max(30).default([]),
    permissions: z.array(z.enum(REMOTE_PLUGIN_PERMISSIONS)).max(20).default([]),
    dependencies: z.array(z.string().max(80)).max(20).optional(),
    service: z.object({
      baseUrl: url,
      auth: z.literal("hmac-sha256"),
    }).strict(),
    admin: z.object({
      entryUrl: url,
      pages: z.array(pageSchema).max(10).default([]),
    }).strict(),
  }).strict();
}

export function parseRemotePluginManifest(
  input: unknown,
  options: RemoteUrlOptions = {},
): RemotePluginManifest {
  const result = remotePluginManifestSchema(options).safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`);
    throw new RemoteManifestValidationError("The remote plugin manifest is invalid.", issues);
  }
  const manifest = result.data as RemotePluginManifest;
  manifest.service = {
    ...manifest.service,
    baseUrl: validateRemoteUrl(manifest.service.baseUrl, options),
  };
  manifest.admin = {
    ...manifest.admin,
    entryUrl: validateRemoteUrl(manifest.admin.entryUrl, options),
  };
  const serviceUrl = new URL(manifest.service.baseUrl);
  if (serviceUrl.search || serviceUrl.hash) {
    throw new RemoteManifestValidationError("The service base URL must not contain a query string or fragment.");
  }
  manifest.permissions = [...new Set(manifest.permissions)];
  return manifest;
}

export const PLUGIN_POSTMESSAGE = {
  ready: "cloudcart:ready",
  token: "cloudcart:token",
  refreshToken: "cloudcart:refresh-token",
  error: "cloudcart:error",
} as const;

export const PLUGIN_HMAC_HEADERS = {
  plugin: "x-cloudcart-plugin",
  store: "x-cloudcart-store-id",
  timestamp: "x-cloudcart-timestamp",
  nonce: "x-cloudcart-nonce",
  signature: "x-cloudcart-signature",
} as const;

export const PLUGIN_JWT_INFO = "cloudcart:plugin-jwt:v1";
export const PLUGIN_TOKEN_TTL_SECONDS = 5 * 60;
export const PLUGIN_CSP_ALLOW_INSECURE_ENV = "PLUGIN_ALLOW_INSECURE_ORIGINS";
