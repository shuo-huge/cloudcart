/**
 * Money is always represented as an integer number of minor units
 * (e.g. cents for USD). Floating point arithmetic is never used for
 * order totals.
 */

const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function currencyExponent(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function currencyDivisor(currency: string): number {
  return 10 ** currencyExponent(currency);
}

export function normalizeCurrency(currency: string | null | undefined): string {
  const code = (currency ?? "USD").toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

export function formatMoney(minor: number, currency = "USD", locale = "en-US"): string {
  const exp = currencyExponent(currency);
  const value = minor / 10 ** exp;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(value);
  } catch {
    return `${normalizeCurrency(currency)} ${value.toFixed(exp)}`;
  }
}

/**
 * Parse a user-entered decimal price (e.g. "19.99") into integer minor
 * units without floating point rounding.
 */
export function parseMoneyInput(input: string | number, currency = "USD"): number {
  const exp = currencyExponent(currency);
  const raw = String(input).trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid money value: ${String(input)}`);
  }
  const [whole = "0", frac = ""] = raw.split(".");
  const padded = (frac + "0".repeat(exp)).slice(0, exp);
  const minor = Number(whole) * 10 ** exp + Number(padded || "0");
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new Error(`Money value out of range: ${raw}`);
  }
  return minor;
}

/** Format integer minor units as a plain decimal string for form inputs. */
export function moneyToInput(minor: number, currency = "USD"): string {
  const exp = currencyExponent(currency);
  const divisor = 10 ** exp;
  const whole = Math.trunc(minor / divisor);
  const frac = Math.abs(minor % divisor).toString().padStart(exp, "0");
  return exp === 0 ? String(whole) : `${whole}.${frac}`;
}

export function percentageOf(amount: number, percentBasisPoints: number): number {
  // basis points: 1000 = 10%
  return Math.round((amount * percentBasisPoints) / 10000);
}

export function clampQuantity(quantity: number, min = 1, max = 9999): number {
  if (!Number.isFinite(quantity)) return min;
  return Math.min(max, Math.max(min, Math.trunc(quantity)));
}
