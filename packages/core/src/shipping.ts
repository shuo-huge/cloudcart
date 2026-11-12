import type { Database } from "@cloudcart/database";
import type { ShippingRateRow, ShippingZoneRow } from "@cloudcart/database";
import { HttpError, newId, nowIso, parseMoneyInput } from "@cloudcart/shared";
import { getSetting, SETTING_KEYS } from "./settings";
import { z } from "zod";

export const shippingZoneInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  countries: z.array(z.string().trim().length(2).toUpperCase()).max(300).default([]),
  isDefault: z.boolean().default(false),
});

export const shippingRateInputSchema = z.object({
  zoneId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  price: z.string().trim().default("0"),
  minOrder: z.string().trim().default("0"),
  maxOrder: z.string().trim().nullable().optional(),
  freeOver: z.string().trim().nullable().optional(),
  isActive: z.boolean().default(true),
  position: z.coerce.number().int().min(0).max(9999).default(0),
});

export interface ShippingOption {
  id: string;
  name: string;
  priceCents: number;
  zoneId: string;
}

export interface ZoneWithRates extends ShippingZoneRow {
  rates: ShippingRateRow[];
}

function parseAmount(value: string | null | undefined, field: string, currency: string): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  try {
    return parseMoneyInput(value, currency);
  } catch {
    throw new HttpError(400, "invalid_amount", `Invalid ${field}.`);
  }
}

export async function listZones(db: Database): Promise<ZoneWithRates[]> {
  const [zones, rates] = await db.batch([
    db.prepare("SELECT * FROM shipping_zones ORDER BY is_default DESC, name"),
    db.prepare("SELECT * FROM shipping_rates ORDER BY position, name"),
  ]);
  const zoneRows = (zones?.results ?? []) as unknown as ShippingZoneRow[];
  const rateRows = (rates?.results ?? []) as unknown as ShippingRateRow[];
  return zoneRows.map((zone) => ({
    ...zone,
    rates: rateRows.filter((rate) => rate.zone_id === zone.id),
  }));
}

export function zoneMatchesCountry(zone: ShippingZoneRow, country: string): boolean {
  try {
    const list = JSON.parse(zone.countries_json) as string[];
    return list.map((c) => c.toUpperCase()).includes(country.toUpperCase());
  } catch {
    return false;
  }
}

export async function getShippingOptions(
  db: Database,
  country: string,
  subtotalCents: number,
): Promise<ShippingOption[]> {
  const zones = await listZones(db);
  let zone = zones.find((z) => zoneMatchesCountry(z, country));
  if (!zone) zone = zones.find((z) => z.is_default === 1);
  if (!zone) return [];
  return zone.rates
    .filter((rate) => rate.is_active === 1)
    .filter((rate) => subtotalCents >= rate.min_order_cents)
    .filter((rate) => rate.max_order_cents === null || subtotalCents <= rate.max_order_cents)
    .map((rate) => ({
      id: rate.id,
      name: rate.name,
      priceCents: rate.free_over_cents !== null && subtotalCents >= rate.free_over_cents
        ? 0
        : rate.price_cents,
      zoneId: zone!.id,
    }));
}

export async function resolveShippingRate(
  db: Database,
  rateId: string | null | undefined,
  country: string,
  subtotalCents: number,
): Promise<ShippingOption> {
  const options = await getShippingOptions(db, country, subtotalCents);
  if (options.length === 0) {
    throw new HttpError(400, "no_shipping", "No shipping method is available for this address.");
  }
  if (!rateId) return options[0]!;
  const selected = options.find((option) => option.id === rateId);
  if (!selected) {
    throw new HttpError(400, "invalid_shipping", "The selected shipping method is not available for this address.");
  }
  return selected;
}

export async function createZone(db: Database, input: z.infer<typeof shippingZoneInputSchema>): Promise<string> {
  const id = newId("zone");
  const now = nowIso();
  const statements = [
    db.prepare(
      "INSERT INTO shipping_zones (id, name, countries_json, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, input.name.trim(), JSON.stringify(input.countries), input.isDefault ? 1 : 0, now, now],
    ),
  ];
  if (input.isDefault) {
    statements.unshift(db.prepare("UPDATE shipping_zones SET is_default = 0"));
  }
  await db.batch(statements);
  return id;
}

export async function updateZone(db: Database, id: string, input: z.infer<typeof shippingZoneInputSchema>): Promise<void> {
  const existing = await db.first<{ id: string }>("SELECT id FROM shipping_zones WHERE id = ?", [id]);
  if (!existing) throw new HttpError(404, "zone_not_found", "Shipping zone not found.");
  const statements = [
    db.prepare(
      "UPDATE shipping_zones SET name = ?, countries_json = ?, is_default = ?, updated_at = ? WHERE id = ?",
      [input.name.trim(), JSON.stringify(input.countries), input.isDefault ? 1 : 0, nowIso(), id],
    ),
  ];
  if (input.isDefault) {
    statements.unshift(db.prepare("UPDATE shipping_zones SET is_default = 0 WHERE id <> ?", [id]));
  }
  await db.batch(statements);
}

export async function deleteZone(db: Database, id: string): Promise<void> {
  const result = await db.run("DELETE FROM shipping_zones WHERE id = ?", [id]);
  if (!result.meta.changes) throw new HttpError(404, "zone_not_found", "Shipping zone not found.");
}

export async function createRate(db: Database, input: z.infer<typeof shippingRateInputSchema>): Promise<string> {
  const zone = await db.first<{ id: string }>("SELECT id FROM shipping_zones WHERE id = ?", [input.zoneId]);
  if (!zone) throw new HttpError(400, "invalid_zone", "Shipping zone not found.");
  const currency = await getSetting(db, SETTING_KEYS.storeCurrency, "USD");
  const id = newId("rate");
  const now = nowIso();
  await db.run(
    `INSERT INTO shipping_rates (id, zone_id, name, price_cents, min_order_cents, max_order_cents, free_over_cents,
       is_active, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.zoneId, input.name.trim(), parseAmount(input.price, "price", currency) ?? 0,
      parseAmount(input.minOrder, "minimum order", currency) ?? 0,
      parseAmount(input.maxOrder, "maximum order", currency),
      parseAmount(input.freeOver, "free shipping threshold", currency),
      input.isActive ? 1 : 0, input.position, now, now,
    ],
  );
  return id;
}

export async function updateRate(db: Database, id: string, input: z.infer<typeof shippingRateInputSchema>): Promise<void> {
  const currency = await getSetting(db, SETTING_KEYS.storeCurrency, "USD");
  const result = await db.run(
    `UPDATE shipping_rates SET name = ?, price_cents = ?, min_order_cents = ?, max_order_cents = ?,
       free_over_cents = ?, is_active = ?, position = ?, updated_at = ? WHERE id = ?`,
    [
      input.name.trim(), parseAmount(input.price, "price", currency) ?? 0,
      parseAmount(input.minOrder, "minimum order", currency) ?? 0,
      parseAmount(input.maxOrder, "maximum order", currency),
      parseAmount(input.freeOver, "free shipping threshold", currency),
      input.isActive ? 1 : 0, input.position, nowIso(), id,
    ],
  );
  if (!result.meta.changes) throw new HttpError(404, "rate_not_found", "Shipping rate not found.");
}

export async function deleteRate(db: Database, id: string): Promise<void> {
  const result = await db.run("DELETE FROM shipping_rates WHERE id = ?", [id]);
  if (!result.meta.changes) throw new HttpError(404, "rate_not_found", "Shipping rate not found.");
}
