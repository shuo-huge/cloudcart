---
title: Introduction
description: What CloudCart is, what it covers and how it runs.
---

CloudCart is a free, open-source, plugin-based ecommerce platform built natively on Cloudflare Workers. It is aimed at merchants and developers who want to run an independent store at low cost without maintaining servers or databases.

## Runtime model

```text
Browser
  └─ Cloudflare edge
       ├─ Workers Static Assets     /static/*, /static/admin-ui/*
       └─ Worker (Hono)             /, /api/*, /admin, /media/*, /webhooks/*
            ├─ D1 (SQLite)          products, orders, pages, settings, sessions…
            ├─ optional R2          direct image uploads; HTTPS image links used by default
            └─ remote plugins       signed HTTPS API + iframe admin on the plugin author's server
```

Every store is its own Worker + D1 and does not share a database with other merchants. Plugin code can be bundled into the Worker build or deployed independently as a remote plugin.

## Implemented features

- **Storefront**: home page, categories, search, product detail, cart, checkout, order confirmation, content pages
- **Admin**: products and variants, categories, images, orders, customers, coupons, shipping, tax rates, themes, page editor, plugins, email, settings, SEO, audit
- **Commerce core**: server-side recalculation of prices, stock, discounts, shipping and tax; stock reservation; order state machine; manual payment confirmation; shipment tracking
- **Payments**: Manual, Stripe Checkout, PayPal Orders v2, plus remote payment plugins
- **Themes**: 8 built-in themes + Theme SDK
- **Page editor**: drag-and-drop ordering, live preview, autosave, publish, version rollback
- **Plugins**: built-in plugins + remote plugins installed at runtime
- **SEO**: server-side rendering, Meta, Open Graph, JSON-LD, sitemap, robots, 301 redirects

## Current version and scope

The current version is **v0.5.0**. Core features are usable, but we do not yet claim 1.0.

Not yet complete or verified:

- PayPal Sandbox transactions (Stripe Sandbox has passed real payment verification; automated tests use mocks)
- Delivery through a real email provider
- A public plugin marketplace, publisher signing, paid plugins and automatic updates
- Remote themes and remote storefronts
- Tax-exempt customer certificates and per-product tax classes

These limitations are stated clearly in the relevant documentation, so that unfinished capabilities are not mistaken for completed ones.

## Tech stack

Hono, Preact, TypeScript, D1 and Cloudflare Workers Static Assets. There is no server to keep running, and no Cloudflare service you must pay for.
