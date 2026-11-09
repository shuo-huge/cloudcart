import type { Database } from "@cloudcart/database";
import type { TaxRateRow } from "@cloudcart/database";
import { HttpError, newId, nowIso, percentageOf } from "@cloudcart/shared";
import { z } from "zod";
import { getSetting, SETTING_KEYS } from "./settings";

export interface TaxRateSnapshot {
  name: string;
  rateBps: number;
  included: boolean;
}

export const taxRateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  region: z.string().trim().max(120).default("").transform((value) => value.toUpperCase()),
  rateBps: z.coerce.number().int().min(0).max(10000),
  active: z.boolean().default(true),
});

export type TaxRateInput = z.infer<typeof taxRateInputSchema>;

function normalizeCountry(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeRegion(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function parseBps(value: string, fallback = 0): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) return fallback;
  return parsed;
}

function parseIncluded(value: string): boolean {
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

/** Resolve the applicable rate: exact region, country-wide, then store default. */
export async function resolveTaxRate(
  db: Database,
  country: string,
  region?: string | null,
): Promise<TaxRateSnapshot> {
  const normalizedCountry = normalizeCountry(country);
  const normalizedRegion = normalizeRegion(region);
  const includedValue = await getSetting(db, SETTING_KEYS.taxIncluded, "0");
  const included = parseIncluded(includedValue);

  if (/^[A-Z]{2}$/.test(normalizedCountry)) {
    const match = normalizedRegion
      ? await db.first<TaxRateRow>(
        "SELECT * FROM tax_rates WHERE country = ? COLLATE NOCASE AND region = ? COLLATE NOCASE AND active = 1",
        [normalizedCountry, normalizedRegion],
      )
      : null;
    const countryWide = match ?? await db.first<TaxRateRow>(
      "SELECT * FROM tax_rates WHERE country = ? COLLATE NOCASE AND region = '' AND active = 1",
      [normalizedCountry],
    );
    if (countryWide) {
      return { name: countryWide.name, rateBps: countryWide.rate_bps, included };
    }
  }

  const defaultName = await getSetting(db, SETTING_KEYS.taxDefaultName, "Tax");
  const defaultRate = parseBps(await getSetting(db, SETTING_KEYS.taxDefaultRateBps, "0"));
  return { name: defaultName || "Tax", rateBps: defaultRate, included };
}

/**
 * Tax for an exclusive rate is added on top of the taxable base. For an
 * inclusive rate the taxable base already contains tax, so the embedded tax is
 * gross * rate / (10000 + rate); fractional basis points keep a single
 * rounding step.
 */
export function taxAmountCents(taxableCents: number, rateBps: number, included: boolean): number {
  const base = Math.max(0, Math.trunc(taxableCents));
  if (base === 0 || rateBps <= 0) return 0;
  if (included) {
    return percentageOf(base, (rateBps * 10000) / (10000 + rateBps));
  }
  return percentageOf(base, rateBps);
}

export function taxableBaseCents(
  subtotalCents: number,
  discountCents: number,
  shippingCents: number,
): number {
  return Math.max(0, subtotalCents - discountCents + shippingCents);
}

export function orderTotalWithTax(
  subtotalCents: number,
  discountCents: number,
  shippingCents: number,
  taxCents: number,
  included: boolean,
): number {
  const base = taxableBaseCents(subtotalCents, discountCents, shippingCents);
  return included ? base : base + Math.max(0, taxCents);
}

export function parseOrderTax(metadataJson: string): TaxRateSnapshot | null {
  try {
    const parsed = JSON.parse(metadataJson) as { tax?: { name?: unknown; rateBps?: unknown; included?: unknown } };
    const tax = parsed.tax;
    if (!tax || typeof tax.name !== "string" || typeof tax.rateBps !== "number") return null;
    return {
      name: tax.name,
      rateBps: tax.rateBps,
      included: tax.included === true,
    };
  } catch {
    return null;
  }
}

export async function listTaxRates(db: Database): Promise<TaxRateRow[]> {
  return db.all<TaxRateRow>(
    "SELECT * FROM tax_rates ORDER BY country, region, name",
  );
}

async function assertUniqueScope(
  db: Database,
  country: string,
  region: string,
  excludeId?: string,
): Promise<void> {
  const duplicate = await db.first<{ id: string }>(
    `SELECT id FROM tax_rates
     WHERE country = ? COLLATE NOCASE AND region = ? COLLATE NOCASE AND id <> ?`,
    [country, region, excludeId ?? ""],
  );
  if (duplicate) {
    throw new HttpError(409, "tax_rate_exists", "A tax rate already exists for this country and region.");
  }
}

export async function createTaxRate(db: Database, input: TaxRateInput): Promise<string> {
  const parsed = taxRateInputSchema.parse(input);
  await assertUniqueScope(db, parsed.country, parsed.region);
  const id = newId("tax");
  const now = nowIso();
  await db.run(
    `INSERT INTO tax_rates (id, name, country, region, rate_bps, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, parsed.name, parsed.country, parsed.region, parsed.rateBps, parsed.active ? 1 : 0, now, now],
  );
  return id;
}

export async function updateTaxRate(db: Database, id: string, input: TaxRateInput): Promise<void> {
  const existing = await db.first<{ id: string }>("SELECT id FROM tax_rates WHERE id = ?", [id]);
  if (!existing) throw new HttpError(404, "tax_rate_not_found", "Tax rate not found.");
  const parsed = taxRateInputSchema.parse(input);
  await assertUniqueScope(db, parsed.country, parsed.region, id);
  await db.run(
    `UPDATE tax_rates SET name = ?, country = ?, region = ?, rate_bps = ?, active = ?, updated_at = ?
     WHERE id = ?`,
    [parsed.name, parsed.country, parsed.region, parsed.rateBps, parsed.active ? 1 : 0, nowIso(), id],
  );
}

export async function deleteTaxRate(db: Database, id: string): Promise<void> {
  const result = await db.run("DELETE FROM tax_rates WHERE id = ?", [id]);
  if (!result.meta.changes) throw new HttpError(404, "tax_rate_not_found", "Tax rate not found.");
}
