---
title: Theme development
description: Create, register and test a CloudCart theme.
---

Themes are bundled at build time. The admin can only switch themes and change design variables; theme code cannot be uploaded at runtime.

## Directory structure

```text
themes/example/
  theme.json        # legacy metadata (runtime uses src/index.ts)
  package.json
  src/index.ts      # runtime ThemeDefinition
```

## ThemeDefinition

```ts
interface ThemeDefinition {
  manifest: ThemeManifest;
  css: string;
  renderHome(ctx, data): string;
  renderProduct(ctx, data): string;
  renderCollection(ctx, data): string;
  renderCart(ctx, data): string;
  renderCheckout(ctx, data): string;
  renderContent(ctx, data): string;
  renderNotFound?(ctx): string;
}
```

## Registering a theme

1. Create a package under `themes/`
2. Import and register it in `apps/worker/src/theme-registry.ts`
3. Add it as a dependency in `apps/worker/package.json`
4. Rebuild and deploy

## Design variables

`manifest.designTokens` defines configurable colours, fonts, spacing and so on. Theme settings in the admin are written to `theme_settings` and exposed as CSS variables at render time.

## Preview images

Preview images come from:

```text
apps/storefront/public/themes/theme-previews-atlas.webp
```

The admin crops a 4×2 atlas using CSS `background-position`. When adding a theme, update the atlas and `admin.css` at the same time.

## Theme capabilities

- Home, product, collection, search, cart, checkout, content pages and 404
- Header, footer and mobile menu
- Product cards and the product detail gallery
- Cart and order summary
- Page editor block rendering

All themes share the data model in `packages/theme-sdk/src/types.ts`.

## Testing

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

Vitest verifies that the storefront markup changes when the theme changes while product data stays the same; Playwright covers the theme preview dialog and responsive layouts.

## Development guidelines

- Do not query D1 directly from a theme
- Use `escapeHtml` / `escapeAttr` for all dynamic values
- Do not inject unsanitised HTML
- Keep mobile first
- Theme CSS must not depend on external CDNs
