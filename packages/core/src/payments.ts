import type { Database } from "@cloudcart/database";
import { loadPluginRuntimeConfig } from "./plugins";

export const PAYMENT_SECRET_KEYS: Record<string, string[]> = {
  stripe: ["secretKey", "webhookSecret"],
  paypal: ["clientSecret"],
  manual: [],
};

export interface PaymentMethod {
  id: string;
  name: string;
  description: string;
}

/**
 * Payment methods are derived from plugins that are both bundled into this
 * Worker build and enabled in D1. A plugin row without bundled code is never
 * presented to customers. Core does not import individual payment providers;
 * the payment registry supplies bundled plugin code at the application edge.
 */
export async function getEnabledPaymentMethods(db: Database): Promise<PaymentMethod[]> {
  const rows = await db.all<{ id: string; name: string; description: string }>(
    `SELECT id, name, description FROM plugins
     WHERE type = 'payment' AND enabled = 1 AND uninstalled_at IS NULL
       AND (built_in = 1 OR runtime = 'remote')
     ORDER BY id`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
  }));
}

export async function isPaymentMethodEnabled(db: Database, methodId: string): Promise<boolean> {
  if (!/^[a-z0-9-]{1,60}$/.test(methodId)) return false;
  return db.exists(
    `SELECT 1 FROM plugins WHERE id = ? AND type = 'payment' AND enabled = 1 AND uninstalled_at IS NULL
       AND (built_in = 1 OR runtime = 'remote')`,
    [methodId],
  );
}

/**
 * Loads a payment provider's runtime configuration. Encrypted values are
 * decrypted in memory only; they are never returned to the browser or logged.
 */
export async function loadPaymentRuntimeConfig(
  db: Database,
  pluginId: string,
  masterKey: string,
): Promise<Record<string, string>> {
  return loadPluginRuntimeConfig(db, pluginId, masterKey);
}
