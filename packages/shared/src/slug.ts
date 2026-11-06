const RESERVED_SLUGS = new Set([
  "api", "admin", "webhooks", "media", "static", "assets", "cart", "checkout",
  "products", "collections", "categories", "search", "account", "login",
  "sitemap.xml", "robots.txt", "setup", "health", "favicon.ico",
]);

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9一-鿿]+(?:-[a-z0-9一-鿿]+)*$/.test(slug) &&
    slug.length >= 1 &&
    slug.length <= 80;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** Normalize a URL path for redirect lookups (must start with "/"). */
export function normalizePath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) return withSlash.slice(0, -1);
  return withSlash;
}

/** Only same-site absolute paths are accepted; blocks open redirects. */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || value.includes("\n") || value.includes("\r")) return fallback;
  return value;
}
