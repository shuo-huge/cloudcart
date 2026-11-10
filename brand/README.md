# CloudCart brand icons

`icon.svg` is the master artwork. The other SVG and PNG/ICO files are generated
from it so every surface (storefront, admin, docs, browser tabs, iOS home
screen) uses the same mark.

| File | Use |
|---|---|
| `icon.svg` | Rounded tile master; docs logo and SVG favicon |
| `icon-cream.svg` | Cream tile variant for dark UI (admin sidebar/login) |
| `icon-square.svg` | Full-bleed square for Apple touch icons |
| `icon-maskable.svg` | Full-bleed square with a safe-zone inset for Android |
| `favicon.ico` | Legacy browsers; bundles 16/32/48 px |
| `favicon.svg` | Modern browser tab icon |
| `favicon-16.png`, `favicon-32.png` | PNG tab icons |
| `apple-touch-icon.png` | 180×180 iOS home screen icon |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | App/PWA icons |

## Regenerating

```bash
pnpm icons
```

This uses the Playwright Chromium already required for E2E tests, renders the
SVG at each exact size, writes the PNG/ICO files, and syncs the docs site's
`public/` copies. Commit the generated files afterwards.

The regular `pnpm build` only copies the committed files to `dist/` via
`scripts/prepare-brand.mjs`; it does not require a browser.
