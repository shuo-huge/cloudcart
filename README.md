<div align="center">

# CloudCart

**A free, open-source, plugin-based ecommerce platform built natively for Cloudflare Workers.**

One Worker · One D1 database · External image URLs · Optional R2

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shuo-huge/cloudcart)

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![D1](https://img.shields.io/badge/Database-D1-0051FF)](https://developers.cloudflare.com/d1/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-49%20passing-brightgreen)](docs/TEST_REPORT.md)

[English](README.md) · [简体中文](README.zh-CN.md) · [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md)

</div>

---

## Why CloudCart?

Opening a small online store should not cost more than the products you sell.

CloudCart exists because most ecommerce stacks force you to choose between paying a monthly platform fee, maintaining a server, or giving up control of your data. It removes that trade-off by using Cloudflare's free tier as the entire runtime: edge compute, SQLite, object storage, and static assets.

### The problems it solves

| Pain point | How CloudCart fixes it |
|---|---|
| **Shopify-style subscriptions + paid apps** | No platform subscription. Runs inside Cloudflare Workers Free. You pay for your domain and payment-provider fees, not hosting. |
| **VPS, MySQL, Redis, SSL, backups** | No server to patch, no database to provision. D1 is managed by Cloudflare; images can use public HTTPS URLs, and R2 is optional for direct uploads. |
| **SaaS lock-in and shared tenants** | Every store is its own Worker + D1 in **your** Cloudflare account; R2 can be added later. You own the data, the code, and the domain. |
| **Heavy SSR frameworks exceed free CPU limits** | Hono + Preact + small string-based SSR. Every public page is still server-rendered and SEO-readable. |
| **Expensive themes and closed page builders** | 8 structurally different bundled themes, a live three-column page editor, and a documented Theme SDK. MIT licensed. |
| **Payment plugins that require a paid backend** | Manual payment, Stripe Checkout, and PayPal Orders v2 are bundled. Secrets are encrypted with AES-GCM. |
| **Admin tools only in English** | The bundled Admin Language Pack adds English / 简体中文 with a runtime switcher. |
| **Fake "one-click" demos** | Every claim here is implemented. Tests run in workerd against D1; R2-backed uploads are optional. Unfinished work is listed explicitly. |

### How it compares

| | **CloudCart** | Shopify | WooCommerce |
|---|---|---|---|
| Monthly platform fee | **$0** on Cloudflare Free | Subscription + paid apps | $0 software, paid hosting |
| Hosting | Cloudflare edge | Included | VPS ($5–20+/mo) |
| Database | D1 (SQLite), included | Vendor-managed | MySQL you maintain |
| Data ownership | **Your Cloudflare account** | Vendor | Yours |
| Multiple stores | One Worker + D1 per store; optional R2 | Plan limits / tenants | One site per install |
| Themes | 8 bundled + SDK | Paid themes | Free/paid extensions |
| Visual page editor | Built in | Built in | Third-party |
| Open source | **MIT** | No | GPL |

---

## One-click deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shuo-huge/cloudcart)

Cloudflare deploys CloudCart into **your** account and provisions D1. R2 is optional. The button uses the repository's root `build` and `deploy` scripts: it builds the storefront/admin, then runs `scripts/deploy.mjs`. You do not need to create or paste any secrets: the script automatically generates `APP_MASTER_KEY` and `SETUP_TOKEN`, stores them as Worker secrets, and prints a private one-time setup URL in the deployment log.

Open the **Setup link** from the latest successful deployment log. The setup page asks only for the administrator name, email and password. Store name and currency use sensible defaults and can be changed later in Admin → Settings. The setup token is carried in the private URL and is not shown as a form field.

The one-time link stops working after the first administrator is created. If you deploy again before installation, use the refreshed link from the latest successful deployment log. No default admin password exists.

## CLI deploy (recommended for a complete setup)

```bash
git clone https://github.com/shuo-huge/cloudcart.git
cd cloudcart
pnpm install
pnpm run deploy:cloudflare
```

The CLI checks Node, Wrangler and Cloudflare login, then:

1. finds or creates a D1 database (reusing a database provisioned by the Deploy Button when present),
2. writes the real IDs into `wrangler.jsonc`,
3. builds the storefront and admin,
4. applies remote migrations through the `DB` binding,
5. deploys the Worker,
6. preserves `APP_MASTER_KEY` and creates or refreshes the one-time setup token while the store is uninstalled,
7. prints the store URL, admin URL and one-time setup link.

Re-running is safe: existing resources and secrets are reused, and no data is overwritten.

```bash
pnpm run deploy:cloudflare -- --name my-store   # named Worker / resources
pnpm run deploy:cloudflare -- --check           # non-mutating environment check
```

---

## Local development

Requirements: Node.js 20+ (CI uses 24; `.nvmrc` pins 22) and pnpm 10+ (`packageManager` pins 12.16.1).

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

`pnpm dev` creates local-only random secrets in `.dev.vars` automatically and prints a one-time setup URL. Existing local secrets are preserved between runs.

Browser end-to-end tests use Playwright against an isolated local D1 database:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

| URL | Purpose |
|---|---|
| `/` | Server-rendered storefront |
| `/admin` | Admin SPA |
| `/setup` | One-time installation |
| `/api/*` | Public and admin APIs |
| `/webhooks/stripe`, `/webhooks/paypal` | Payment webhooks |

---

## What you get

### Storefront
Server-rendered HTML for home, collections, search, product pages, cart, checkout and content pages. Meta tags, canonical URLs, Open Graph, Twitter cards, Product/Breadcrumb/Website JSON-LD, `sitemap.xml`, `robots.txt`, and 301 redirects are built in. Product names and descriptions are crawlable without JavaScript.

### Admin
Dashboard, products and variants, categories, external image URLs (optional R2 uploads), drag-reordered product image galleries, orders, customers, discounts, shipping zones and rates, tax rates, themes, visual page builder with version restore, plugins, email notifications with an outbox log, payment configuration, media library, store settings, SEO redirects, audit log, and local resource estimates.

### Commerce core
Server-side revalidation of prices, stock, coupons, shipping and tax on every checkout. Integer minor-unit money, order snapshots, atomic stock reservation with compensation, an explicit order state machine, manual payment confirmation with an audit trail, and manual shipment tracking. Tax supports country/region rate rules, a default rate, and tax-inclusive or tax-exclusive pricing; tax is included in the order total sent to payment providers.

### 8 bundled themes
Default, Fashion, Beauty, Electronics, Jewelry, Home, Sports, and Single Product. Each has a different layout, typography and card structure, not just a colour swap. All support the same Theme SDK and design tokens.

Theme gallery previews come from a single 4×2 WebP atlas (`apps/storefront/public/themes/theme-previews-atlas.webp`) cropped with CSS, plus a full-size preview modal in Admin → Themes. They are illustrative artwork, not screenshots of a running store.

### Visual page editor
Three-column editor with SortableJS drag ordering, add/remove/duplicate/hide sections, per-section content and style fields, live preview at desktop/tablet/mobile widths, autosaved drafts, undo/redo, publish, immutable version snapshots, and restore-into-draft from any published version. Page JSON is schema-validated and custom HTML is sanitised.

![Chinese admin login](docs/images/admin-login-zh.png)

### Payments
- **Manual**: bank transfer, cash on delivery, or custom instructions; admin confirmation with audit.
- **Stripe Checkout**: raw-body signature verification, amount/currency checks, idempotent event processing.
- **PayPal Orders v2**: server-side capture, webhook verification through PayPal's API, amount checks.

Provider credentials are AES-GCM encrypted with a key derived from `APP_MASTER_KEY` and never returned to the browser.

### Plugins
Build-time bundled, runtime enabled/disabled, with D1-backed settings. The registry rejects plugins that are not in the current build. Included: Manual, Stripe, PayPal, the **Admin Language Pack** (English / 简体中文), and **Email Notifications** (Resend or Cloudflare Email Workers, D1 outbox with retries and an admin log; disabled by default).

### Security
PBKDF2 passwords, HMAC-bound session cookies, CSRF double-submit, login rate limiting, prepared statements everywhere, an allow-list HTML sanitiser, magic-byte image validation, open-redirect protection, verified webhooks, and audit logging.

---

## Architecture at a glance

```
Browser
  └─ Cloudflare edge
       ├─ Workers Static Assets     /static/*, /static/admin-ui/*
       └─ Worker (Hono)             /, /api/*, /admin, /media/*, /webhooks/*
            ├─ D1 (SQLite)          products, orders, pages, settings, sessions…
            └─ optional R2           direct image uploads (HTTPS image URLs work without it)
```

```
apps/worker       Hono API, SSR, webhooks, media, admin shell
apps/admin        Preact admin SPA + page editor
apps/storefront   small client bundle (cart, newsletter)
packages/core     commerce services and business rules
packages/database D1 wrapper, row types, resource guard
packages/security Web Crypto, sessions, secret encryption, sanitising
packages/shared   money, ids, slugs, types
packages/plugin-sdk, theme-sdk, ui
plugins/          admin/i18n, payments/{manual,stripe,paypal}, notifications/email
themes/           8 bundled themes
migrations/       4 D1 migrations
scripts/          deploy CLI and asset preparation
tests/            workerd integration tests
docs/             architecture, plugin/theme/payment/deployment/security/testing docs
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design, order state machine, payment event pipeline, and free-tier strategy.

---

## Project status

**v0.2.0 — functional, not yet declared 1.0.** The repository is honest about what works and what does not.

Implemented and tested: setup/login/CSRF, products/categories/media, drag-reordered product images, server cart, guest checkout, stock reservation, tax calculation (inclusive/exclusive, country/region rules), manual payment, order fulfilment, 8 themes, page editor draft/preview/publish with version restore, Stripe signature + idempotency, PayPal order/capture/webhook verification, admin language pack, email notifications with a D1 outbox and provider retries, 49 workerd tests, and 7 Playwright browser specs.

Not yet verified or missing:
- No live Stripe/PayPal Sandbox transaction has been run in this repository; provider APIs are mocked in tests. Sandbox credentials are still to be supplied.
- A Workers Builds deployment succeeded in the maintainer's Cloudflare account, but this change set has not been re-deployed.
- PayPal uses hosted approval redirects, not embedded Smart Buttons.
- No live email provider delivery has been exercised; Resend and Cloudflare transports are mocked or unit-tested.
- No tax-exempt customer certificates or per-product tax classes.
- Theme previews are illustrative raster tiles in a WebP atlas, not screenshots of a running store.

See [docs/TEST_REPORT.md](docs/TEST_REPORT.md) for the exact verification matrix and known gaps.

---

## Documentation

- [PRD](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Plugin development](docs/PLUGIN_DEVELOPMENT.md)
- [Theme development](docs/THEME_DEVELOPMENT.md)
- [Payment integration](docs/PAYMENT_INTEGRATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Security](docs/SECURITY.md)
- [Free-tier budget](docs/FREE_TIER_BUDGET.md)
- [Test report](docs/TEST_REPORT.md)

---

## Contributing

CloudCart is MIT licensed. Themes, plugins, translations, bug reports and performance improvements are welcome.

- Add a theme: [docs/THEME_DEVELOPMENT.md](docs/THEME_DEVELOPMENT.md)
- Add a plugin: [docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md)
- Report a security issue privately rather than opening a public issue.
- If this project saves you a monthly bill, a star helps others find it.

## License

MIT. See [LICENSE](LICENSE). Third-party dependencies keep their own licenses.
