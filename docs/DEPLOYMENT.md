# Deployment

## 1. Prerequisites

- A Cloudflare account on the **Free** plan.
- Node.js 20+, pnpm 10+.
- Wrangler authenticated: `npx wrangler login`.
- Permission to create Workers and D1 resources. R2 is optional.

## 2. One-click deployment (Cloudflare button)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shuo-huge/cloudcart)

Cloudflare clones the repository into Workers Builds on the deployer's account, provisions the D1
database declared in `wrangler.jsonc`, asks for the secrets listed in. R2 is optional and is not part of the default deployment.
`.dev.vars.example`, then runs:

```json
{
  "build": "pnpm run build",
  "deploy": "wrangler d1 migrations apply DB --remote && wrangler deploy"
}
```

Generate `APP_MASTER_KEY` and `SETUP_TOKEN` before starting. After deployment open
`https://<worker>/setup` and use `SETUP_TOKEN` to create the owner. No default password exists.

If Cloudflare cannot provision a resource or secret on your account, use the CLI below instead of
claiming the one-click flow succeeded.

## 3. One-command deployment (CLI)

```bash
pnpm install
pnpm run deploy:cloudflare
```

Optional:

```bash
pnpm run deploy:cloudflare -- --name cloudcart-fashion
pnpm run deploy:cloudflare -- --check        # environment check only
pnpm run deploy:cloudflare -- --skip-build   # reuse existing dist/
```

The script (`scripts/deploy.mjs`):
1. checks Node, Wrangler and Cloudflare authentication;
2. finds or creates a D1 database (never duplicates an existing one);
3. writes Worker name and D1 id into `wrangler.jsonc`;
4. builds the storefront and admin bundles;
5. applies remote D1 migrations;
6. deploys the Worker;
7. creates `APP_MASTER_KEY` and `SETUP_TOKEN` only if they do not already exist;
8. prints the store URL, admin URL and one-time setup link.

State (including the generated secrets) is written to `.cloudcart/deploy.json`, which is gitignored.
**Keep it private and back it up**; rotating `APP_MASTER_KEY` invalidates sessions and decrypts no
longer work for stored payment credentials.

Re-running the script is safe: it reuses resources and secrets and does not overwrite data. It never
changes your Cloudflare plan.

### What “one-time setup link” means

Open `https://<store>/setup` (or `/admin`), enter the printed `SETUP_TOKEN` and create the owner
account. `installation_state` is written at that moment; the setup route then redirects to the admin
and can never install again.

## 4. Manual deployment

```bash
pnpm install
pnpm build

npx wrangler d1 list
npx wrangler d1 create cloudcart            # only if missing

# put the returned database_id into wrangler.jsonc

npx wrangler secret put APP_MASTER_KEY      # 32+ random chars
npx wrangler secret put SETUP_TOKEN         # random one-time token

npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Do not set `worker`-side Cloudflare API tokens. The Worker never manages its own infrastructure.

## 5. Custom domain

1. Cloudflare Dashboard → Workers & Pages → your Worker → **Settings → Domains & Routes**.
2. **Add custom domain**, choose a zone in the same account, and confirm.
3. Cloudflare creates the DNS record and certificate.

Update payment provider webhook URLs and the store’s canonical URLs after the domain is active.

## 6. Updating

```bash
git pull
pnpm install
pnpm run deploy:cloudflare
```

- New migrations are applied before deployment.
- Existing D1 data is untouched. R2 objects are not used by the default deployment.
- Secrets are preserved.
- If you add a plugin or theme, rebuild and redeploy; it will appear in the admin.

## 7. Backup

```bash
# Database
npx wrangler d1 export cloudcart --remote --output backup-YYYYMMDD.sql
```

Back up `.cloudcart/deploy.json` separately and securely.

## 8. Restore

```bash
npx wrangler d1 execute cloudcart --remote --file backup-YYYYMMDD.sql
```

R2 is optional. If you enable it later, back up and restore its objects separately.

## 9. Multiple independent stores

Each deployment should use distinct resource names, e.g.:
- Worker `cloudcart-fashion`
- D1 `cloudcart-fashion`

R2 can be added later for direct file uploads. Never point two stores at the same D1 database in the
default deployment model.

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Admin shows “UI has not been built” | Run `pnpm build` before `wrangler dev`/deploy |
| Setup returns “SETUP_TOKEN is not configured” | Add the secret, redeploy/restart |
| Setup returns “already installed” | The store has an owner; use `/admin` |
| `wrangler` says not authenticated | `npx wrangler login` |
| Deployment fails on missing `database_id` | Run the script (it writes the id) or set it manually |
| Webhook signature failures | Verify the exact webhook secret and endpoint URL; Stripe requires the raw body |
| Image upload unavailable | The default deployment uses external HTTPS image URLs. Enable R2 and add the `MEDIA` binding to allow direct uploads |
| Old asset hashes after deploy | Assets are rebuilt by the script; ensure `dist/` is regenerated |
