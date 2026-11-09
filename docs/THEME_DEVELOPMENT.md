# Theme Development

Themes are bundled at build time. The admin can activate a bundled theme and change its design
tokens; it cannot upload or execute theme JavaScript at runtime.

## 1. Layout

```
themes/example/
  theme.json        legacy metadata copy (not loaded at runtime)
  package.json
  src/index.ts      runtime ThemeDefinition, including manifest.previewImage
```

`themes/*/src/index.ts` is the authoritative manifest. `theme.json` is kept for documentation and
tooling and is not imported by the Worker. Update both when changing preview metadata.

Preview images are cropped from one 4×2 WebP atlas at
`apps/storefront/public/themes/theme-previews-atlas.webp`; `apps/admin/src/admin.css` uses
`background-position` per theme id. The admin opens a full-size modal with the same atlas tile.

## 2. ThemeDefinition

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

All methods return body HTML. Core’s `renderDocument` adds `<head>` metadata, JSON-LD, token CSS,
theme CSS and the hashed script/stylesheet.

## 3. Use the Theme Kit (recommended)

`createTheme` in `@cloudcart/theme-sdk` provides a complete accessible storefront with structural
variants:

```ts
import { createTheme, type ThemeManifest } from "@cloudcart/theme-sdk";

export const theme = createTheme({
  manifest,
  css: ".tk-brand { letter-spacing: .2em; }",
  header: "centered",      // split | centered | minimal
  hero: "offset",          // full | split | offset | minimal | stacked
  card: "tall",            // tall | portrait | wide | minimal | overlay
  columns: 3,              // 2 | 3 | 4
  productLayout: "editorial", // split | stacked | editorial
  collectionLayout: "sidebar", // toolbar | sidebar | editorial
  footer: "statement",     // columns | minimal | statement
});
```

The kit exposes CSS variables (`--tk-bg`, `--tk-text`, `--tk-accent`, `--tk-font`,
`--tk-heading-font`, `--tk-radius`, `--tk-container`, …). Theme CSS overrides them and adds
brand-specific rules; structural differences come from the variants above, not only colour swaps.

### Responsive storefront baseline

Every theme created with `createTheme` receives the shared responsive layer before its own CSS.
The Default theme has the equivalent baseline in its own stylesheet. Theme-specific CSS should
refine the brand at each breakpoint rather than reimplement the core layout.

The shared baseline includes:
- accessible skip link and a touch-sized mobile navigation drawer;
- compact mobile header that preserves the brand, menu and cart entry points;
- two-column mobile product grids, horizontally scrollable collection chips and touch-friendly
  filter/search controls;
- responsive product galleries with selectable thumbnails and swipeable thumbnail rails;
- a sticky mobile add-to-cart bar after the primary product CTA scrolls out of view;
- a sticky mobile checkout action on non-empty carts;
- safe-area insets, visible keyboard focus, reduced-motion support and 44–52px primary controls.

Keep desktop and mobile navigation labels identical, use semantic buttons for gallery controls,
and avoid fixed-width content that can cause horizontal overflow at 320px.

## 4. Design tokens

Manifest tokens are editable in the admin and emitted as `--t-<key>` on `:root` (values are
sanitised, no `;{}<>`). Token types: `color`, `font`, `length`, `number`, `select`.

## 5. Supported blocks

The page builder’s block types: announcement bar, hero, image banner, product grid, featured
collection, category grid, image with text, rich text, video embed, testimonials, FAQ, trust badges,
logo list, newsletter, spacer, divider, custom HTML.

Each block reads `section.settings`:
- text/URLs are escaped;
- rich text / custom HTML pass through the allow-list sanitiser;
- video embeds accept only YouTube/Vimeo URLs;
- presentation settings are applied by `frameSection` (allow-listed colours, numeric spacing,
  alignment, max-width, font).

## 6. Register a theme

1. Add the package dependency to `apps/worker`.
2. Import and `register(...)` it in `apps/worker/src/theme-registry.ts`.
3. Rebuild/deploy.
4. The dark “not in build” badges disappear; the theme can be activated.

Theme rows are upserted from bundled definitions when the admin opens the Themes screen.

## 7. Adding a block

1. Extend `BLOCK_TYPES` in `packages/theme-sdk/src/manifest.ts`.
2. Add a renderer in the kit and in the default theme.
3. Add the field schema to `apps/admin/src/editor/blocks.ts`.
4. Page JSON remains validated by `packages/core/src/pages.ts`.

## 8. Bundled themes

1. **Default** — warm editorial, offset hero, serif headings.
2. **Fashion** — oversized uppercase type, hairline rules, offset imagery, statement footer.
3. **Beauty** — blush palette, centred header, rounded imagery, split hero.
4. **Electronics** — dark technical, cyan accents, condensed uppercase, image-overlay-free minimal
   cards, sidebar filters.
5. **Jewelry** — ivory and gold, centred wordmark, full-bleed hero, editorial product page.
6. **Home** — warm natural palette, stacked story hero, wide cards.
7. **Sports** — black/safety-yellow, condensed uppercase, overlay cards, thick rules, statement footer.
8. **Single Product** — minimal monochrome, type-only hero, square imagery, narrow measure.

The Vitest suite activates several themes and verifies distinct markup plus unchanged catalog data
after switching. Playwright covers the theme gallery preview modal and the responsive admin layout.
