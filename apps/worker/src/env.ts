export interface Env {
  DB: D1Database;
  /** Optional object storage. External image URLs work without R2. */
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  /** Worker secret. Used for session signatures and payment-secret encryption. */
  APP_MASTER_KEY: string;
  /** One-time token that permits initial admin creation. */
  SETUP_TOKEN?: string;
  APP_ENV?: string;
  STORE_NAME?: string;
  STORE_CURRENCY?: string;
  STORE_TIMEZONE?: string;
}

export interface AppVariables {
  adminId: string;
  adminEmail: string;
  sessionId: string;
  csrfToken: string;
}

export type AppContext = {
  Bindings: Env;
  Variables: AppVariables;
};

export const CLOUDCART_VERSION = "0.1.0";
