---
title: Plugin overview
description: The differences between bundled and remote plugins, their security boundaries, and when to use each.
---

CloudCart supports two kinds of plugins:

| | Bundled plugins | Remote plugins |
|---|---|---|
| Code location | Packaged with the Worker build | The plugin author's own HTTPS service |
| Installation | Released with the CloudCart version | Enter a Manifest URL in the admin |
| Redeploy required | Needed when upgrading the code | Not needed |
| Admin pages | Built into the CloudCart admin | Embedded via iframe |
| Data access | Internal Worker services | Permission-scoped `/api/plugin/v1/*` |
| Takes effect | Immediately on enable | After install and enable |

## Bundled plugins

Currently bundled:

- **Manual Payment**: bank transfer, cash on delivery, custom instructions
- **Stripe Checkout**
- **PayPal Orders v2**
- **Admin Language Pack**: English / Simplified Chinese
- **Email Notifications**: Resend or Cloudflare Email Workers

Bundled plugins are enabled/disabled in **Admin → Plugins**; configuration lives on the corresponding pages (Payments, Emails, language settings).

## Remote plugins

Remote plugins are suitable for:

- Independently deployed analytics, marketing, customer support, and ERP integrations
- Plugin authors who want to upgrade and release independently
- Cases that need their own database and admin pages

Security boundaries:

- Plugin code is **never** downloaded into the CloudCart Worker for execution
- During installation, the administrator confirms the Manifest and permissions
- Server-to-server communication is signed with HMAC-SHA256
- The admin iframe uses a short-lived JWT and can only access authorised APIs
- After a plugin is disabled, the next request fails immediately

See [Install remote plugins](/en/plugins/remote-install/) and [Develop remote plugins](/en/plugins/remote-development/).

## Not currently included

- A public plugin marketplace
- Publisher signatures, ratings, and paid plugins
- Automatic updates
- Remote themes and remote storefronts
