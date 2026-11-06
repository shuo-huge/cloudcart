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
- Read decrypted values only in the Worker via `loadPaymentRuntimeConfig` / `getPluginSecret`.

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

## 8. Non-payment plugin types

Shipping, marketing, SEO, analytics, product and customer plugins use the same manifest/registry
model. Their hooks are intentionally narrow in v1; a plugin can read core data through the service
façades and must declare the permissions it uses.
