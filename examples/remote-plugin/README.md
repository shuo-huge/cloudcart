# Minimal Remote Plugin

A dependency-free Node example showing the complete remote plugin contract:

- `GET /cloudcart-plugin.json` — manifest
- `GET /admin` — iframe admin page with the `cloudcart:ready` / `cloudcart:token` handshake
- `GET /api/cloudcart/v1/health` — HMAC-verified health endpoint
- The admin page calls `GET /api/plugin/v1/store` with the JWT it receives from CloudCart.

## Run locally

```bash
PUBLIC_ORIGIN=http://localhost:8790 \
CLOUDCART_ADMIN_ORIGIN=http://localhost:8787 \
CLOUDCART_SERVICE_SECRET=replace-with-the-service-secret \
node server.mjs
```

For a local CloudCart Worker started with `pnpm dev`, the store admin runs on
`http://localhost:8787`. Local HTTP plugin URLs are only accepted when CloudCart is started with
`PLUGIN_ALLOW_INSECURE_ORIGINS=1` **and** `APP_ENV` is `development`, `test`, or `e2e`. Production
requires HTTPS on port 443 and a public hostname.

## Install

1. In **Admin → Plugins → Install remote plugin**, enter
   `http://localhost:8790/cloudcart-plugin.json` (local) or your HTTPS manifest URL.
2. Preview the manifest and install.
3. If CloudCart generated a service secret, copy it once and set `CLOUDCART_SERVICE_SECRET` on the
   plugin server. If the server already has a secret, paste it into the install form instead.
4. Enable the plugin. Its **Analytics overview** menu appears in the left sidebar.
5. Open the menu. The iframe sends `cloudcart:ready`; CloudCart returns a 5-minute JWT; the page
   calls the plugin API with `Authorization: Bearer <token>`.

## Protocol

### postMessage

The plugin must derive the parent origin from `document.referrer` (CloudCart sets
`referrerpolicy="strict-origin-when-cross-origin"`) and never use `"*"`:

```js
const parentOrigin = new URL(document.referrer).origin;
window.parent.postMessage({ type: "cloudcart:ready", pageId }, parentOrigin);
```

CloudCart then sends:

```js
{ type: "cloudcart:token", token, expiresAt, storeId, pluginId, pageId, permissions }
```

The plugin may request a refresh with `{ type: "cloudcart:refresh-token" }`. Tokens are short-lived
and must stay in memory; do not put them in URLs, localStorage, or logs.

### HMAC requests from CloudCart

Every service request carries:

```text
x-cloudcart-plugin: <plugin id>
x-cloudcart-store-id: <store id>
x-cloudcart-timestamp: <ISO timestamp>
x-cloudcart-nonce: <random>
x-cloudcart-signature: <base64url HMAC-SHA256>
```

Canonical string (UTF-8, newline separated):

```text
timestamp
nonce
METHOD
/path?query
sha256_hex(body)
```

Signature = `base64url(HMAC-SHA256(serviceSecret, canonical))`.

Validate the timestamp (for example, within 5 minutes), reject reused nonces, and compare signatures
in constant time. The secret is the one shown/set during installation and stored encrypted in D1.

### CSP

The plugin admin response must allow the store admin origin as a frame ancestor:

```http
Content-Security-Policy: frame-ancestors https://your-store.workers.dev
```

CloudCart's admin CSP allows `frame-src` only for exact origins of enabled remote plugins. Do not use
wildcards. The plugin page must not attempt top-level navigation, popups, or third-party cookies.

### Payment plugins

Remote payment plugins implement these signed endpoints:

- `POST /payments/validate`
- `POST /payments/checkout`
- `POST /payments/verify-webhook` (verify the provider signature, return a CloudCart `PaymentEvent`)
- `POST /payments/status`
- `POST /payments/capture`
- `POST /payments/refund`

CloudCart remains authoritative for order amounts, currency, and event idempotency. A remote payment
plugin cannot mark an order paid directly; it returns an event and CloudCart's existing pipeline
processes it.
