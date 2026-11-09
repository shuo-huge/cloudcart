# Plugin Development

CloudCart plugins are **bundled at build time** and enabled/configured at runtime. The Worker never
downloads or `eval`s plugin code.

## 1. Plugin package layout

```
plugins/payments/example/
  plugin.json
  package.json
  src/index.ts
```

`plugin.json` mirrors the manifest used at runtime:

```json
{
  "id": "example",
  "name": "Example",
  "version": "1.0.0",
  "apiVersion": "1",
  "type": "payment",
  "description": "…",
  "capabilities": ["payment.checkout"],
  "permissions": ["orders:read"],
  "dependencies": []
}
```

Requirements:
- unique, kebab-case `id`;
- Semantic Versioning;
- `apiVersion` must match `PLUGIN_API_VERSION` (`1`);
- explicit capabilities and permissions;
- no runtime code download.

## 2. Register the plugin

1. Add the package to the worker’s dependencies.
2. Import it in `apps/worker/src/plugin-registry.ts`:
   ```ts
   import example from "@cloudcart/plugin-example";
   export const pluginRegistry = new PluginRegistry([manualPaymentManifest, stripe.manifest, paypal.manifest, example.manifest]);
   const paymentPlugins = new Map([... , [example.manifest.id, example]]);
   ```
3. Rebuild and redeploy. The admin will show the plugin as **bundled** and allow enable/disable.

A row in D1 without bundled code is shown as “not in build” and cannot be enabled. The UI never
pretends a non-bundled plugin can run.

## 3. Lifecycle

- `plugins.enabled` and `plugin_settings` live in D1.
- Disabling a payment plugin removes it from checkout and blocks new sessions, but **webhooks keep
  working** for historical transactions.
- Uninstalling never deletes business data.
- An exception inside a plugin must not crash the Worker; call sites catch and log without secrets.

## 4. Settings and secrets

Use the admin endpoint `PUT /api/admin/plugins/:id/settings`:

```json
{ "settings": { "clientId": "…", "clientSecret": "…" }, "secretKeys": ["clientSecret"] }
```

- Keys in `secretKeys` are encrypted with AES-GCM (key derived via HKDF from `APP_MASTER_KEY`) and
  stored with `encrypted = 1`.
- `GET` returns `••••••••` for encrypted keys; the full value is never returned to the browser.
- Empty or masked values keep the existing secret.
- Read decrypted values only in the Worker via `loadPluginRuntimeConfig` (payment plugins can keep
  using the `loadPaymentRuntimeConfig` alias) / `getPluginSecret`.

## 5. Payment plugin interface

```ts
interface PaymentPlugin {
  manifest: PluginManifest;
  validateConfig(config: PaymentConfig): Promise<ValidationResult>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyWebhook(request: Request, config: PaymentConfig): Promise<PaymentEvent>;
  getPaymentStatus(providerTransactionId: string, config: PaymentConfig): Promise<PaymentStatus>;
  captureOrder?(input: CaptureInput): Promise<CaptureResult>;
  refund?(input: RefundInput): Promise<RefundResult>;
}
```

Rules:
- Verify webhook signatures against the **raw** body before parsing.
- Return a stable provider event id for idempotency.
- Never trust client amounts; the core compares `amountCents`/`currency` with the order.
- Never mark an order paid yourself; return a `PaymentEvent` and let core apply it.
- Do not log secrets, tokens or full provider payloads that contain PII.

## 6. Tests

Add tests under `tests/` using the workerd Vitest plugin. External provider calls can be stubbed by
replacing `globalThis.fetch` in the test isolate (the Worker shares the isolate); see
`tests/payments.test.ts`.

## 7. Admin plugins

`type: "admin"` plugins contribute behaviour to the admin UI. The bundled example is
`plugins/admin/i18n` (“Admin Language Pack”):

- `manifest.type = "admin"`, capabilities `["admin.i18n"]`;
- runtime settings live in `plugin_settings` (`defaultLocale`, `showSwitcher`);
- the Worker exposes a read-only `GET /api/i18n` payload containing the enabled flag, locales and
  translation dictionaries (only while enabled);
- the admin app applies translations through a text-node overlay: exact UI-string matches are
  replaced, table cells holding business data are skipped, and unknown strings stay in English;
- the language switcher appears on the login screen and in the top bar while the plugin is enabled;
- disabling the plugin returns the admin to English without deleting its settings.

To add another admin plugin, bundle it, register its manifest in
`apps/worker/src/plugin-registry.ts`, expose the read-only data it needs, and consume that data in
`apps/admin`. The plugin must not inject arbitrary JavaScript at runtime.

## 8. Notification plugin: email

`plugins/notifications/email` is the bundled notification plugin (`type: "notification"`,
id `email-notifications`, disabled by default).

- Settings: `backend` (`resend` or `cloudflare`), `from`, `fromName`, `replyTo`, `notifyAdmin`,
  and the encrypted secret `resendApiKey`.
- The Resend backend calls `POST https://api.resend.com/emails`; the Cloudflare backend uses the
  optional `EMAIL` `send_email` binding. The binding is intentionally absent from the default
  `wrangler.jsonc`; add it only after enabling Email Routing for your domain.
- Core owns templates and the `email_outbox` table. The plugin only exposes an `EmailTransport`
  (`packages/plugin-sdk/src/email.ts`).
- Admin UI: `/admin/emails` shows configuration, an outbox summary, Process queue and Retry failed.
- Delivery is attempted after the response using `waitUntil`; failures are recorded and retried with
  exponential backoff. There is no cron trigger.
- Tests mock the provider (`globalThis.fetch` for Resend or a fake binding for Cloudflare).

## 9. Remote plugin development

Remote plugins run on **your own HTTPS server**. CloudCart never downloads or executes plugin
JavaScript. A complete runnable example is in [`examples/remote-plugin`](../examples/remote-plugin).

### Manifest

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
  "service": { "baseUrl": "https://plugin.example.com/api/cloudcart/v1", "auth": "hmac-sha256" },
  "admin": {
    "entryUrl": "https://plugin.example.com/admin",
    "pages": [{ "id": "overview", "label": "Analytics overview", "icon": "chart" }]
  }
}
```

Rules:

- `runtime` must be `remote`; `service.auth` must be `hmac-sha256`.
- `service.baseUrl` and `admin.entryUrl` must be public HTTPS URLs on port 443 without credentials.
- Permissions are allow-listed: `store:read`, `products:read`, `orders:read`, `settings:read`,
  `settings:write`, `events:write`. Unknown or wildcard permissions are rejected.
- Admin page ids use `[a-z0-9-]`, labels are 1–60 characters, and at most 10 pages are allowed.
- CloudCart fetches the manifest with a 5-second timeout, 64 KiB limit, and validated HTTPS redirects.

### Install and service secret

In **Admin → Plugins → Install remote plugin**, the merchant previews the manifest and installs it.
CloudCart stores the manifest (hash-pinned) and an encrypted per-plugin service secret
(`plugin_settings._serviceSecret`). The secret is shown once if CloudCart generated it; otherwise the
merchant can paste the secret already configured on the plugin server.

The plugin is installed disabled. Enabling it runs a non-blocking health check against
`GET {service.baseUrl}/health`.

### HMAC service requests

Every CloudCart → plugin request includes:

```text
x-cloudcart-plugin: <plugin id>
x-cloudcart-store-id: <store id>
x-cloudcart-timestamp: <ISO timestamp>
x-cloudcart-nonce: <random>
x-cloudcart-signature: <base64url HMAC-SHA256>
```

Canonical string (newline separated):

```text
timestamp
nonce
METHOD
/path?query
sha256_hex(body)
```

Signature = `base64url(HMAC-SHA256(serviceSecret, canonical))`. Verify the timestamp freshness,
reject replayed nonces, and compare signatures in constant time. Never log the secret.

### iframe handshake

The remote admin page is embedded with
`sandbox="allow-scripts allow-forms allow-same-origin"` and must allow the store origin:

```http
Content-Security-Policy: frame-ancestors https://your-store.workers.dev
```

Protocol:

1. The plugin derives the parent origin from `document.referrer` (never use `"*"`) and sends
   `{ type: "cloudcart:ready", pageId }`.
2. CloudCart verifies `event.origin` and `event.source`, then calls
   `POST /api/admin/plugins/:id/launch` (admin session + CSRF).
3. CloudCart posts `{ type: "cloudcart:token", token, expiresAt, storeId, pluginId, pageId,
   permissions }` to the exact plugin origin.
4. The plugin keeps the token in memory and calls `/api/plugin/v1/*` with
   `Authorization: Bearer <token>`.
5. The plugin may send `{ type: "cloudcart:refresh-token" }`; CloudCart reissues a token.

CloudCart's admin CSP adds the exact `frame-src` origin of each enabled remote plugin; it never uses a
wildcard. The admin itself is not frameable (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).

### Token and API

The JWT is HS256, valid for 5 minutes, and contains `iss`, `aud`, `plugin_id`, `store_id`,
`admin_id`, `permissions`, `iat`, `exp`, `jti`. The signing key is derived from `APP_MASTER_KEY` with
a dedicated HKDF domain. Tokens are not accepted by `/api/admin/*`.

Available endpoints (permission in parentheses):

| Endpoint | Permission |
|---|---|
| `GET /api/plugin/v1/store` | `store:read` |
| `GET /api/plugin/v1/products`, `/products/:id` | `products:read` |
| `GET /api/plugin/v1/orders`, `/orders/:id` | `orders:read` |
| `GET/PUT /api/plugin/v1/settings` | `settings:read` / `settings:write` |
| `POST /api/plugin/v1/events` | `events:write` |
| `GET /api/plugin/v1/health` | authenticated |

CORS is an exact allow-list of enabled plugin `admin_origin` values; wildcards are not used. A
disabled plugin invalidates its outstanding tokens on the next request.

### Remote payment plugins

Implement the `PaymentPlugin` contract over signed HTTPS endpoints:

- `POST /payments/validate`
- `POST /payments/checkout`
- `POST /payments/verify-webhook` — verify the provider signature and return a CloudCart
  `PaymentEvent` including the internal `orderId`
- `POST /payments/status`
- `POST /payments/capture`
- `POST /payments/refund`

CloudCart forwards provider webhooks to `verify-webhook`, then runs the returned event through its
existing amount/currency/idempotency checks. A remote plugin never marks an order paid directly.

### Local development

Remote URLs must be HTTPS in production. For local development, CloudCart accepts
`http://127.0.0.1` / `http://localhost` only when `PLUGIN_ALLOW_INSECURE_ORIGINS=1` **and**
`APP_ENV` is `development`, `test`, or `e2e`. Never enable this in production.

## 10. Non-payment plugin types

Shipping, marketing, SEO, analytics, product, customer and notification plugins use the same
manifest/registry model. Their hooks are intentionally narrow in v1; a plugin can read core data
through the service façades and must declare the permissions it uses.
