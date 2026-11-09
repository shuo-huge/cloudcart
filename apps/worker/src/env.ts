import type { EmailBinding } from "@cloudcart/plugin-sdk";

export interface Env {
  DB: D1Database;
  /** Optional object storage. External image URLs work without R2. */
  MEDIA?: R2Bucket;
  /** Optional Cloudflare Email Workers send_email binding. */
  EMAIL?: EmailBinding;
  ASSETS: Fetcher;
  /** Worker secret. Used for session signatures and payment-secret encryption. */
  APP_MASTER_KEY: string;
  /** One-time token that permits initial admin creation. */
  SETUP_TOKEN?: string;
  APP_ENV?: string;
  /** Test/E2E only: allow http://127.0.0.1 remote plugin URLs. */
  PLUGIN_ALLOW_INSECURE_ORIGINS?: string;
  STORE_NAME?: string;
  STORE_CURRENCY?: string;
  STORE_TIMEZONE?: string;
}

export interface AppVariables {
  adminId: string;
  adminEmail: string;
  sessionId: string;
  csrfToken: string;
  pluginId?: string;
  pluginPermissions?: string[];
  pluginStoreId?: string;
  pluginAdminId?: string;
}

export type AppContext = {
  Bindings: Env;
  Variables: AppVariables;
};

export const CLOUDCART_VERSION = "0.3.0";
