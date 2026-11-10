import { getMediaStorageStatus } from "@cloudcart/core";
import { Hono } from "hono";
import type { AppContext } from "../env";
import { CLOUDCART_VERSION } from "../env";
import { db } from "../lib";

export const capabilityRoutes = new Hono<AppContext>();

/**
 * Small, read-only discovery endpoint for the CLI and agents. It deliberately
 * exposes only capability flags, never secrets or store configuration.
 */
capabilityRoutes.get("/capabilities", async (c) => {
  const currency = await db(c).first<{ value: string }>(
    "SELECT value FROM store_settings WHERE key = 'store.currency'",
  );
  const mediaStorage = await getMediaStorageStatus(
    db(c),
    Boolean(c.env.MEDIA),
    c.env.APP_MASTER_KEY,
  );
  return c.json({
    ok: true,
    data: {
      version: CLOUDCART_VERSION,
      authMethod: c.get("authMethod"),
      scopes: c.get("apiKeyScopes") ?? [],
      uploads: mediaStorage.providers.r2.available || mediaStorage.providers.jsdelivr.available,
      mediaStorage,
      email: Boolean(c.env.EMAIL),
      currency: (currency?.value || c.env.STORE_CURRENCY || "USD").toUpperCase(),
    },
  });
});
