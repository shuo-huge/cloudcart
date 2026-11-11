---
title: One-click deploy
description: Deploy to your own Cloudflare account with the Deploy to Cloudflare button in the README.
---

The README has a **Deploy to Cloudflare** button at the top. It clones the public repository, creates a Worker and D1 in your Cloudflare account, and runs the repository's build and deploy scripts.

## Before you deploy

- A Cloudflare account
- Access to the public GitHub repository
- You do not need to create D1 in advance or enter any secrets manually

## Steps

1. Click the **Deploy to Cloudflare** button in the README.
2. Sign in to Cloudflare and choose the account to deploy to.
3. Confirm the project name and follow the prompts.
4. Wait for the build and deployment to finish.
5. Open the latest **Build logs** and find the following at the end:

```text
YOUR STORE IS READY / 商城已部署

Website / 网站:  https://xxx.workers.dev
Admin / 后台:    https://xxx.workers.dev/admin

Finish setup / 打开下面链接创建管理员（一次性，请勿分享）:
https://xxx.workers.dev/setup?token=...
```

## Where to find the site link after deployment

One-click deployment runs inside Cloudflare, so it **cannot open a browser on your computer automatically**. You can find the URL in two places:

1. **Build logs**: Workers & Pages → your project → Deployments → latest → Build logs. The end of the log has a `Website / 网站` line.
2. **Dashboard**: Workers & Pages → your project → **Visit**. The address is:

```text
https://<worker-name>.<your-account-subdomain>.workers.dev
```

You can also find it under **Settings → Domains & Routes**.

## What if I lose the setup link?

If you lose the Setup link before creating the administrator, simply run the deployment again. The script detects that the store has not been initialised and generates and prints a new one-time link.

If the administrator has already been created, you do not need the Setup link; just open `/admin` and sign in.

## What the deployment script does

- Finds or reuses the D1 database created by the Deploy Button
- Writes the real database ID back into `wrangler.jsonc`
- Builds the storefront and admin
- Applies remote migrations through the `DB` binding
- Deploys the Worker
- Preserves or generates `APP_MASTER_KEY`
- Generates a one-time `SETUP_TOKEN` while the store is uninitialised
- Prints the store, admin and Setup links

Repeated deployments are safe: existing resources and secrets are reused, and your business data is not overwritten.

## Notes

- R2 is not created by default; images use external HTTPS links.
- The public HTTPS service for remote plugins must be deployed separately and is not hosted by the store Worker.
- If you bind a custom domain manually in Cloudflare, use that custom domain from then on.
