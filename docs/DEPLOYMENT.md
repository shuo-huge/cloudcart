# Deployment

## 1. Prerequisites

- A Cloudflare account on the **Free** plan.
- Node.js 20+, pnpm 10+.
- Wrangler authenticated: `npx wrangler login`.
- Permission to create Workers and D1 resources. R2 is optional.

## 2. One-click deployment (Cloudflare button)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shuo-huge/cloudcart)

Cloudflare clones the repository into your account, provisions the D1 database declared in `wrangler.jsonc`, then runs the build and deploy commands. R2 is optional. **You do not need to create or paste any secrets.**

The `deploy` script runs the CloudCart deployment CLI. It automatically:

1. checks Cloudflare authentication and finds the D1 database;
2. applies remote database migrations;
3. deploys the Worker;
4. generates `APP_MASTER_KEY` and stores it as a Worker secret if it does not exist;
5. generates a one-time `SETUP_TOKEN` and stores it as a Worker secret while the store is uninstalled; a new deployment before installation refreshes the private link;
6. prints a private setup URL containing the one-time token in the successful deployment log.

Open the **Setup link** from the latest successful deployment log. The setup page only asks for the administrator's name, email and password. Store name and currency start with sensible defaults and can be changed later in Admin → Settings. The token is carried in the private URL; it is not a form field.

The setup link is invalidated after the first administrator is created. Before installation, a subsequent deployment may refresh the one-time link; use the link printed by the latest successful deployment.

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
7. preserves the existing `APP_MASTER_KEY`; it reuses or refreshes the setup token according to installation state;
8. prints the store URL, admin URL and one-time setup link.

State (including generated secrets) is written to `.cloudcart/deploy.json`, which is gitignored. **Keep it private and back it up**; rotating `APP_MASTER_KEY` invalidates sessions and prevents previously encrypted payment credentials from being decrypted.

Re-running the script is safe: it reuses resources and secrets and does not overwrite data. It never
changes your Cloudflare plan.

### What “one-time setup link” means

The deployment log prints a private URL such as `https://<worker>/setup?token=<one-time-token>`. Open that link directly. CloudCart fills the hidden setup token automatically, so the installer only enters the administrator name, email and password. The token is never displayed as a separate field.

The setup page is no-store/no-referrer and closes permanently after the first owner account is created. If a deployment is run again before installation, use the refreshed link printed by that deployment.

## 4. Manual deployment

If you prefer to run Wrangler commands yourself, use the same installer script rather than creating secrets by hand:

```bash
pnpm install
pnpm run deploy:cloudflare
```

For local development, `pnpm run dev` creates local-only `.dev.vars` values automatically. The generated file is gitignored and is never uploaded to GitHub.

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

Email notifications are also optional and disabled by default. The Resend backend only needs an
API key entered in **Admin → Emails**. The Cloudflare Email Workers backend additionally requires
Email Routing on your domain and an `EMAIL` `send_email` binding in `wrangler.jsonc`:

```jsonc
"send_email": [{ "name": "EMAIL" }]
```

Without either configuration, orders still work and the outbox remains empty.

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
| Setup page says to open the deployment link | Use the private setup URL printed by the latest successful deployment log |
| Setup returns “already installed” | The store has an owner; use `/admin` |
| Cannot find the site URL after one-click deploy | Open **Workers & Pages → your project → Visit**, or check the latest **Build logs** for the `Website / 网站` line. The Cloudflare build runs remotely and cannot open your browser |
| Lost the one-time setup link | Retry the deployment before creating the administrator; a fresh link is printed in the new build log |
| `wrangler` says not authenticated | `npx wrangler login` |
| Deployment fails on missing `database_id` | Run the script (it writes the id) or set it manually |
| Webhook signature failures | Verify the exact webhook secret and endpoint URL; Stripe requires the raw body |
| Image upload unavailable | The default deployment uses external HTTPS image URLs. Enable R2 and add the `MEDIA` binding to allow direct uploads |
| Email queue stays empty | Enable the Email Notifications plugin and save a From address plus a Resend key or the `EMAIL` binding |
| Email shows “binding is not configured” | Add the `send_email` binding and redeploy, or switch the backend to Resend |
| Old asset hashes after deploy | Assets are rebuilt by the script; ensure `dist/` is regenerated |
