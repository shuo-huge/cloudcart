# CloudCart storefront upgrade (v0.2, in progress)

The improvements on this branch are designed for existing single-store CloudCart deployments.

## Added in this change

- Eight standard content page drafts: About Us, Contact Us, FAQ, Shipping Policy, Returns & Refunds, Privacy Policy, Terms of Service, and Payment Policy.
- Drafts are created during new-store setup and when existing store owners open Page Builder. Existing pages with matching slugs are never replaced.
- Policy and customer-information drafts require merchant review and explicit publishing.
- Existing theme renderers now handle the full page section document instead of discarding all but rich text.
- Default and seven theme-kit storefronts include published legal/customer page links in their footers. Unpublished policy pages are never linked.
- Custom content pages can be created in Page Builder.
- Content-page preview now shows the actual draft; sitemap excludes unpublished pages.
- Added a store-page regression test.

## Before publicly launching a store

1. Review and complete every draft with actual merchant information and policies.
2. Publish verified pages in **Admin > Page Builder**.
3. Verify the storefront footer, mobile layout and content-page links.
4. Do not use unreviewed sample legal text in production.

## Verification

This commit was authored through the connected GitHub API. TypeScript compilation,
Vitest and local browser smoke tests have **not yet been executed in this session**.
Use the repository commands:

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run
```

No live Cloudflare resources were changed by these commits.
