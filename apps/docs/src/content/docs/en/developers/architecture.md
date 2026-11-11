---
title: Architecture overview
description: CloudCart's runtime topology, code structure and request flow.
---

## Topology

```text
Browser
  └─ Cloudflare edge
       ├─ Workers Static Assets     /static/*, /static/admin-ui/*
       └─ Worker (Hono)             /, /api/*, /api/plugin/v1/*, /admin, /media/*, /webhooks/*
            ├─ D1 (SQLite)          products, orders, pages, settings, sessions…
            ├─ Optional R2          direct image uploads
            └─ Remote plugins       standalone HTTPS service + iframe admin
```

One store = one Worker + one D1. There is no multi-tenant shared database.

## Code structure

| Path | Purpose |
|---|---|
| `apps/worker` | Hono API, SSR, webhooks, media, admin shell |
| `apps/admin` | Preact admin SPA and page editor |
| `apps/storefront` | Small storefront scripts (cart, subscriptions) |
| `apps/docs` | This documentation site (Astro Starlight) |
| `packages/core` | Business logic for products, orders, payments, tax, pages, themes, plugins and more |
| `packages/database` | D1 wrapper, row types, resource guards |
| `packages/security` | Passwords, sessions, encryption, JWT, CSP, sanitisation |
| `packages/plugin-sdk` | Plugin/payment/remote plugin types |
| `packages/theme-sdk` | Theme interfaces, HTML utilities, theme kit |
| `plugins/*` | Bundled plugins |
| `themes/*` | 8 themes |
| `migrations/` | D1 migrations |

## Request flow

### Storefront

1. The Worker creates the `Storefront` service
2. Reads data through D1 queries
3. The theme returns an HTML string
4. `renderDocument` adds SEO, JSON-LD, design variables and static asset paths

All public pages are server-rendered and do not depend on a frontend framework.

### Checkout

1. Reload the cart from D1
2. Validate products, stock, coupons and shipping
3. Calculate tax
4. Reserve the coupon and stock
5. Atomically write the order, line items, addresses and stock ledger
6. Clear the cart
7. Manual payment → awaiting payment; online payment → create a payment session

### Payment events

```text
Provider → /webhooks/:plugin
  1. Verify the signature
  2. Normalise to a PaymentEvent
  3. Idempotency by eventId
  4. Validate amount and currency
  5. Mark the transaction successful + the order as paid
```

Duplicate events and amount mismatches never mark an order as paid.

### Remote plugins

```text
Admin iframe → postMessage(ready)
  → /api/admin/plugins/:id/launch
  → short-lived JWT
  → iframe calls /api/plugin/v1/*
```

CloudCart → plugin service uses HMAC signatures; plugin → CloudCart uses a Bearer JWT.

## Data model

Main tables:

`products`, `product_variants`, `product_images`, `categories`, `carts`, `cart_items`, `orders`, `order_items`, `order_addresses`, `payment_transactions`, `payment_events`, `shipping_zones`, `shipping_rates`, `tax_rates`, `plugins`, `plugin_settings`, `pages`, `page_versions`, `themes`, `email_outbox`, `store_identity`, `audit_logs`.

All amounts use integer minor currency units (such as cents).

## Security

- PBKDF2 passwords
- HMAC session cookies
- CSRF double submit
- Login rate limiting
- All SQL is prepared statements
- HTML allowlist
- CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`
- Plugin JWT/HMAC/CORS isolation

For the detailed design, see `docs/ARCHITECTURE.md` and `docs/SECURITY.md` in the repository.
