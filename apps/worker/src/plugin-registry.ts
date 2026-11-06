import { PluginRegistry } from "@cloudcart/core";
import type { PaymentPlugin } from "@cloudcart/plugin-sdk";
import { manifest as manualPaymentManifest, manualPaymentPlugin } from "@cloudcart/plugin-manual-payment";
import { manifest as adminI18nManifest } from "@cloudcart/plugin-admin-i18n";
import stripePaymentPlugin from "@cloudcart/plugin-stripe";
import paypalPaymentPlugin from "@cloudcart/plugin-paypal";

/**
 * Build-time plugin registry. Only plugins listed here are bundled into the
 * Worker; the admin can enable/disable them but cannot upload new code.
 */
export const pluginRegistry = new PluginRegistry([
  manualPaymentManifest,
  stripePaymentPlugin.manifest,
  paypalPaymentPlugin.manifest,
  adminI18nManifest,
]);

const paymentPlugins = new Map<string, PaymentPlugin>([
  [manualPaymentPlugin.manifest.id, manualPaymentPlugin as PaymentPlugin],
  [stripePaymentPlugin.manifest.id, stripePaymentPlugin as PaymentPlugin],
  [paypalPaymentPlugin.manifest.id, paypalPaymentPlugin as PaymentPlugin],
]);

export function getPaymentPlugin(id: string): PaymentPlugin | null {
  return paymentPlugins.get(id) ?? null;
}
