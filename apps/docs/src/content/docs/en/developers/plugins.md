---
title: Plugin development
description: Directory structure, registration, settings and lifecycle for bundled plugins.
---

## Directory structure

```text
plugins/payments/example/
  plugin.json       # documentation/metadata copy
  package.json
  src/index.ts      # runtime manifest + implementation
```

## Manifest

```ts
export const manifest = {
  id: "example",
  name: "Example",
  version: "1.0.0",
  apiVersion: "1",
  type: "payment",
  description: "…",
  capabilities: ["payment.checkout"],
  permissions: ["orders:read"],
  dependencies: [],
};
```

Requirements:

- Unique kebab-case id
- SemVer
- `apiVersion` matches `PLUGIN_API_VERSION`
- Declare capabilities and permissions
- Do not download runtime code

## Registration

1. Add the package to `apps/worker/package.json`
2. Import it in `apps/worker/src/plugin-registry.ts`
3. Add the manifest to `PluginRegistry`
4. If it is a payment plugin, also add it to the `paymentPlugins` map
5. Rebuild and deploy

Plugins that are not bundled into the running Worker cannot be enabled.

## Settings and secrets

```http
PUT /api/admin/plugins/:id/settings
```

```json
{
  "settings": { "publicKey": "…", "secretKey": "…" },
  "secretKeys": ["secretKey"]
}
```

- `secretKeys` are encrypted with AES-GCM
- GET returns `••••••••`
- Empty or masked values keep the previous secret
- Decrypt at runtime with `loadPluginRuntimeConfig`

## Lifecycle

Bundled plugins are currently wired in through explicit call sites:

- payment: checkout / webhook / refund
- admin-i18n: `GET /api/i18n`
- email: order events → outbox

`onEnable` / `onDisable` are not executed automatically at present. Enabling/disabling is mainly a D1 state change.

## Permissions

Plugins should declare only the permissions they actually need. The core never hands raw D1 access or `APP_MASTER_KEY` to a plugin.

## Security

- Verify the signature over the raw webhook request body
- Return a stable event id
- Do not trust client-supplied amounts
- Do not mark orders as paid yourself
- Do not log secrets or full PII requests

## Testing

```bash
pnpm typecheck
pnpm test
```

External HTTP calls can be replaced in tests by stubbing `globalThis.fetch`.
