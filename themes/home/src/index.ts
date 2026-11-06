import { createTheme, type ThemeManifest } from "@cloudcart/theme-sdk";

const manifest: ThemeManifest = {
  id: "home",
  name: "Home",
  version: "1.1.0",
  previewImage: "/static/themes/theme-previews-atlas.webp",
  description: "Warm lifestyle and homeware storefront with tactile neutral colors, spacious room imagery, calm editorial sections and effortless mobile browsing.",
  supportedPages: ["home", "product", "collection", "search", "cart", "checkout", "page", "404"],
  supportedBlocks: ["announcement-bar", "hero", "image-banner", "product-grid", "featured-collection", "category-grid", "image-with-text", "rich-text", "video-embed", "testimonials", "faq", "trust-badges", "logo-list", "spacer", "divider", "newsletter", "custom-html"],
  designTokens: [
    { key: "accent", label: "Terracotta", type: "color", default: "#8c5a3c", group: "Colors" },
    { key: "accentContrast", label: "Accent text", type: "color", default: "#ffffff", group: "Colors" },
    { key: "background", label: "Background", type: "color", default: "#f5f1ea", group: "Colors" },
    { key: "text", label: "Text", type: "color", default: "#2c2823", group: "Colors" },
    { key: "muted", label: "Muted", type: "color", default: "#7a7166", group: "Colors" },
    { key: "surface", label: "Surface", type: "color", default: "#fffdf9", group: "Colors" },
    { key: "border", label: "Border", type: "color", default: "#ddd4c6", group: "Colors" },
    { key: "headingFont", label: "Heading font", type: "font", default: "Georgia, Times New Roman, serif", group: "Typography" },
    { key: "radius", label: "Radius", type: "length", default: "2px", group: "Layout" },
    { key: "container", label: "Container", type: "length", default: "1250px", group: "Layout" },
  ],
};

const css = `
body { background: #f5f1ea; background-image: radial-gradient(#e9e1d4 0.6px, transparent 0.6px); background-size: 22px 22px; }
.tk-header { background: #f5f1ea; border-bottom: 1px solid #ddd4c6; }
.tk-brand { font-size: 1.6rem; }
.tk-nav { font-variant: small-caps; letter-spacing: .1em; gap: 24px; }
.tk-actions { font-variant: small-caps; letter-spacing: .1em; font-size: .8rem; }
.tk-announcement { background: #2c2823; color: #f5f1ea; text-transform: none; letter-spacing: .04em; }
.tk-hero--stacked .tk-hero-media { aspect-ratio: 21 / 9; border-radius: 2px; }
.tk-hero--stacked .tk-hero-copy { padding: 42px 0 4px; }
.tk-hero--stacked h1 { font-size: clamp(2.4rem, 5vw, 4.2rem); font-weight: 400; }
.tk-hero--stacked p { color: #6d655b; font-size: 1.05rem; }
.tk-section { padding: clamp(46px, 8vw, 100px) 0; }
.tk-section-heading { text-align: center; }
.tk-section-heading h2 { font-weight: 400; font-style: italic; font-size: clamp(1.7rem, 3.4vw, 2.7rem); }
.tk-card--wide .tk-card-media { aspect-ratio: 5 / 4; }
.tk-card-media { background: #e8e0d3; }
.tk-card-title { font-family: var(--tk-heading-font); font-size: 1.05rem; }
.tk-card-price { color: #6d655b; }
.tk-btn { background: #8c5a3c; border-color: #8c5a3c; text-transform: none; letter-spacing: .04em; font-size: .84rem; }
.tk-btn--ghost { color: #8c5a3c; }
.tk-category-card { background: #fffdf9; border-color: #ddd4c6; min-height: 210px; }
.tk-category-card h3 { font-size: 1.3rem; }
.tk-image-text { gap: clamp(30px, 7vw, 90px); }
.tk-image-text-media { border-radius: 2px; }
.tk-pdp { gap: clamp(30px, 6vw, 80px); }
.tk-pdp-info h1 { font-weight: 400; }
.tk-description { color: #5f584e; line-height: 1.8; }
.tk-summary, .tk-newsletter, .tk-testimonial { background: #fffdf9; border-color: #ddd4c6; }
.tk-footer { background: #ede7dc; border-top: 1px solid #ddd4c6; }
.tk-footer h3 { font-variant: small-caps; letter-spacing: .14em; }
.tk-chip { border-radius: 2px; background: #fffdf9; border-color: #d8cebe; }
.tk-chip--active { background: #8c5a3c; border-color: #8c5a3c; }
.tk-field input, .tk-field select, .tk-field textarea { background: #fffdf9; }
/* Home & living lifestyle finish */
.tk-header { background: #f5f1ea; }
.tk-hero--stacked .tk-hero-media { aspect-ratio: 21 / 9; }
.tk-hero--stacked .tk-hero-copy { max-width: 760px; }
.tk-hero--stacked .tk-hero-copy h1 { font-size: clamp(2.6rem, 5.5vw, 4.8rem); }
.tk-card-media { background: #e8e0d3; }
.tk-card--wide .tk-card-media { aspect-ratio: 5 / 4; }
.tk-card-title { font-family: var(--tk-heading-font); font-size: 1.04rem; }
.tk-category-card { box-shadow: 0 8px 24px rgba(70,54,39,.045); }
.tk-pdp-media-main { background: #eae4d9; }
.tk-pdp-info { padding-top: 14px; }
.tk-newsletter { box-shadow: 0 12px 30px rgba(70,54,39,.04); }
.tk-footer { background: #ede7dc; }
@media (max-width: 760px) {
  .tk-hero--stacked .tk-hero-media { aspect-ratio: 4 / 3; }
  .tk-hero--stacked .tk-hero-copy h1 { font-size: clamp(2.2rem, 9vw, 3.5rem); }
  .tk-pdp-info { padding-top: 0; }
}

`;

export const theme = createTheme({
  manifest,
  css,
  header: "split",
  hero: "stacked",
  card: "wide",
  columns: 3,
  productLayout: "split",
  collectionLayout: "toolbar",
  footer: "columns",
});

export default theme;
