import type { Database } from "@cloudcart/database";
import { nowIso } from "@cloudcart/shared";

export const SETTING_KEYS = {
  storeName: "store.name",
  storeCurrency: "store.currency",
  storeLocale: "store.locale",
  storeEmail: "store.email",
  storePhone: "store.phone",
  storeAddress: "store.address",
  storeLogo: "store.logo",
  announcement: "store.announcement",
  seoTitle: "seo.title",
  seoDescription: "seo.description",
  seoOgImage: "seo.og_image",
  shippingCurrency: "shipping.currency",
  taxIncluded: "tax.included",
  maintenanceMessage: "store.maintenance_message",
} as const;

export async function getSetting(db: Database, key: string, fallback = ""): Promise<string> {
  const row = await db.first<{ value: string }>("SELECT value FROM store_settings WHERE key = ?", [key]);
  return row?.value ?? fallback;
}

export async function getSettings(db: Database): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string }>("SELECT key, value FROM store_settings");
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function setSetting(db: Database, key: string, value: string): Promise<void> {
  await db.run(
    `INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, nowIso()],
  );
}

export async function setSettings(db: Database, values: Record<string, string>): Promise<void> {
  const now = nowIso();
  const statements = Object.entries(values).map(([key, value]) =>
    db.prepare(
      `INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now],
    ),
  );
  await db.batch(statements);
}

export interface StoreConfig {
  name: string;
  currency: string;
  locale: string;
  email: string;
  phone: string;
  address: string;
  logo: string | null;
  announcement: string;
  seoTitle: string;
  seoDescription: string;
}

export async function loadStoreConfig(db: Database, env: { STORE_NAME?: string; STORE_CURRENCY?: string; STORE_TIMEZONE?: string }): Promise<StoreConfig> {
  const settings = await getSettings(db);
  return {
    name: settings[SETTING_KEYS.storeName] || env.STORE_NAME || "CloudCart",
    currency: (settings[SETTING_KEYS.storeCurrency] || env.STORE_CURRENCY || "USD").toUpperCase(),
    locale: settings[SETTING_KEYS.storeLocale] || "en-US",
    email: settings[SETTING_KEYS.storeEmail] || "",
    phone: settings[SETTING_KEYS.storePhone] || "",
    address: settings[SETTING_KEYS.storeAddress] || "",
    logo: settings[SETTING_KEYS.storeLogo] || null,
    announcement: settings[SETTING_KEYS.announcement] || "",
    seoTitle: settings[SETTING_KEYS.seoTitle] || "",
    seoDescription: settings[SETTING_KEYS.seoDescription] || "",
  };
}
