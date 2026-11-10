# CloudCart agent guide

CloudCart ships an admin CLI at `apps/cli`. Use it to manage products, pages, blog posts, orders and marketing settings without driving a browser.

## Setup

```bash
export CLOUDCART_URL=https://your-store.example.com
export CLOUDCART_API_KEY=cck_...
```

Or run `pnpm cloudcart auth login --url ... --email ...` once to create and store a scoped key.

Never print, commit, or log `CLOUDCART_API_KEY`. Prefer a secret manager in CI.

## Rules

1. Always add `--json` when parsing output.
2. Run `pnpm cloudcart capabilities --json` first to discover commands and scopes.
3. Run `pnpm cloudcart schema <resource>` to get payload schemas (`product`, `page`, `coupon`, `shippingZone`, `shippingRate`, `taxRate`).
4. Use `--dry-run` before writes.
5. Use `--yes` only for delete/cancel/refund operations after confirming intent.
6. Do not retry non-idempotent writes blindly; inspect the JSON error and exit code first.
7. Blog posts are content pages at `/pages/<slug>`; there is no `/blog` index, RSS, Markdown conversion, or post metadata.
8. Network images passed to `--image` / `--image-url` are downloaded and stored in the configured provider. Use `--storage r2|jsdelivr` to choose, or `--external` to link without storing. Local files are always uploaded.

## Examples

```bash
# Product
pnpm cloudcart products create --name "Canvas Tote" --price 25.00 --status active \
  --image https://example.com/tote.jpg --json

# Blog/content page
pnpm cloudcart blog create --title "Launch notes" --slug launch-notes \
  --text-file post.html --publish --json

# Order fulfilment
pnpm cloudcart orders ship ORDER_ID --carrier UPS --tracking-number 1Z... --json

# Generic API (requires a key with the * scope)
pnpm cloudcart api GET /api/admin/dashboard --json
```

Full reference: `docs/CLI.md`.
