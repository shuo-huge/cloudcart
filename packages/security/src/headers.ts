export interface SecurityHeaderOptions {
  /** Inline styles are used by the theme editor / themes. */
  allowInlineStyles?: boolean;
  /** Inline bootstrap script carrying JSON page data. */
  allowInlineScripts?: boolean;
  frameAncestors?: string;
  /** Exact origins allowed in frame-src (remote plugin admin pages). */
  frameOrigins?: string[];
  /** Test/E2E only: allow http://127.0.0.1 origins. */
  allowInsecureFrameOrigins?: boolean;
}

const DEFAULT_FRAME_ORIGINS = [
  "https://js.stripe.com",
  "https://www.paypal.com",
  "https://www.sandbox.paypal.com",
];

function frameOrigin(value: string, allowInsecure: boolean): string | null {
  if (typeof value !== "string" || value.length > 255 || /["'\s]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:" && local)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/") return null;
  return url.origin;
}

export function securityHeaders(options: SecurityHeaderOptions = {}): Record<string, string> {
  const styleSrc = options.allowInlineStyles === false ? "'self'" : "'self' 'unsafe-inline'";
  const scriptSrc = options.allowInlineScripts === false ? "'self'" : "'self' 'unsafe-inline'";
  const frameOrigins = new Set(DEFAULT_FRAME_ORIGINS);
  for (const origin of options.frameOrigins ?? []) {
    const normalized = frameOrigin(origin, options.allowInsecureFrameOrigins === true);
    if (normalized) frameOrigins.add(normalized);
  }
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    // External HTTPS image URLs are a first-class CloudCart feature;
    // without https: the storefront would render broken product images.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    `frame-src 'self' ${[...frameOrigins].join(" ")}`,
    `frame-ancestors ${options.frameAncestors ?? "'none'"}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

export function applySecurityHeaders(headers: Headers, options: SecurityHeaderOptions = {}): void {
  for (const [key, value] of Object.entries(securityHeaders(options))) {
    headers.set(key, value);
  }
}

/** Protect against MIME sniffing on uploaded files. */
export function uploadHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}
