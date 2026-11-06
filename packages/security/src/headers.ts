export interface SecurityHeaderOptions {
  /** Inline styles are used by the theme editor / themes. */
  allowInlineStyles?: boolean;
  /** Inline bootstrap script carrying JSON page data. */
  allowInlineScripts?: boolean;
  frameAncestors?: string;
}

export function securityHeaders(options: SecurityHeaderOptions = {}): Record<string, string> {
  const styleSrc = options.allowInlineStyles === false ? "'self'" : "'self' 'unsafe-inline'";
  const scriptSrc = options.allowInlineScripts === false ? "'self'" : "'self' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https://js.stripe.com https://www.paypal.com https://www.sandbox.paypal.com",
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
