# Free-Tier Budget

Verified against Cloudflare’s documentation on **2026-11-06**:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/r2/pricing/

Cloudflare changes limits from time to time; re-check before assuming these values.

## 1. Limits this project targets

| Resource | Free limit used by CloudCart |
|---|---|
| Workers requests | 100,000 / day |
| Worker CPU time | 10 ms per HTTP request |
| Worker memory | 128 MB per isolate |
| Subrequests | 50 per invocation |
| Static asset files | 20,000 per Worker version |
| Static asset file size | 25 MiB |
| D1 databases | 10 per account |
| D1 database size | 500 MB |
| D1 account storage | 5 GB |
| D1 rows read | 5,000,000 / day |
| D1 rows written | 100,000 / day |
| D1 queries per invocation | 50 (a `db.batch()` counts as one) |
| R2 storage | 10 GB-month |
| R2 Class A operations | 1,000,000 / month |
| R2 Class B operations | 10,000,000 / month |

All of these are **shared across the whole Cloudflare account**, not per store.

## 2. Engineering rules applied

- **Static first**: the storefront and admin bundles are hashed static assets served by Workers
  Static Assets, not rendered by the Worker.
- **One request, few queries**: list endpoints fetch count + page in a single `db.batch()`, and joins
  replace per-item lookups (no application-level N+1).
- **Pagination everywhere**: admin and storefront lists cap page size (20 admin / 12 storefront),
  with a maximum of 100.
- **Small HTML**: themes are string renderers, not a large SSR framework. No React server rendering.
- **No base64 media in D1**: images use external HTTPS URLs by default, or optional R2 uploads;
  only keys/URLs and metadata are stored.
- **No polling / cron**: no background jobs or scheduled Workers. Email retries are lazy: they run
  after a new order event or when an administrator presses Process queue.
- **No unnecessary subrequests**: storefront reads do not call external services. Payment provider
  calls happen only during checkout/webhooks.
- **Cache-friendly assets**: content-hashed JS/CSS, immutable media caching. HTML is private because
  it contains the visitor’s cart count.
- **Storage guard**: when R2 is enabled, media uploads are refused at 80% of the R2 free storage
  (8 GB) unless the limit is deliberately changed. External image URLs do not consume R2. No
  automatic plan upgrade.
- **Warning thresholds**: the admin resource panel warns above 80% of daily request/write and image
  storage estimates. The Cloudflare dashboard remains authoritative.

## 3. Local estimates vs official metrics

`resource_usage` and the admin **Usage** panel are CloudCart’s own estimates:
- API requests handled by the Worker;
- R2 Class A operations performed by CloudCart (uploads);
- media storage from `media.size_bytes`.

Cloudflare does **not** expose exact per-request quota counters to the application. The application
therefore cannot guarantee remaining account-wide quota. The admin labels local numbers as
estimates, and the Cloudflare dashboard is the source of truth. CloudCart never auto-upgrades the
plan.

## 4. Capacity guidance per store

- D1 500 MB per database: products/orders text data is small; a 10,000-product catalog with a few
  thousand orders is well within this range. Media is external or in R2, not D1. Each notification
  email adds one outbox row with its rendered body; prune old rows if volume grows.
- R2 10 GB (optional): roughly 2,000 images at 5 MB, or ~10,000 at 1 MB. Uploads stop at the
  configured 8 GB local threshold. The default deployment uses no R2 bucket.
- 100,000 requests/day: a low-traffic store with ~2,000 page views/day plus assets is far below the
  limit; assets do not count as Worker invocations.
- 100,000 D1 writes/day: order creation is ~10–20 writes; this supports thousands of orders/day.

These are estimates, not guarantees.

## 5. What is not protected automatically

- Hard blocking of all D1 writes at a quota threshold (the account-wide value is not readable from
  inside the Worker).
- Per-IP rate limiting for public endpoints.
- Automatic cleanup of unreferenced media.
- Paid overage prevention beyond Cloudflare’s own enforcement. CloudCart never purchases capacity.
