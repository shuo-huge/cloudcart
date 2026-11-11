---
title: Develop remote plugins
description: Manifest, HMAC signing, iframe handshake, JWT, and the plugin API.
---

Remote plugins are independently deployed HTTPS services. A complete runnable example is in the repository:

```text
examples/remote-plugin/
```

## Manifest

```json
{
  "id": "example-analytics",
  "name": "Example Analytics",
  "version": "1.0.0",
  "apiVersion": "1",
  "type": "analytics",
  "runtime": "remote",
  "description": "Analytics integration",
  "author": "Example Developer",
  "capabilities": ["analytics.read"],
  "permissions": ["store:read", "products:read"],
  "service": {
    "baseUrl": "https://plugin.example.com/api/cloudcart/v1",
    "auth": "hmac-sha256"
  },
  "admin": {
    "entryUrl": "https://plugin.example.com/admin",
    "pages": [
      { "id": "overview", "label": "Analytics overview", "icon": "chart" }
    ]
  }
}
```

Requirements:

- `runtime` must be `remote`
- URLs must be public HTTPS on port 443, with no username or password
- Permissions must come from the allowlist
- At most 10 admin pages
- Manifest maximum 64 KiB

## Service secret

At install time CloudCart generates or accepts a service secret. The plugin server must store the same secret to verify CloudCart's HMAC requests.

## HMAC requests

When CloudCart calls the plugin service it sends:

```text
x-cloudcart-plugin: <plugin id>
x-cloudcart-store-id: <store id>
x-cloudcart-timestamp: <ISO timestamp>
x-cloudcart-nonce: <random>
x-cloudcart-signature: <base64url HMAC-SHA256>
```

Canonical string to sign:

```text
timestamp
nonce
METHOD
/path?query
sha256_hex(body)
```

Signature:

```js
const expected = crypto
  .createHmac("sha256", serviceSecret)
  .update(canonical)
  .digest("base64url");
```

Recommendations:

- Verify the timestamp is within 5 minutes
- Reject duplicate nonces
- Use constant-time comparison
- Do not log the secret

## Admin iframe

CloudCart opens it in a sandboxed iframe:

```html
<iframe sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
```

The plugin admin response must allow the store origin:

```http
Content-Security-Policy: frame-ancestors https://your-store.workers.dev
```

### postMessage handshake

The plugin gets the parent window origin from `document.referrer`; do not use `"*"`:

```js
const parentOrigin = new URL(document.referrer).origin;
window.parent.postMessage({ type: "cloudcart:ready", pageId }, parentOrigin);
```

CloudCart responds with:

```js
{
  type: "cloudcart:token",
  token,
  expiresAt,
  storeId,
  pluginId,
  pageId,
  permissions
}
```

To refresh, send:

```js
window.parent.postMessage({ type: "cloudcart:refresh-token" }, parentOrigin);
```

The token is kept in memory only; do not put it in URLs, localStorage, or logs.

## Plugin API

Call with a JWT:

```http
Authorization: Bearer <token>
```

| Endpoint | Permission |
|---|---|
| `GET /api/plugin/v1/store` | `store:read` |
| `GET /api/plugin/v1/products` | `products:read` |
| `GET /api/plugin/v1/products/:id` | `products:read` |
| `GET /api/plugin/v1/orders` | `orders:read` |
| `GET /api/plugin/v1/orders/:id` | `orders:read` |
| `GET/PUT /api/plugin/v1/settings` | `settings:read` / `settings:write` |
| `POST /api/plugin/v1/events` | `events:write` |

The JWT is valid for 5 minutes, is scoped to the current plugin and current store, and cannot call `/api/admin/*`.

## CORS

CloudCart uses an exact origin allowlist, not `*`. The plugin admin origin must match the `admin.entryUrl` origin in the Manifest.

## Payment plugins

A remote payment plugin implements:

- `POST /payments/validate`
- `POST /payments/checkout`
- `POST /payments/verify-webhook`
- `POST /payments/status`
- `POST /payments/capture`
- `POST /payments/refund`

After webhook verification it returns a CloudCart `PaymentEvent` with the internal `orderId`. CloudCart still validates the amount, currency, and idempotency; the plugin cannot mark an order as paid directly.

## Local development

Production must use HTTPS. Locally you can allow it via:

```bash
PLUGIN_ALLOW_INSECURE_ORIGINS=1
APP_ENV=development
```

This allows `http://127.0.0.1` / `http://localhost`. Do not enable it in production.
