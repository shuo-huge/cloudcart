---
title: CloudCart
description: A free, open-source, plugin-based ecommerce platform built natively on Cloudflare Workers.
template: splash
hero:
  tagline: One Worker and one D1 database are all you need to run your own online store. Open source, free, and your data stays yours.
  actions:
    - text: Quick start
      link: /en/getting-started/introduction/
      icon: right-arrow
      variant: primary
    - text: One-click deploy
      link: /en/getting-started/one-click-deploy/
      icon: rocket
      variant: secondary
---

## Why CloudCart

CloudCart puts products, orders, cart, checkout, themes, the page editor and plugins into a single Cloudflare Worker, with data stored in your own D1 database.

- **No platform monthly fees**: runs within the Cloudflare Workers Free tier.
- **Your data stays yours**: every store has its own Worker and D1, with no shared tenancy with other merchants.
- **Ready out of the box**: 8 themes, visual page editor, SEO, coupons, shipping, tax and email notifications.
- **Genuinely extensible**: built-in payment and email plugins, plus remote plugins that need no redeploy.
- **Search-engine friendly**: product and content pages are server-rendered, with Meta, JSON-LD and sitemap built in.

## Start here

| I want to… | Where to go |
|---|---|
| Understand what CloudCart is | [Introduction](/en/getting-started/introduction/) |
| Run it locally | [Local development](/en/getting-started/local-development/) |
| Deploy straight to Cloudflare | [One-click deploy](/en/getting-started/one-click-deploy/) |
| Install remote plugins | [Install remote plugins](/en/plugins/remote-install/) |
| Build my own theme or plugin | [Developer documentation](/en/developers/architecture/) |

## Current status

CloudCart is currently at v0.5.0: the core storefront, 8 themes, tax, email notifications, page version rollback, image ordering, R2/jsDelivr local uploads with storage switching, hybrid built-in/remote plugins, the agent-oriented admin CLI and browser end-to-end tests are all complete. Capabilities that have not yet been verified are clearly marked in the relevant documentation.
