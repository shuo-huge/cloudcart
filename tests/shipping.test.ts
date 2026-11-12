import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import { createClient } from "./support";

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

describe("shipping rates", () => {
  it("parses amounts with the store currency exponent", async () => {
    const client = createClient();
    await client.ensureSession();
    try {
      const currency = await client.json("/api/admin/settings", "PUT", {
        settings: { "store.currency": "JPY" },
      }, client.csrfHeaders());
      expect(currency.status).toBe(200);

      const zone = await client.json("/api/admin/shipping/zones", "POST", {
        name: "Japan",
        countries: ["JP"],
        isDefault: false,
      }, client.csrfHeaders());
      expect(zone.status).toBe(201);
      const zoneId = ((await zone.json()) as { data: { id: string } }).data.id;

      const rate = await client.json("/api/admin/shipping/rates", "POST", {
        zoneId,
        name: "Japan standard",
        price: "500",
        minOrder: "0",
        maxOrder: null,
        freeOver: null,
        isActive: true,
        position: 0,
      }, client.csrfHeaders());
      expect(rate.status).toBe(201);

      const stored = await database().first<{ price_cents: number }>(
        "SELECT price_cents FROM shipping_rates WHERE name = ?",
        ["Japan standard"],
      );
      expect(stored?.price_cents).toBe(500);
    } finally {
      await client.json("/api/admin/settings", "PUT", {
        settings: { "store.currency": "USD" },
      }, client.csrfHeaders());
    }
  });
});
