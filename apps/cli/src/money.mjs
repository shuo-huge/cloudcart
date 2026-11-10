import { usageError } from "./errors.mjs";

const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function currencyExponent(currency = "USD") {
  const code = String(currency || "USD").toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function minorToDecimal(minor, currency = "USD") {
  const exponent = currencyExponent(currency);
  const value = Number(minor) / 10 ** exponent;
  return value.toFixed(exponent);
}

export function moneyString(value, currency = "USD", label = "amount") {
  if (value === undefined || value === null || value === true) {
    throw usageError(`Missing ${label}. Use a decimal string such as "19.99".`);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw usageError(`Invalid ${label}: ${value}`);
    return value.toFixed(currencyExponent(currency));
  }
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) {
    throw usageError(`Invalid ${label}: "${text}". Use a decimal string such as "19.99".`);
  }
  return text;
}

export function ratePercentToBps(value) {
  if (value === undefined || value === null || value === true) {
    throw usageError("Missing --rate-percent.");
  }
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw usageError(`Invalid --rate-percent: ${value}. Use 0–100, e.g. 8.25.`);
  }
  return Math.round(percent * 100);
}

export function formatCents(minor, currency = "USD") {
  return `${minorToDecimal(minor, currency)} ${String(currency).toUpperCase()}`;
}
