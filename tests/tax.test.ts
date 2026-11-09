import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import {
  createTaxRate,
  orderTotalWithTax,
  resolveTaxRate,
  taxAmountCents,
  taxableBaseCents,
} from "@cloudcart/core";
import { addToCart, checkoutForm, createClient, createProduct } from "./support";

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

async function resetTaxRates(): Promise<void> {
  await database().run("DELETE FROM tax_rates");
}

async function setSetting(key: string, value: string): Promise<void> {
  await database().run(
    `INSERT INTO store_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, new Date().toISOString()],
  );
}

describe("tax calculation", () => {
  it("adds exclusive tax on top of the taxable base", () => {
    const taxable = taxableBaseCents(2500, 0, 500);
    expect(taxAmountCents(taxable, 825, false)).toBe(248);
    expect(orderTotalWithTax(2500, 0, 500, 248, false)).toBe(3248);
  });

  it("extracts inclusive tax without changing the total", () => {
    expect(taxAmountCents(11000, 1000, true)).toBe(1000);
    expect(orderTotalWithTax(11000, 0, 0, 1000, true)).toBe(11000);
  });

  it("applies discounts before tax and handles zero rates", () => {
    const taxable = taxableBaseCents(10000, 2000, 500);
    expect(taxable).toBe(8500);
    expect(taxAmountCents(taxable, 0, false)).toBe(0);
    expect(orderTotalWithTax(10000, 2000, 500, 0, false)).toBe(8500);
  });

  it("resolves exact region, country-wide, and default rates", async () => {
    const db = database();
    await setSetting("tax.default_rate_bps", "500");
    await setSetting("tax.default_name", "Default tax");
    await setSetting("tax.included", "0");

    await createTaxRate(db, { name: "US nationwide", country: "US", region: "", rateBps: 600, active: true });
    await createTaxRate(db, { name: "California", country: "US", region: "CA", rateBps: 725, active: true });
    await createTaxRate(db, { name: "DE VAT", country: "DE", region: "", rateBps: 1900, active: true });

    expect(await resolveTaxRate(db, "us", "ca")).toMatchObject({ name: "California", rateBps: 725, included: false });
    expect(await resolveTaxRate(db, "US", "NY")).toMatchObject({ name: "US nationwide", rateBps: 600 });
    expect(await resolveTaxRate(db, "DE")).toMatchObject({ name: "DE VAT", rateBps: 1900 });
    expect(await resolveTaxRate(db, "JP", "")).toMatchObject({ name: "Default tax", rateBps: 500 });
  });

  it("lets an active zero-rate rule override a non-zero default", async () => {
    const db = database();
    await setSetting("tax.default_rate_bps", "500");
    await createTaxRate(db, { name: "Zero", country: "SG", region: "", rateBps: 0, active: true });
    expect(await resolveTaxRate(db, "SG", "")).toMatchObject({ name: "Zero", rateBps: 0 });
  });

  it("falls back when a matching rule is inactive", async () => {
    const db = database();
    await setSetting("tax.default_rate_bps", "800");
    await createTaxRate(db, { name: "Inactive", country: "FR", region: "", rateBps: 2000, active: false });
    expect(await resolveTaxRate(db, "FR", "")).toMatchObject({ rateBps: 800 });
  });

  it("rejects duplicate country and region rules", async () => {
    const db = database();
    await createTaxRate(db, { name: "First", country: "GB", region: "", rateBps: 2000, active: true });
    await expect(createTaxRate(db, { name: "Second", country: "gb", region: "", rateBps: 1000, active: true }))
      .rejects.toMatchObject({ code: "tax_rate_exists" });
  });
});

describe("checkout tax integration", () => {
  it("persists exclusive tax in the order total", async () => {
    const client = createClient();
    await client.ensureSession();
    await resetTaxRates();
    const settings = await client.json("/api/admin/settings", "PUT", {
      settings: { "tax.default_rate_bps": "825", "tax.default_name": "Sales tax", "tax.included": "0" },
    }, client.csrfHeaders());
    expect(settings.status).toBe(200);

    const productId = await createProduct(client);
    await addToCart(client, productId, 2);
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email: "tax-buyer@example.com" }).toString(),
    });
    expect(checkout.status).toBe(303);

    const order = await database().first<{ tax_cents: number; total_cents: number; metadata_json: string }>(
      "SELECT tax_cents, total_cents, metadata_json FROM orders ORDER BY created_at DESC LIMIT 1",
    );
    expect(order?.tax_cents).toBe(413);
    expect(order?.total_cents).toBe(5413);
    expect(JSON.parse(order!.metadata_json).tax).toMatchObject({ name: "Sales tax", rateBps: 825, included: false });
  });

  it("uses a region rule over the default rate", async () => {
    const client = createClient();
    await client.ensureSession();
    await resetTaxRates();
    await client.json("/api/admin/settings", "PUT", {
      settings: { "tax.default_rate_bps": "825", "tax.included": "0" },
    }, client.csrfHeaders());
    const rate = await client.json("/api/admin/tax-rates", "POST", {
      name: "California tax", country: "US", region: "CA", rateBps: 725, active: true,
    }, client.csrfHeaders());
    expect(rate.status).toBe(201);

    const productId = await createProduct(client, { name: "Region Tax Item", slug: "region-tax-item" });
    await addToCart(client, productId, 2);
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email: "region-buyer@example.com" }).toString(),
    });
    expect(checkout.status).toBe(303);
    const order = await database().first<{ tax_cents: number; total_cents: number }>(
      "SELECT tax_cents, total_cents FROM orders ORDER BY created_at DESC LIMIT 1",
    );
    expect(order?.tax_cents).toBe(363);
    expect(order?.total_cents).toBe(5363);
  });

  it("keeps the total unchanged for tax-inclusive prices", async () => {
    const client = createClient();
    await client.ensureSession();
    await resetTaxRates();
    await client.json("/api/admin/settings", "PUT", {
      settings: { "tax.default_rate_bps": "1000", "tax.included": "1" },
    }, client.csrfHeaders());

    const productId = await createProduct(client, { name: "Inclusive Item", slug: "inclusive-item" });
    await addToCart(client, productId, 2);
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email: "inclusive-buyer@example.com", state: "NY", city: "New York" }).toString(),
    });
    expect(checkout.status).toBe(303);
    const order = await database().first<{ tax_cents: number; total_cents: number }>(
      "SELECT tax_cents, total_cents FROM orders ORDER BY created_at DESC LIMIT 1",
    );
    expect(order?.tax_cents).toBe(455);
    expect(order?.total_cents).toBe(5000);
  });
});
