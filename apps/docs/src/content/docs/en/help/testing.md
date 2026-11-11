---
title: Testing and verification
description: Test commands, coverage, and known gaps for local and CI.
---

## Commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Vitest

Runs in workerd using `@cloudflare/vitest-plugin`, connected to a real D1.

Current coverage:

- Health checks and installation state
- Amounts, slugs, and HTML sanitisation
- Products, cart, checkout, inventory, manual payments, and fulfilment
- Page editing, publishing, and version rollback
- Stripe / PayPal webhook signatures and idempotency
- Tax rules and order tax
- Email outbox and retries
- Product image ordering
- Remote plugin Manifest, JWT, lifecycle, HMAC, plugin API, and remote payments

## Playwright

`pnpm test:e2e` will:

1. Build the storefront and admin
2. Use a separate `.wrangler/e2e` D1
3. Start a local mock remote plugin
4. Start `wrangler dev`
5. Create an administrator via a one-time setup token
6. Run browser tests

Coverage:

- Administrator login
- Page editor drag-and-drop, preview, and publish
- Desktop/tablet/mobile responsive layouts
- Product image drag-and-drop and storefront cover
- Email plugin admin
- Theme preview modal
- Remote plugin install → menu → iframe JWT → disable → uninstall
- Guest checkout with tax

## Known testing gaps

- PayPal Sandbox transactions (Stripe Sandbox has been verified)
- Real email provider delivery
- Public HTTPS third-party remote plugins
- R2 upload integration
- Concurrent order stress testing
- Cloudflare quota behaviour

## CI

GitHub Actions runs:

- `validate`: typecheck, Vitest, build
- `e2e`: install Chromium, run Playwright

## After making changes

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

If you changed the Worker or admin UI, run at least the relevant Playwright spec.
