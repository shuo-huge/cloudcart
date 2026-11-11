---
title: Install remote plugins
description: Install, enable, and manage remote plugins via a Manifest URL.
---

Remote plugins are deployed independently by the plugin author. All you need is a Manifest URL.

## Installation

1. Open **Admin → Plugins**
2. Click **Install remote plugin**
3. Enter the Manifest URL, for example:

   ```text
   https://plugin.example.com/cloudcart-plugin.json
   ```

4. Click **Preview**
5. Check the plugin name, author, version, permissions, admin menu, and service address
6. If the plugin service already has a secret configured, paste it into **Service secret**; leave it empty and CloudCart will generate one
7. Click **Install plugin**

After installation, the plugin is **disabled**.

## Enabling

Find the plugin in the Plugins list and click **Enable**.

- The plugin menu appears on the left automatically
- The admin runs a health check once
- The list shows the health status of the remote service

Click the plugin menu, and the plugin page opens in the admin content area.

## Service secret

If CloudCart generated the secret, it is **shown only once** after installation completes. You need to:

1. Copy it immediately
2. Configure it as `CLOUDCART_SERVICE_SECRET` on the plugin server
3. Click Done

If the secret is lost, click **Update** on the plugin to reinstall and generate a new secret; the old secret configuration must be updated to match.

## Permissions

Before installation, the permissions requested by the plugin are shown:

- `store:read`
- `products:read`
- `orders:read`
- `settings:read` / `settings:write`
- `events:write`

Only install plugins you trust. A plugin granted `orders:read` can read order information.

## Updating

Click **Update** and re-enter the current Manifest URL:

1. Preview the new version
2. Confirm permissions and admin pages
3. Update

Updating preserves the enabled state and existing configuration. If the service domain changes, the service secret must be configured again.

## Health check

Clicking **Health** calls the plugin service's `/health`. The result is shown in the list.

## Uninstalling

Click **Uninstall**:

- The plugin menu disappears immediately
- The plugin is disabled
- Historical orders and payment transactions are retained
- If there are pending payments, complete them first

## Troubleshooting

| Symptom | Check |
|---|---|
| Manifest fails to load | Is the URL HTTPS, public, and returning JSON? |
| Menu does not appear | Is the plugin enabled? Does the Manifest declare admin.pages? |
| iframe is blank | Does the plugin allow the store admin as a `frame-ancestors`? |
| Plugin API returns 403 | Are the permissions, origin, and JWT valid? |
| Health check fails | Do the service secrets match? Is `/health` implemented? |
