import { createTheme, type ThemeManifest } from "@cloudcart/theme-sdk";

const manifest: ThemeManifest = {
  id: "beauty",
  name: "Beauty",
  version: "1.0.0",
  previewImage: "/static/themes/beauty.svg",
  description: "A soft blush palette, rounded imagery and a centred header for skincare and cosmetics.",
  supportedPages: ["home", "product", "collection", "search", "cart", "checkout", "page", "404"],
  supportedBlocks: ["announcement-bar", "hero", "image-banner", "product-grid", "featured-collection", "category-grid", "image-with-text", "rich-text", "video-embed", "testimonials", "faq", "trust-badges", "logo-list", "spacer", "divider", "newsletter", "custom-html"],
  designTokens: [
    { key: "accent", label: "Accent", type: "color", default: "#c26b7a", group: "Colors" },
    { key: "accentContrast", label: "Accent text", type: "color", default: "#ffffff", group: "Colors" },
    { key: "background", label: "Background", type: "color", default: "#fff7f5", group: "Colors" },
    { key: "text", label: "Text", type: "color", default: "#3a2a2a", group: "Colors" },
    { key: "muted", label: "Muted", type: "color", default: "#8a6f6c", group: "Colors" },
    { key: "surface", label: "Surface", type: "color", default: "#ffffff", group: "Colors" },
    { key: "border", label: "Border", type: "color", default: "#f0d8d5", group: "Colors" },
    { key: "headingFont", label: "Heading font", type: "font", default: "Cormorant Garamond, Georgia, serif", group: "Typography" },
    { key: "radius", label: "Radius", type: "length", default: "18px", group: "Layout" },
    { key: "container", label: "Container", type: "length", default: "1180px", group: "Layout" },
  ],
};

const css = `
body { background: radial-gradient(circle at 12% 8%, #fff 0%, #fff7f5 42%, #fdeeec 100%); }
.tk-header { background: rgba(255, 247, 245, .92); backdrop-filter: blur(8px); border-bottom: 1px solid #f0d8d5; }
.tk-header--centered .tk-header-inner { min-height: auto; padding: 22px 0 14px; }
.tk-brand { font-size: 1.9rem; letter-spacing: .02em; }
.tk-nav { font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; gap: 26px; }
.tk-btn { border-radius: 999px; letter-spacing: .12em; box-shadow: 0 8px 22px rgba(194, 107, 122, .18); }
.tk-btn--ghost { box-shadow: none; }
.tk-hero--split { background: linear-gradient(120deg, #fff 0%, #ffeceb 100%); }
.tk-hero--split .tk-hero-copy { padding: clamp(40px, 7vw, 100px); }
.tk-hero--split .tk-hero-media img { border-radius: 0 0 0 42%; }
.tk-section-heading h2 { font-style: italic; font-weight: 400; }
.tk-card-media { border-radius: 22px; box-shadow: 0 12px 30px rgba(58, 42, 42, .06); }
.tk-card-title { font-family: var(--tk-heading-font); font-size: 1.12rem; }
.tk-card-price { color: var(--tk-muted); }
.tk-category-card { border-radius: 22px; background: linear-gradient(160deg, #fff, #ffeceb); border-color: #f6e3e0; min-height: 210px; }
.tk-testimonial { border-radius: 22px; border-color: #f3dfdc; }
.tk-newsletter { border-radius: 28px; background: linear-gradient(135deg, #fff, #ffeceb); border-color: #f3dfdc; }
.tk-newsletter input { border-radius: 999px; }
.tk-pdp--stacked .tk-pdp-info { margin-inline: auto; }
.tk-pdp-media-main { border-radius: 26px; }
.tk-pdp-info h1 { font-style: italic; font-weight: 400; }
.tk-summary { border-radius: 18px; box-shadow: 0 14px 34px rgba(58,42,42,.06); }
.tk-field input, .tk-field select, .tk-field textarea { border-radius: 12px; }
.tk-footer { border-top-color: #f0d8d5; background: #fffaf9; }
`;

export const theme = createTheme({
  manifest,
  css,
  header: "centered",
  hero: "split",
  card: "portrait",
  columns: 3,
  productLayout: "stacked",
  collectionLayout: "toolbar",
  footer: "columns",
});

export default theme;
