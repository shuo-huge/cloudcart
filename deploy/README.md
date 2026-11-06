# Deployment assets

The deployment entry point is `scripts/deploy.mjs`, invoked by:

```bash
pnpm run deploy:cloudflare
```

It discovers or creates the Cloudflare resources this store needs (Worker and D1; R2 is optional), updates `wrangler.jsonc`,
applies migrations, builds, deploys and creates secrets. See `docs/DEPLOYMENT.md` for the full
procedure, custom domains, updates, backup and restore.

Deployment state is written to `.cloudcart/deploy.json` (gitignored). Treat it as a secret store:
it contains `APP_MASTER_KEY` and `SETUP_TOKEN` for this store.

There is intentionally no Cloudflare API token stored in the running Worker.
