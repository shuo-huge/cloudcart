import type { Database } from "@cloudcart/database";
import type { PaymentPlugin } from "@cloudcart/plugin-sdk";
import { getRemotePluginRow, storedRemoteManifest } from "@cloudcart/core";
import { getPaymentPlugin } from "./plugin-registry";
import { RemotePaymentPlugin } from "./remote-payment-plugin";

/**
 * Resolves a bundled payment plugin first, then an installed remote payment
 * plugin. `includeDisabled` is used for historical webhook/refund paths.
 */
export async function resolvePaymentPlugin(
  db: Database,
  masterKey: string,
  pluginId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<PaymentPlugin | null> {
  const bundled = getPaymentPlugin(pluginId);
  if (bundled) return bundled;
  const row = await getRemotePluginRow(db, pluginId);
  if (!row || row.type !== "payment") return null;
  if (!options.includeDisabled && row.enabled !== 1) return null;
  const manifest = storedRemoteManifest(row);
  if (!manifest) return null;
  return new RemotePaymentPlugin(db, masterKey, row, manifest);
}
