# CloudCart Admin CLI

`apps/cli` is a zero-dependency Node.js CLI for the CloudCart admin API. It is designed for both humans and AI agents: stable JSON output, scoped long-lived API keys, dry-run, and explicit confirmations for destructive operations.

## Authentication

The CLI stores one or more store profiles in a user-level config file:

- Windows: `%APPDATA%\cloudcart\config.json`
- macOS/Linux: `$XDG_CONFIG_HOME/cloudcart/config.json` or `~/.config/cloudcart/config.json`
- Override: `CLOUDCART_CONFIG`

First login:

```bash
pnpm cloudcart auth login --url https://store.example.com --email owner@example.com
```

The command logs in with the administrator password, creates an API key, saves the key, and logs out the temporary browser session. Passwords are read from the terminal (hidden), `--password-stdin`, or `CLOUDCART_PASSWORD`.

For non-interactive agents:

```bash
export CLOUDCART_URL=https://store.example.com
export CLOUDCART_API_KEY=cck_...
pnpm cloudcart products list --json
```

An existing key can be saved with:

```bash
pnpm cloudcart auth login --url ... --key cck_...
```

### API key security

- Token format: `cck_<key-id>.<secret>`.
- D1 stores only a SHA-256 hash and the public key id.
- Keys are scoped: `products:read`, `products:write`, `pages:write`, `orders:write`, etc. `*` is opt-in for `cloudcart api`.
- API keys bypass CSRF (they are not ambient browser credentials), but cookie sessions still require double-submit CSRF.
- Keys cannot change the administrator password, create other keys, manage plugins, or log out a browser session.
- Changing the administrator password revokes all of that administrator's API keys.
- Revoke the current key with `cloudcart auth logout`; revoke another key with `cloudcart keys revoke <id> --yes`.

## Output contract

Add `--json` to any command:

```json
{
  "ok": true,
  "command": "products create",
  "data": { "id": "prd_...", "slug": "canvas-tote" },
  "meta": { "site": "https://store.example.com", "profile": "default", "durationMs": 183 }
}
```

Errors:

```json
{
  "ok": false,
  "command": "products create",
  "status": 403,
  "exitCode": 3,
  "error": { "code": "insufficient_scope", "message": "This API key needs the products:write scope." }
}
```

Exit codes: `0` success/dry-run, `1` internal, `2` usage/confirmation, `3` auth/scope, `4` not found, `5` conflict, `6` rate limited, `7` server error, `8` network/timeout.

## Commands

### Auth and keys

```bash
pnpm cloudcart auth login|setup|status|whoami|logout
pnpm cloudcart keys list|create|revoke
```

`keys create` and `keys revoke` use a temporary password session; the plaintext key is shown only once.

### Products and media

```bash
pnpm cloudcart products list [--status active] [--q TEXT] [--json]
pnpm cloudcart products get PRODUCT_ID
pnpm cloudcart products create --name NAME --price 25.00 --status active \
  [--description TEXT] [--description-file FILE] [--slug SLUG] \
  [--compare-at-price PRICE] [--sku SKU] [--stock N] [--featured] \
  [--tag TAG]... [--category-id ID]... [--image URL]... [--image-file PATH]... \
  [--storage r2|jsdelivr] [--external]
pnpm cloudcart products update PRODUCT_ID [--name NAME] [--price PRICE] ... [--storage ...] [--external]
pnpm cloudcart products status PRODUCT_ID draft|active|archived
pnpm cloudcart products delete PRODUCT_ID --yes [--delete-media]
pnpm cloudcart products images add PRODUCT_ID MEDIA_ID [--alt TEXT]
pnpm cloudcart products images attach PRODUCT_ID --image-url URL|--file PATH [--alt TEXT] [--storage r2|jsdelivr] [--external]
pnpm cloudcart products images remove PRODUCT_ID IMAGE_ID --yes
pnpm cloudcart products images order PRODUCT_ID IMAGE_ID...

pnpm cloudcart media list
pnpm cloudcart media upload PATH [--alt TEXT] [--storage r2|jsdelivr]
pnpm cloudcart media import-url URL [--alt TEXT] [--storage r2|jsdelivr]
pnpm cloudcart media add-url URL [--alt TEXT]       # external link, no copy
pnpm cloudcart media storage                        # provider status
pnpm cloudcart media delete MEDIA_ID --yes
```

`products update` fetches the current product and merges flags, then sends the full replacement payload the API expects. `--data` bypasses the merge and must contain the complete payload.

Network images passed with `--image` / `--image-url` are downloaded and stored in the configured provider. Use `--external` to keep the old external-link behavior; it cannot be combined with `--storage` or local files. Local files are always uploaded. The server chooses the configured default provider when `--storage` is omitted; if no provider is configured, the upload fails with an actionable error.

### Image hosting: jsDelivr

The admin Settings page can store a GitHub PAT and publish uploads to a public repository through the GitHub Contents API. The CLI then uses that provider with `--storage jsdelivr` or the configured default.

The standalone script below remains available for manual/bulk publishing from a local clone. jsDelivr is a CDN, not an upload API; files must be committed and pushed before a URL works.

```bash
# One-time: create a public repo, clone it locally, then publish images
pnpm publish:jsdelivr --repo ../cloudcart-media --dest products \
  --tag v1 ./photo-1.jpg ./photo-2.jpg
```

The script copies images, commits, tags and pushes, then prints URLs such as:

```text
https://cdn.jsdelivr.net/gh/<owner>/cloudcart-media@v1/products/photo-1.jpg
```

Use the URL with `media add-url` (external link) or attach it to a product with `products images attach --image-url ... --external`.

`pnpm publish:jsdelivr --dry-run` prints the planned files and URL template without touching git. The target repository must already have an `origin` GitHub remote and use your normal git credentials.

**Terms warning:** jsDelivr is intended for open-source projects. Using it as a general-purpose commercial image CDN may violate its terms and can get the repository blocked. For a production store, prefer Cloudflare R2 (free tier) or Cloudflare Pages/Workers static assets.

### Categories

```bash
pnpm cloudcart categories list
pnpm cloudcart categories create --name NAME [--slug SLUG] [--parent-id ID]
pnpm cloudcart categories update CATEGORY_ID --name NAME
pnpm cloudcart categories delete CATEGORY_ID --yes
```

### Pages and blog

```bash
pnpm cloudcart pages list
pnpm cloudcart pages get SLUG
pnpm cloudcart pages create --title TITLE --slug SLUG
pnpm cloudcart pages draft SLUG --data page.json
pnpm cloudcart pages publish SLUG
pnpm cloudcart pages versions SLUG
pnpm cloudcart pages version SLUG VERSION
pnpm cloudcart pages restore SLUG VERSION
pnpm cloudcart pages preview SLUG --data page.json [--out preview.html]
pnpm cloudcart pages rename SLUG --title TITLE
pnpm cloudcart pages delete SLUG --yes

pnpm cloudcart blog list [--q TEXT] [--status draft|published|all]
pnpm cloudcart blog get SLUG
pnpm cloudcart blog create --title TITLE --slug SLUG --text-file post.html \
  [--excerpt TEXT] [--cover-image URL] [--cover-alt TEXT] [--heading TEXT] [--publish]
pnpm cloudcart blog update SLUG [--title TITLE] [--text-file post.html] [--publish]
pnpm cloudcart blog publish SLUG
pnpm cloudcart blog delete SLUG --yes
```

**Blog is a content-page wrapper.** Each post is a `content` page with a `hero` (optional) and `rich-text` section, published at `/pages/<slug>`. There is no `/blog` index, RSS, author/date/tag metadata, or Markdown conversion. The body is HTML and is sanitized by the storefront renderer.

To build an index, create a `/pages/blog` page and link to individual posts manually.

### Orders and marketing

```bash
pnpm cloudcart orders list [--status STATUS] [--payment-status STATUS] [--q TEXT]
pnpm cloudcart orders get ORDER_ID
pnpm cloudcart orders status ORDER_ID STATUS
pnpm cloudcart orders confirm-payment ORDER_ID [--note TEXT]
pnpm cloudcart orders ship ORDER_ID --carrier NAME --tracking-number NUMBER [--tracking-url URL]
pnpm cloudcart orders note ORDER_ID --note TEXT
pnpm cloudcart orders cancel ORDER_ID --yes
pnpm cloudcart orders refund ORDER_ID --amount 12.34 --yes

pnpm cloudcart customers list|get|notes
pnpm cloudcart coupons list|get|create|update|delete
pnpm cloudcart shipping list
pnpm cloudcart shipping zones create|update|delete
pnpm cloudcart shipping rates create|update|delete
pnpm cloudcart tax list|create|update|delete
```

Coupon `value` is an integer: percent `1–100`, or fixed amount in minor units. `coupons update` requires the full coupon JSON; use `coupons get` first so product/category scope IDs are preserved.

### Generic API and discovery

```bash
pnpm cloudcart api GET /api/admin/dashboard --json
pnpm cloudcart api POST /api/admin/settings --data @settings.json --json
pnpm cloudcart capabilities --json
pnpm cloudcart schema product
pnpm cloudcart doctor
```

`api` only accepts `/api/admin/` paths. Endpoints that are not wrapped by a typed command require a key with the `*` scope. `capabilities` and `schema` are designed for agents: run them first, then select a command and payload.

## Agent workflow

1. `cloudcart capabilities --json` to discover commands and scopes.
2. `cloudcart schema product` (or `page`, `coupon`, `shippingZone`, `shippingRate`, `taxRate`) for payloads.
3. Run writes with `--json --dry-run` first.
4. Run for real with `--json`; use `--yes` only for deletes/cancellations.
5. Never print or commit `CLOUDCART_API_KEY`; use a secret manager.

See the repository root `AGENTS.md` for a compact agent prompt.

## Troubleshooting

- `error code: 1010` from Cloudflare: the network or User-Agent is blocked. Try `--user-agent`/`CLOUDCART_USER_AGENT`, a normal network, or allow the CLI in Cloudflare WAF.
- `workers.dev` DNS is intercepted on some networks (Node reports `fetch failed` while curl succeeds): use Node 24 with `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY=http://127.0.0.1:<port>`, or run the CLI from a network that can resolve `workers.dev`.
- `session_required`: the operation (plugin management, key administration, password change) only allows a browser session with CSRF.
- `insufficient_scope`: create a key with the required scope (`keys create --scope products:write`) or use the default CLI key.
- `storage_not_configured` / `storage_unavailable`: configure R2 or jsDelivr in Admin → Settings → Media storage, or use `--external` for an explicit external link.
- HTTP with a public host is refused; use HTTPS. Localhost HTTP is allowed for development.
