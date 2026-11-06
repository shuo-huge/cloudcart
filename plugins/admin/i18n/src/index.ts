import type { Database } from "@cloudcart/database";
import type { PluginManifest } from "@cloudcart/plugin-sdk";
import { ADMIN_LOCALES, ZH_CN_MESSAGES, type AdminLocale } from "./translations";

export { ADMIN_LOCALES, ZH_CN_MESSAGES };
export type { AdminLocale };

export const manifest: PluginManifest = {
  id: "admin-i18n",
  name: "Admin Language Pack",
  version: "1.0.0",
  apiVersion: "1",
  type: "admin",
  description: "Translate the CloudCart admin interface into English or Simplified Chinese. Ships with the Worker; enabling it never downloads code.",
  capabilities: ["admin.i18n"],
  permissions: ["admin:ui"],
  dependencies: [],
};

export interface AdminI18nSettings {
  defaultLocale: string;
  showSwitcher: boolean;
}

export interface AdminI18nState extends AdminI18nSettings {
  enabled: boolean;
  locales: AdminLocale[];
  dictionaries: Record<string, Record<string, string>>;
}

export const DEFAULT_ADMIN_I18N_SETTINGS: AdminI18nSettings = {
  defaultLocale: "en",
  showSwitcher: true,
};

/**
 * Reads the plugin's runtime settings from D1. Translation dictionaries are
 * only exposed while the plugin is enabled; disabling it returns the admin to
 * English without deleting the stored settings.
 */
export async function getAdminI18nState(db: Pick<Database, "first" | "all">): Promise<AdminI18nState> {
  const plugin = await db.first<{ enabled: number }>(
    "SELECT enabled FROM plugins WHERE id = 'admin-i18n'",
  );
  const rows = await db.all<{ key: string; value: string }>(
    "SELECT key, value FROM plugin_settings WHERE plugin_id = 'admin-i18n'",
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const enabled = plugin?.enabled === 1;
  const defaultLocale = ADMIN_LOCALES.some((locale) => locale.code === values.defaultLocale)
    ? values.defaultLocale!
    : DEFAULT_ADMIN_I18N_SETTINGS.defaultLocale;
  const showSwitcher = values.showSwitcher !== "0";
  return {
    enabled,
    defaultLocale,
    showSwitcher,
    locales: ADMIN_LOCALES,
    dictionaries: enabled
      ? {
        en: {},
        "zh-CN": ZH_CN_MESSAGES,
      }
      : {},
  };
}

export function getAdminI18nSettings(db: Pick<Database, "first" | "all">): Promise<AdminI18nSettings> {
  return getAdminI18nState(db).then(({ defaultLocale, showSwitcher }) => ({ defaultLocale, showSwitcher }));
}
