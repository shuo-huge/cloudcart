---
title: Local development
description: Run CloudCart locally, change the code and debug against a local D1 database.
---

## Requirements

- Node.js 20+ (CI uses 24, `.nvmrc` pins 22)
- pnpm 10+ (`packageManager` pins 12.16.1)
- Optional: a Cloudflare account, for real deployments

## Start

```bash
git clone https://github.com/shuo-huge/cloudcart.git
cd cloudcart
pnpm install
pnpm db:migrate:local
pnpm dev
```

`pnpm dev` will:

1. Generate random secrets in a local `.dev.vars` (existing values are preserved)
2. Build the storefront and admin
3. Start `wrangler dev`
4. Print a one-time setup link

Open the `/setup?token=...` link printed in the terminal to create the administrator.

| URL | Purpose |
|---|---|
| `/` | Storefront |
| `/admin` | Admin SPA |
| `/setup` | One-time initialisation |
| `/api/*` | Public and admin APIs |
| `/webhooks/stripe`, `/webhooks/paypal` | Payment callbacks |

## Common commands

```bash
pnpm typecheck                 # TypeScript check
pnpm test                      # Vitest (workerd + real D1)
pnpm build                     # Build the storefront, admin and asset manifest
pnpm exec playwright install chromium
pnpm test:e2e                  # Playwright browser tests
pnpm db:migrate:local          # Apply local D1 migrations
```

## Where to edit code

- Worker/API: `apps/worker/src`
- Admin pages: `apps/admin/src`
- Business logic: `packages/core/src`
- Themes: `themes/*/src/index.ts`
- Plugins: `plugins/**`
- Database migrations: `migrations/*.sql`

Rebuild the admin after changing it:

```bash
pnpm build:admin
```

After you change a theme or the Worker, `wrangler dev` reloads automatically.

## Reset local data

Local D1 data lives in `.wrangler/state`. To start completely fresh, delete that directory and migrate again:

```bash
rm -rf .wrangler/state
pnpm db:migrate:local
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force .wrangler\state
pnpm db:migrate:local
```
