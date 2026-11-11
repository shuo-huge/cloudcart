---
title: Frequently asked questions
description: Common questions about deployment, domains, R2, email, tax, plugins, and data.
---

## Cannot find the website link after deployment

One-click deploy runs in the Cloudflare cloud and does not automatically open a browser on your computer.

- Look at the final `Website / 网站` line in the latest Build logs
- Or go to Workers & Pages → your project → **Visit**
- Address format: `https://<worker>.<subdomain>.workers.dev`

## Lost the setup link

If you have not created an administrator yet, redeploy once; the script generates a new setup link.

If setup is already complete, go directly to `/admin`.

## Is R2 required?

No. HTTPS external image links are used by default. R2 only needs to be enabled when you need to upload images directly.

## Can I bind my own domain?

Yes. Add a custom domain in Cloudflare Worker → Settings → Domains & Routes.

Remote plugins, payment callbacks, and email links all use the origin of the current request, so after changing the domain you generally do not need to change any code.

## Why were emails not sent?

Check:

- Whether the Email Notifications plugin is enabled
- Whether the sender address, API key, or `EMAIL` binding is configured
- The status and errors in the admin Emails outbox
- The free Resend quota or recipient limits

The current version has no real-provider delivery test; verify with a test mailbox first.

## How is tax calculated?

The tax base is:

```text
max(0, item subtotal - discount + shipping)
```

Tax-inclusive and tax-exclusive prices are supported, along with country/region override rules. See [Shipping & tax](/en/admin/shipping-tax/).

## Can I install plugins written by others?

Yes. Remote plugins are installed via a Manifest URL and do not require redeploying CloudCart.

However, plugins run on the author's own server, so check permissions before installing. A plugin granted `orders:read` can read order information.

## Why does a remote plugin have no menu?

- Whether the plugin is enabled
- Whether the Manifest declares `admin.pages`
- Whether the admin has been refreshed

After enabling/disabling, the admin refreshes automatically to update the menu and CSP.

## Who owns the data?

The data lives in your own Cloudflare account and D1 database. CloudCart does not host your product, order, or customer data.

## Can I export data?

You can use Cloudflare D1's export capabilities directly, or read data through the API. The current admin has no one-click export button.

## Why is there no email, tax, or plugin marketplace?

The boundaries of the current version are documented in [Introduction](/en/getting-started/introduction/) and the repository's `README.md`. Capabilities that are not implemented are not described as complete.
