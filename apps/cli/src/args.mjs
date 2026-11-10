import { usageError } from "./errors.mjs";

const BOOLEAN_FLAGS = new Set([
  "yes",
  "dry-run",
  "json",
  "quiet",
  "verbose",
  "help",
  "version",
  "publish",
  "featured",
  "manage-stock",
  "delete-media",
  "default",
  "active",
  "force",
  "show-key",
  "probe",
  "revoke",
  "forget",
  "raw",
  "insecure",
  "password-stdin",
  "external",
]);

const REPEATABLE_FLAGS = new Set([
  "scope",
  "tag",
  "category-id",
  "product-id",
  "image",
  "image-file",
  "header",
  "query",
]);

export const KNOWN_FLAGS = new Set([
  "profile",
  "url",
  "key",
  "token",
  "email",
  "password",
  "password-stdin",
  "setup-token",
  "setup-token-file",
  "name",
  "store-name",
  "currency",
  "scope",
  "expires-at",
  "force",
  "show-key",
  "revoke",
  "forget",
  "probe",
  "page",
  "per-page",
  "q",
  "status",
  "type",
  "price",
  "compare-at-price",
  "sku",
  "stock",
  "manage-stock",
  "featured",
  "seo-title",
  "seo-description",
  "category-id",
  "tag",
  "description",
  "description-file",
  "parent-id",
  "file",
  "variants",
  "variants-file",
  "data",
  "image",
  "image-file",
  "image-url",
  "alt",
  "slug",
  "title",
  "text",
  "text-file",
  "heading",
  "excerpt",
  "cover-image",
  "cover-alt",
  "publish",
  "payment-status",
  "note",
  "notes",
  "notes-file",
  "carrier",
  "tracking-number",
  "tracking-url",
  "amount",
  "code",
  "value",
  "min-subtotal",
  "starts-at",
  "ends-at",
  "max-uses",
  "applies-to",
  "product-id",
  "countries",
  "default",
  "zone",
  "min-order",
  "max-order",
  "free-over",
  "active",
  "position",
  "rate-percent",
  "rate-bps",
  "region",
  "country",
  "ids",
  "delete-media",
  "yes",
  "dry-run",
  "json",
  "quiet",
  "verbose",
  "help",
  "version",
  "timeout",
  "out",
  "raw",
  "header",
  "query",
  "user-agent",
  "insecure",
  "output",
  "storage",
  "external",
]);

const SHORT_FLAGS = new Map([
  ["-h", "help"],
  ["-v", "version"],
]);

function setFlag(flags, name, value) {
  if (REPEATABLE_FLAGS.has(name)) {
    if (!Array.isArray(flags[name])) flags[name] = [];
    flags[name].push(value);
    return;
  }
  flags[name] = value;
}

/**
 * Parses flags anywhere in the argv and returns the remaining positionals.
 * Supports `--flag value`, `--flag=value`, repeated flags, and `--no-flag`.
 */
export function parseArgs(argv) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (SHORT_FLAGS.has(token)) {
      flags[SHORT_FLAGS.get(token)] = true;
      continue;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    let name = token.slice(2);
    let inlineValue;
    const equals = name.indexOf("=");
    if (equals !== -1) {
      inlineValue = name.slice(equals + 1);
      name = name.slice(0, equals);
    }

    if (name.startsWith("no-")) {
      const positive = name.slice(3);
      if (!KNOWN_FLAGS.has(positive)) throw usageError(`Unknown flag: --${name}`);
      flags[positive] = false;
      continue;
    }
    if (!KNOWN_FLAGS.has(name)) throw usageError(`Unknown flag: --${name}`);

    if (inlineValue !== undefined) {
      setFlag(flags, name, inlineValue);
      continue;
    }
    if (BOOLEAN_FLAGS.has(name)) {
      setFlag(flags, name, true);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("-")) {
      setFlag(flags, name, next);
      index += 1;
    } else {
      setFlag(flags, name, true);
    }
  }

  return { flags, positionals };
}

export function flagString(flags, name) {
  const value = flags[name];
  if (value === undefined || value === null || value === true || value === false) return undefined;
  if (Array.isArray(value)) return value[value.length - 1];
  return String(value);
}

export function flagBool(flags, name, fallback = false) {
  const value = flags[name];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

export function flagList(flags, name) {
  const value = flags[name];
  if (value === undefined) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

export function requirePositional(positionals, index, label) {
  const value = positionals[index];
  if (!value) throw usageError(`Missing ${label}.`);
  return value;
}
