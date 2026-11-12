---
title: "CLI & agents"
description: Use the command line and an API key to let agents such as Claude Code, Cursor and Codex manage products, pages, blog posts, orders and marketing directly.
---

CloudCart ships a zero-dependency Node CLI at `apps/cli`. It wraps the admin API as commands and is designed for both humans and agents:

- No browser cookies; uses a long-lived API key
- Stable `--json` output that is easy for agents to parse
- `--dry-run` shows the plan first; `--yes` is required to execute deletions
- Supports products, images, categories, pages, blog posts, orders, customers, coupons, shipping and tax

## First login

```bash
pnpm cloudcart auth login --url https://your-store.example.com --email owner@example.com
```

The command logs in with the admin password, automatically creates an API key, saves it to the current user's directory and then ends the temporary session. The password is hidden as you type; you can also use `--password-stdin` or `CLOUDCART_PASSWORD`.

For non-interactive agents, using environment variables directly is recommended:

```bash
export CLOUDCART_URL=https://your-store.example.com
export CLOUDCART_API_KEY=cck_...
pnpm cloudcart products list --json
```

An existing key can be saved locally:

```bash
pnpm cloudcart auth login --url https://... --key cck_...
```

## Uploading products

```bash
pnpm cloudcart products create \
  --name "Canvas Tote" \
  --price 25.00 \
  --status active \
  --stock 20 \
  --tag bags \
  --image https://example.com/tote.jpg \
  --json
```

Network images are downloaded and written to the configured storage by default; only `--external` keeps them as external links. For local files use `--image-file ./photo.jpg`, and choose storage with `--storage r2|jsdelivr`.

Updating a product:

```bash
pnpm cloudcart products update PRODUCT_ID --price 29.50 --status active --json
```

`products update` reads the existing product first and then merges fields, so the API's full PUT does not reset fields you did not supply.

## Image hosting: R2 / jsDelivr

There are three common ways to host product images:

1. **Cloudflare R2**: after configuring the `MEDIA` binding, `pnpm cloudcart media upload --storage r2` uploads directly, and images are served by the Worker at `/media/*`.
2. **jsDelivr**: after configuring a public GitHub repository and PAT in Admin → Settings → Media storage, `--storage jsdelivr` makes the Worker upload through the GitHub Contents API.
3. **External HTTPS links**: `media add-url` or `--external` only records the address and does not copy the file.

```bash
pnpm cloudcart media upload ./photo.jpg --storage jsdelivr --json
pnpm cloudcart media import-url https://example.com/a.jpg --storage jsdelivr --json
pnpm cloudcart products images attach PRODUCT_ID --image-url https://example.com/a.jpg --storage jsdelivr --json
pnpm cloudcart products images attach PRODUCT_ID --image-url https://example.com/a.jpg --external --json
```

The manual publishing script is still available:

```bash
pnpm publish:jsdelivr --repo ../cloudcart-media --dest products \
  --tag v1 ./photo-1.jpg ./photo-2.jpg
```

The script copies the images, commits, tags, pushes and prints:

```text
https://cdn.jsdelivr.net/gh/<owner>/cloudcart-media@v1/products/photo-1.jpg
```

Then reference it on a product:

```bash
pnpm cloudcart products images attach PRODUCT_ID \
  --image-url https://cdn.jsdelivr.net/gh/.../photo-1.jpg --external
```

`--dry-run` only prints the plan and does not modify git.

:::caution
jsDelivr is aimed primarily at open-source projects and is not a general-purpose commercial image host. Long-term use for a commercial product catalogue may violate its terms. For production, prefer R2 or Cloudflare Pages/Workers static assets.
:::

## Creating pages

```bash
pnpm cloudcart pages create --title "About us" --slug about-us
pnpm cloudcart pages draft about-us --data page.json
pnpm cloudcart pages publish about-us
```

`page.json` is the PageDocument used by the page editor; you can run this first:

```bash
pnpm cloudcart schema page
```

## Publishing blog posts

CloudCart currently has no separate blog table. The CLI's `blog` commands reuse content pages: each post is a page at `/pages/<slug>`, with the body in a `rich-text` section.

```bash
pnpm cloudcart blog create \
  --title "Launch notes" \
  --slug launch-notes \
  --text-file post.html \
  --excerpt "What is new this week" \
  --cover-image https://example.com/cover.jpg \
  --publish \
  --json
```

Limitations:

- No `/blog` index, RSS, or blog metadata such as author/date/tags
- The body is HTML; Markdown is not converted automatically
- You can create a separate `/pages/blog` page and link to each post manually

## Orders and marketing

```bash
pnpm cloudcart orders list --json
pnpm cloudcart orders ship ORDER_ID --carrier UPS --tracking-number 1Z...
pnpm cloudcart orders returns ORDER_ID --json
pnpm cloudcart orders return ORDER_ID --item ORDER_ITEM_ID:1 --restock --yes --json
pnpm cloudcart coupons create --code SAVE10 --type percent --value 10 --json
pnpm cloudcart tax create --name "CA tax" --country US --region CA --rate-percent 8.25
```

## Agent integration

First let the agent discover commands and parameters:

```bash
pnpm cloudcart capabilities --json
pnpm cloudcart schema product
pnpm cloudcart schema coupon
```

Recommended workflow:

1. Read `capabilities` to confirm the commands and required scopes.
2. Read `schema` and construct the payload.
3. For write operations, start with `--json --dry-run`.
4. Once confirmed, remove `--dry-run`; add `--yes` for delete/cancel.
5. Never write `CLOUDCART_API_KEY` to logs or commit it to the repository.

Claude Code, Cursor, Codex, Gemini CLI and others can call the CLI directly as long as they can run shell commands; the `AGENTS.md` at the repository root provides a condensed agent prompt.

## API key security

- Keys are stored in D1 only as SHA-256 hashes; the plaintext is shown once at creation
- Keys are scoped per resource, for example `products:write`, `pages:read`, `orders:write`
- They cannot change the admin password, create other keys or manage plugins
- Changing an admin password revokes all of that admin's API keys
- `pnpm cloudcart auth logout` revokes the current key and deletes the local configuration

### Network issues

If `workers.dev` is affected by DNS poisoning, the CLI shows `fetch failed`. Node 24 can reach the network through an environment proxy:

```bash
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
  pnpm cloudcart products list --json
```

You can also bind the store to your own domain, or use a network that can resolve `workers.dev`.

## Other commands

```bash
pnpm cloudcart auth status
pnpm cloudcart auth whoami
pnpm cloudcart keys list
pnpm cloudcart api GET /api/admin/dashboard --json
pnpm cloudcart doctor
```

For the full command reference, see [`docs/CLI.md`](https://github.com/shuo-huge/cloudcart/blob/main/docs/CLI.md) in the repository.
