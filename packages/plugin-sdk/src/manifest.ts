import type { PluginType } from "@cloudcart/shared";
import type { RemotePluginAdminConfig, RemotePluginServiceConfig } from "./remote";

export const PLUGIN_API_VERSION = "1";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  type: PluginType;
  description: string;
  /** Capabilities implemented by this plugin (e.g. "payment.checkout"). */
  capabilities: string[];
  /** Core resources this plugin may access (e.g. "orders:read"). */
  permissions: string[];
  dependencies?: string[];
  icon?: string;
  author?: string;
  /** Defaults to "bundled" for backward compatibility. */
  runtime?: "bundled" | "remote";
  service?: RemotePluginServiceConfig;
  admin?: RemotePluginAdminConfig;
}

export interface PluginHealth {
  ok: boolean;
  message?: string;
}

export interface CloudCartPlugin {
  manifest: PluginManifest;
  register(context: PluginContext): void | Promise<void>;
  onEnable?(context: PluginContext): Promise<void>;
  onDisable?(context: PluginContext): Promise<void>;
}

/**
 * Context handed to plugins. Plugins never receive the raw D1Database; all
 * data access goes through the core service façades and explicit permissions.
 */
export interface PluginContext {
  store: {
    name: string;
    currency: string;
    baseUrl: string;
  };
  permissions: Set<string>;
  log: (event: string, details?: Record<string, unknown>) => void;
  /** Safe, allow-listed settings access. */
  settings: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
}

export function assertPluginManifest(manifest: PluginManifest): void {
  if (!/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(manifest.id)) {
    throw new Error(`Invalid plugin id: ${manifest.id}`);
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`Plugin ${manifest.id} must use Semantic Versioning`);
  }
  if (manifest.apiVersion !== PLUGIN_API_VERSION) {
    throw new Error(`Plugin ${manifest.id} targets API ${manifest.apiVersion}, expected ${PLUGIN_API_VERSION}`);
  }
}

export function isApiCompatible(manifest: PluginManifest, coreApiVersion = PLUGIN_API_VERSION): boolean {
  return manifest.apiVersion === coreApiVersion;
}
