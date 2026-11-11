---
title: CLI deploy
description: Deploy CloudCart entirely from your local command line, with the setup page opened automatically when deployment finishes.
---

If you want the store/setup page to **open automatically** after deployment, CLI deployment is recommended.

```bash
git clone https://github.com/shuo-huge/cloudcart.git
cd cloudcart
pnpm install
pnpm run deploy:cloudflare
```

## What the script does

1. Checks Node, Wrangler and the Cloudflare login status
2. Finds or creates a D1 database
3. Writes the real ID into `wrangler.jsonc`
4. Builds the storefront and admin
5. Applies remote migrations through the `DB` binding
6. Deploys the Worker
7. Preserves or generates `APP_MASTER_KEY`
8. Generates and refreshes `SETUP_TOKEN` while the store is uninitialised
9. Prints the store, admin and one-time setup links
10. Opens the setup page automatically in a local interactive terminal

## Common options

```bash
pnpm run deploy:cloudflare -- --name my-store   # name the Worker/resources
pnpm run deploy:cloudflare -- --check           # environment check only, no resource changes
pnpm run deploy:cloudflare -- --no-open         # do not open a browser automatically
```

You can also set the `CLOUDCART_NO_OPEN=1` environment variable to disable automatic opening.

## Repeated deployments

The script is idempotent:

- An existing D1 database is reused
- An existing `APP_MASTER_KEY` is preserved
- An installed store will not generate a Setup link again
- Business data such as products and orders is not overwritten

## Manual login

If the script reports that you are not signed in:

```bash
npx wrangler login
```

Sign in, then run the deployment command again.

## Differences from one-click deploy

| | One-click deploy button | CLI |
|---|---|---|
| Runs on | Cloudflare's infrastructure | Your computer |
| Opens a browser automatically | No | Yes |
| Requires local Node/pnpm | No | Yes |
| Best for | Getting online quickly | Automatic opening, custom names and repeated deployments |
