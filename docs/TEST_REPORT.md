# Test Report

**Date:** 2026-11-09
**Environment:** Windows 10, Node.js 24.18.0, pnpm 12.16.1, Wrangler 4.158.0,
Vitest 4.1.12, `@cloudflare/vitest-plugin` 1.6.0 (workerd; real D1 binding),
Playwright 1.65.0 (Chromium 1254).

All results below are from commands actually executed in this repository. No test is reported as
passing without its output.

---

## 1. Commands and results

| Command | Result |
|---|---|
| `pnpm install` | dependencies installed (24 workspace projects) |
| `pnpm typecheck` (`tsc --noEmit`) | **passed**, no diagnostics |
| `pnpm test` | **8 test files, 49 tests passed**, ~4.9 s |
| `pnpm build` | storefront + admin built; asset references regenerated |
| `pnpm test:e2e` | **10 Playwright tests passed** (1 setup + 9 browser), ~20 s |
| `wrangler deploy --dry-run --outdir .wrangler/dry` | **passed**; 23 asset files; Worker 1329.70 KiB / **246.41 KiB gzip**; D1 + ASSETS bindings resolved; no R2 binding (optional and not provisioned) |

Build output sizes:
- storefront bundle: 5.08 KiB JS (1.85 KiB gzip) / 1.03 KiB CSS (0.53 KiB gzip);
- admin bundle: 170.96 KiB JS (50.01 KiB gzip) / 20.85 KiB CSS (5.03 KiB gzip).

`node scripts/deploy.mjs --check` requires an authenticated Cloudflare account and was not run in
this session.

---

## 2. Workerd / Vitest coverage

### `tests/health.test.ts` (3 tests)
- `/api/health` returns 200, `database: "ok"`, version `0.2.0`, security header present.
- `/api/setup/status` reports an uninstalled store on a fresh DB.
- Unknown API route returns JSON 404.

### `tests/shared.test.ts` (9 tests)
- Money parsing without floating point (`19.99 → 1999`), invalid inputs, JPY zero-decimal.
- Integer percentage rounding.
- Slug normalisation and reserved-path safe redirects.
- HTML sanitiser removes scripts/event handlers/`javascript:` URLs, keeps safe links/images,
  escapes plain text.

### `tests/commerce.test.ts` (9 tests)
- One-time setup, owner authentication, `/me` session.
- Unauthenticated admin API → 401; missing CSRF on mutation → 403.
- End-to-end: product creation → SSR product HTML with JSON-LD → add to cart → server cart totals →
  guest checkout → order confirmation page → persisted order and stock decrement → admin manual
  payment confirmation → `paid/paid`, manual transaction, audit → carrier/tracking details saved →
  order shipped → tracking visible on the customer page.
- Duplicate checkout with an empty cart redirects to `/cart`; illegal status transition → 409.
- Theme switching: bundled themes listed; activation changes rendered markup; catalog data remains.
- Page editor: draft save; unpublished draft is private; preview renders draft HTML with allow-listed
  styles; `<script>` rejected; publish creates a version; later drafts stay private.
- Version restore: restoring an older snapshot updates only the draft; the live page stays on the
  current published version; republishing appends a new version; unknown versions return 404;
  restoring a version that does not belong to another page returns 404; old snapshots stay immutable.
- Admin language pack enable/disable, translations and switcher payload.

### `tests/payments.test.ts` (5 tests)
- Stripe signature verification (valid, wrong secret, stale/missing timestamp).
- Stripe Checkout creation (mocked) and signed `checkout.session.completed` marks the order paid.
- Duplicate Stripe event → `duplicate`, one event row, one succeeded transaction.
- Invalid signature → HTTP 400; amount mismatch → recorded, order unpaid.
- PayPal OAuth/order creation, return capture, webhook verification through PayPal's API (mocked).

### `tests/setup-page.test.ts` (3 tests)
- Setup token is a hidden field; store name/currency are optional at first run; token values are
  HTML-escaped.

### `tests/tax.test.ts` (10 tests)
- Exclusive tax on `subtotal − discount + shipping`; inclusive tax extracted without changing the
  total; zero rates; discount reduces the taxable base.
- Rule resolution: exact country+region → country-wide → default; case-insensitive; inactive rules
  fall back; an active zero-rate rule overrides a non-zero default; duplicate rules rejected.
- Checkout integration: exclusive 8.25% rate persisted on the order (`413` cents on `5000`),
  region override (`725` bps), inclusive rate leaves the total unchanged.

### `tests/email.test.ts` (6 tests)
- Disabled plugin queues nothing.
- Order placement queues a customer message; dispatch marks it sent and stores the provider message id.
- Store copy is queued when `store.email` is configured and `notifyAdmin` is enabled.
- Provider failure records attempts/error, schedules a backoff, and a later dispatch retries successfully.
- Manual payment confirmation and shipment status each enqueue the matching event.
- Cloudflare Email Workers binding transport sends through a fake `SendEmail` binding.

### `tests/products.test.ts` (4 tests)
- Reordering persists dense positions and changes the product's cover image.
- Duplicate, foreign, and incomplete ID lists are rejected without changing order.
- Removing an image compacts the remaining positions.
- Checkout stores the position-0 image in the order item snapshot.

---

## 3. Playwright browser coverage

`pnpm test:e2e` builds the app, resets a dedicated local D1 directory (`.wrangler/e2e`), applies all
four migrations, boots `wrangler dev` on `127.0.0.1:8787`, and seeds the store through the one-time
setup token. Specs (8 files, 10 tests):

1. **setup** — creates the owner, seeds tax/shipping/product images/home page and saves storage state.
2. **admin-auth** — signs in through the login form.
3. **page-editor** — drags the first section to the end with a mouse sequence, waits for autosave,
   reloads and verifies persistence, checks the preview iframe, switches tablet/mobile preview widths,
   publishes a new version and opens the versions modal.
4. **responsive** — desktop sidebar vs. mobile menu at 1280/768/390 px, no horizontal overflow, and
   editor/theme-grid column collapse.
5. **product-images** — drags image order, verifies the Cover badge, reloads, and checks that the new
   first image is the storefront product cover.
6. **emails** — opens the email admin page, enables the plugin, saves the From address, and disables it again.
7. **themes** — opens the full preview modal and verifies the WebP atlas background.
8. **checkout** — guest adds to cart, sees “Calculated at checkout”, completes a US manual-payment
   checkout, and sees `Sales tax $2.48` / total `$32.48` on the confirmation page.

The E2E suite discovered and verified two UI fixes made in this change:
- SortableJS was initialising before the outline/media grid mounted, so drag never attached on first
  load. The effects now wait for `loading` to become false.
- The checkout page estimated shipping for an empty country while the form defaulted to US. The
  checkout view now uses US as the initial country, preventing a shipping-rate mismatch on submit.

---

## 4. Not tested (explicit)

- **Live Stripe Sandbox and PayPal Sandbox transactions.** Provider APIs are mocked; no real
  credentials or money movement were used. Sandbox accounts are still to be supplied.
- **Live email provider delivery.** Resend and Cloudflare transports are mocked/unit-tested; no real
  message has been sent.
- **R2 upload integration.** Upload validation logic exists, but the default deployment has no R2
  binding and no multipart test was run.
- **Concurrent checkout race stress.** Conditional stock updates and compensation are implemented and
  reviewed, but not stress-tested under parallel load.
- **Cloudflare quota behaviour.** Cannot be simulated with free-tier account limits in tests.
- **Authenticated visual regression.** Playwright asserts layout/selectors, not pixel screenshots.

## 5. Known gaps that affect correctness claims

- PayPal uses hosted approval redirects rather than embedded Smart Buttons.
- Tax has no customer exemption certificates or per-product tax classes.
- Email delivery has no inbound processing, bounce handling or scheduled retry loop; retries are
  request-driven.
- The deploy script rewrites `wrangler.jsonc` as normalised JSON if it contained comments.

These are documented in `README.md` and are not presented as complete.

---

## 6. Reproduce

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry
```

Playwright uses an isolated D1 persistence directory and the existing `.dev.vars` secrets; it does
not modify the main local D1 database. In CI the browser job installs Chromium with
`playwright install --with-deps chromium`.
