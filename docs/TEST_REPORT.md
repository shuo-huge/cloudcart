# Test Report

**Date:** 2026-11-06
**Environment:** Windows 10, Node.js 24.18.0, pnpm 12.16.1, Wrangler 4.158.0,
Vitest 4.1.12, `@cloudflare/vitest-plugin` 1.6.0 (workerd; real D1/R2 bindings).

All results below are from commands actually executed in this repository. No test is reported as
passing without its output.

---

## 1. Commands and results

| Command | Result |
|---|---|
| `pnpm install` | dependencies installed (20 workspace projects) |
| `pnpm typecheck` (`tsc --noEmit`) | **passed**, no diagnostics |
| `pnpm test` | **4 test files, 24 tests passed**, ~3.7 s |
| `pnpm build` | storefront + admin built successfully; asset references regenerated |
| `wrangler deploy --dry-run --outdir .wrangler/dry` | **passed**; 22 asset files (including 8 theme preview SVGs), Worker bundle 1237.12 KiB / **225.17 KiB gzip**; D1/R2/ASSETS bindings resolved |
| `node scripts/deploy.mjs --check` | **passed** Node/Wrangler/Cloudflare-auth checks; no resources changed |
| Local `wrangler dev` smoke test | health, home SSR, admin shell, admin login, 8 themes, sitemap all returned 200 |

Build output sizes:
- storefront bundle: 4.25 KiB JS (1.58 KiB gzip) / 1.03 KiB CSS;
- admin bundle: 156.75 KiB JS (46.43 KiB gzip) / 18.29 KiB CSS.

---

## 2. What the automated tests cover

### `tests/health.test.ts` (3 tests)
- `/api/health` returns 200, `database: "ok"`, security header present.
- `/api/setup/status` reports an uninstalled store on a fresh DB.
- Unknown API route returns JSON 404.

### `tests/shared.test.ts` (9 tests)
- Money parsing without floating point (`19.99 → 1999`), invalid inputs, JPY zero-decimal.
- Integer percentage rounding.
- Slug normalisation and reserved-path safe redirects.
- HTML sanitiser removes scripts/event handlers/`javascript:` URLs, keeps safe links/images,
  escapes plain text.

### `tests/commerce.test.ts` (7 tests)
- One-time setup, owner authentication, `/me` session.
- Unauthenticated admin API → 401; missing CSRF on mutation → 403.
- End-to-end: product creation → admin list → SSR product HTML with JSON-LD → add to cart →
  server cart totals → guest checkout → order confirmation page → persisted order and stock
  decrement → cart emptied → admin manual payment confirmation → `paid/paid`, manual transaction,
  audit → carrier/tracking details saved → order shipped → tracking visible on the customer page.
- Duplicate checkout with an empty cart redirects to `/cart`; illegal status transition → 409.
- Theme switching: all 8 bundled themes listed; activating electronics/sports/beauty/default changes
  rendered markup; catalog data remains intact.
- Page editor: draft save; unpublished draft is **not** public; preview renders draft HTML with
  allow-listed inline section styles; `<script>` in page JSON rejected; publish creates a version and
  becomes public; later draft edits do not change the published page.

### `tests/payments.test.ts` (4 tests)
- Stripe signature verification: valid, wrong secret, stale timestamp, missing timestamp.
- Stripe Checkout session creation (mocked API) → order stays `pending_payment` with a pending
  transaction, then a correctly signed `checkout.session.completed` marks it paid.
- Duplicate Stripe event → `duplicate`, one `payment_events` row, one succeeded transaction.
- Invalid signature → HTTP 400.
- Stripe amount mismatch → event recorded as `mismatch`, order remains unpaid.
- PayPal OAuth + order creation (mocked) → hosted approval redirect, transaction stored.
- PayPal return capture (mocked) → server verifies captured amount → order paid.
- PayPal webhook signature verification via PayPal’s verification API (mocked) → event processed.

### `tests/commerce.test.ts` — admin language pack
- `/api/i18n` returns the plugin disabled with two locales and no dictionaries by default.
- Enabling `admin-i18n`, setting `defaultLocale=zh-CN` and `showSwitcher=1` produces an enabled
  payload with `Products → 商品`, `Orders → 订单`, `Sign in → 登录`.
- The plugin appears in `/api/admin/plugins` as type `admin`, bundled and enabled.
- Disabling the plugin removes dictionaries and returns the admin to English.

Tests run inside workerd with real D1 prepared statements and R2 bindings; provider HTTP calls are
stubbed deterministically by replacing `globalThis.fetch` in the shared test isolate.

---

## 3. Local runtime smoke test (outside Vitest)

A real `wrangler dev` instance was started against the local D1 after applying both migrations:

```
GET /api/health             200 {"status":"ok","database":"ok"}
POST /api/admin/setup       200  (cookie session + CSRF issued)
POST /api/admin/products    201  product created
GET /                       200  SSR home included the product, cart badge
GET /products/<slug>        200  JSON-LD Product present
GET /cart                   200  empty cart rendered
GET /admin                  200  SPA shell
GET /admin/static/<hash>.js 200  text/javascript
GET /sitemap.xml            200  product URL present
```

After the final build, a second smoke run confirmed health, home (200, 19,339 bytes), admin shell,
owner login (200), 8 themes (200) and sitemap (200).

A headless-browser check (gstack) opened `/admin`, selected **简体中文** in the language switcher,
and confirmed the login screen rendered translated labels (`登录`, `邮箱`, `密码`,
`使用初始化时创建的店主账号。`) with cookies/localStorage persisting the choice. Authenticated
admin screens were not visually re-checked because the local owner password is not known to the
test environment; the same overlay applies to every admin page.

---

## 4. Not tested (explicit)

- **Live Stripe Sandbox and PayPal Sandbox transactions.** Provider APIs are mocked; no real
  credentials or money movement were used.
- **Real deployment to a Cloudflare account.** The deploy CLI’s non-mutating `--check` passed, but
  no resources were created or deployed during this session.
- **Browser end-to-end UI tests.** No Playwright suite. In particular, SortableJS drag interaction,
  responsive admin layouts and visual appearance were not asserted by automation.
- **R2 upload integration test.** Upload validation (magic bytes, size, SVG rejection) has unit-level
  logic but no automated multipart test.
- **Concurrent checkout race stress.** Conditional stock updates and compensation are implemented and
  reviewed, but not stress-tested under parallel load.
- **Email delivery** — not implemented by design in v1.
- **Tax calculation** — not implemented.
- **Theme customisation UI, discounts UI, shipping UI** — exercised indirectly through APIs in some
  cases, but not via browser automation.
- **Cloudflare quota behaviour** — cannot be simulated with the free-tier account limits in tests.

---

## 5. Known gaps that affect correctness claims

- PayPal uses hosted approval redirects rather than embedded Smart Buttons.
- Restoring an older page version is not implemented.
- Product image reordering is not implemented.
- Theme previews are original SVG artwork, not screenshots of a running store.
- The deploy script rewrites `wrangler.jsonc` as normalised JSON if it contained comments.

These are documented in `README.md` and are not presented as complete.

---

## 6. Reproduce

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry
node scripts/deploy.mjs --check
```
