# Security

## Authentication

- Single store-owner account in v1.
- Passwords: PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte salt, 32-byte derived key, 8–1024 chars,
  must contain a letter and a number.
- Setup requires a high-entropy one-time `SETUP_TOKEN` generated automatically by the deployment script. The token is embedded in a private setup URL (not a visible form field), accepted only before `installation_state` exists, and becomes unusable after the first administrator is created.
- Sessions: random 32-byte secret; cookie value `sessionId.secret.HMAC`, verified with a key derived
  from `APP_MASTER_KEY` before any D1 lookup; only the token hash is stored. Cookie is HttpOnly,
  Secure on HTTPS, SameSite=Lax, 8-hour lifetime.
- Login rate limiting: 5 failures per email or 15 per IP in 15 minutes → HTTP 429.
- Password change revokes all sessions.

## CSRF

Admin mutations require:
- the `X-CSRF-Token` header **and** the `cc_csrf` cookie, both equal to the session’s CSRF token
  (double-submit, constant-time comparison).
- Login/setup/status routes are exempt; all other `/api/admin/*` mutations are protected.

## Request security

- Every D1 query uses prepared statements; user input is never concatenated into SQL.
- All API input is validated with Zod or explicit type checks.
- Security headers: CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, Referrer-Policy,
  Permissions-Policy.
- HTML escaping for all interpolated values; JSON-LD uses `<`, `>`, `&` escaping.
- Rich text and custom HTML pass through an allow-list sanitiser:
  - drops `script`, `style`, `iframe`, `object`, `embed`, `form`, `svg`, `math`, etc.;
  - strips `on*` handlers and `style` attributes;
  - allows only http(s), mailto, tel and same-site URLs;
  - rejects `javascript:` and `data:` URLs.
- Page JSON rejects any `<script` and is schema/size validated.
- Open redirects: only same-site paths beginning with a single `/` are accepted; `//` and backslashes
  are rejected.
- File uploads: JPEG/PNG/GIF/WebP/AVIF only; MIME type, extension and magic bytes must agree; 5 MB
  maximum; random R2 keys; SVG is rejected; served with `Content-Security-Policy: default-src 'none'; sandbox`
  and `X-Content-Type-Options: nosniff`.
- Media keys are validated against the generated `media/YYYY/MM/<id>.<ext>` pattern.

## Secrets

- `APP_MASTER_KEY` is generated automatically by the deployment script and stored as a Cloudflare Worker Secret, never in D1. Users do not need to create or paste it.
- Payment credentials identified as secrets are encrypted with AES-GCM; the key is derived with
  HKDF-SHA256 from `APP_MASTER_KEY`.
- Encrypted values are never returned to the browser (only `••••••••`), logged, or included in error
  responses.
- Local CLI deployments also store generated secrets in `.cloudcart/deploy.json` (gitignored). Protect that file like a password store. Workers Builds stores runtime secrets in Cloudflare and prints only the one-time setup URL in the build log.
- Rotating `APP_MASTER_KEY` invalidates sessions and makes stored encrypted provider credentials
  undecryptable; re-enter them afterwards.

## Payments

- Server-side totals only; client price/amount input is ignored.
- Stripe signature verified over the raw body with a 5-minute tolerance and constant-time compare.
- PayPal webhooks verified through PayPal’s verification API.
- Amount and currency checked against the order before `paid`.
- Unique `(plugin_id, event_id)` makes processing idempotent.
- Administrators cannot mark Stripe/PayPal orders paid.
- Manual confirmations record admin id and timestamp.

## Remote plugins

- Plugin code never runs inside the CloudCart Worker. A remote plugin is an independently deployed
  HTTPS service; CloudCart stores only its manifest and calls signed APIs.
- Manifest URLs require HTTPS on port 443 with a public hostname. Literal loopback, private,
  link-local and internal hosts, embedded credentials, and unvalidated redirects are rejected.
  Fetches have a 5-second timeout and 64 KiB limit.
- Manifest permissions are allow-listed; unknown or wildcard permissions are rejected. The manifest is
  hash-pinned at install and re-previewed when it changes.
- Every service call is HMAC-SHA256 signed over timestamp, nonce, method, path, and body hash. The
  per-plugin service secret is stored AES-GCM encrypted and decrypted only inside the Worker.
- The iframe receives a 5-minute HS256 JWT through `postMessage`, sent only to the exact plugin
  origin. The parent verifies both `event.origin` and `event.source`. Tokens are never put in URLs or
  browser storage and are not valid for `/api/admin/*`.
- `/api/plugin/v1/*` requires a bearer token and checks the plugin is enabled on every request, so
  disabling a plugin invalidates outstanding tokens immediately. CORS is an exact origin allow-list.
- The admin CSP adds `frame-src` only for exact origins of enabled remote plugins; no wildcard.
  Remote admin pages must allow the store origin in `frame-ancestors`; the admin itself remains
  non-frameable (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).
- Uninstalling soft-deletes the plugin, disables it, and retains orders and payment transactions.
  Pending provider payments should be completed before uninstalling.
- Local HTTP plugin URLs are accepted only with `PLUGIN_ALLOW_INSECURE_ORIGINS=1` and a non-production
  `APP_ENV` (development/test/e2e). This flag is rejected in production configuration.

## Audit

Administrative mutations write `audit_logs` with actor, action, entity and IP. Payment webhook
events write audit entries with no admin actor.

## Known limitations / deliberate choices

- No 2FA or WebAuthn.
- Rate limiting is limited to login attempts (DB-backed); public cart/checkout endpoints are not
  rate-limited by IP in v1.
- CSP allows inline styles (theme/editor output) and includes inline `application/ld+json` blocks;
  scripts are restricted to same-origin. The admin CSP allows `frame-src` only for exact origins of
  enabled remote plugins; plugin pages are sandboxed and must allow the store origin as an ancestor.
- The admin preview iframe uses `sandbox="allow-scripts allow-forms"` without `allow-same-origin`.
- No automatic security headers are applied to edge-served static assets (they contain no dynamic
  content).
- The application cannot know a Cloudflare account’s exact shared quota usage; local estimates are
  labelled as estimates.
- No third-party authentication SaaS is used, by design.
