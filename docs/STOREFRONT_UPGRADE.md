# CloudCart storefront upgrade (v0.2)

This upgrade is merged into `main` through PR #1 and applies to existing single-store CloudCart deployments.

## Included

- Eight standard content page drafts: About Us, Contact Us, FAQ, Shipping Policy, Returns & Refunds, Privacy Policy, Terms of Service, and Payment Policy.
- Drafts are created during new-store setup and when existing store owners open Page Builder. Existing pages with matching slugs are never replaced.
- Policy and customer-information drafts require merchant review and explicit publishing.
- Existing theme renderers handle the full page section document instead of discarding all but rich text.
- Default and seven theme-kit storefronts include published legal/customer page links in their footers. Unpublished policy pages are never linked.
- Custom content pages can be created in Page Builder.
- Content-page preview shows the actual draft; sitemap excludes unpublished pages.
- A store-page regression test covers draft visibility, preview, publish and sitemap behaviour.
- Page versions can now be restored into the draft; publishing after a restore creates a new immutable version.
- Checkout now calculates tax, and order emails use a D1 outbox with retry and an admin log.

## Before publicly launching a store

1. Review and complete every draft with actual merchant information and policies.
2. Publish verified pages in **Admin > Page Builder**.
3. Verify the storefront footer, mobile layout and content-page links.
4. Do not use unreviewed sample legal text in production.

## Verification

Verified on 2026-11-09:

```sh
pnpm typecheck
pnpm test        # 14 files, 94 tests
pnpm build
pnpm test:e2e    # 11 Playwright tests: setup, login, editor drag, responsive, images, emails, remote plugins, themes, checkout
```

No live Cloudflare resources or payment-provider sandbox accounts were used by this verification.
