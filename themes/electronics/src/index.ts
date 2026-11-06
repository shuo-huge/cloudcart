import { createTheme, type ThemeManifest } from "@cloudcart/theme-sdk";

const manifest: ThemeManifest = {
  id: "electronics",
  name: "Electronics",
  version: "1.1.0",
  previewImage: "/static/themes/electronics.svg",
  description: "Modern technology storefront with a deep charcoal interface, precise product presentation, cyan accents and compact mobile shopping controls.",
  supportedPages: ["home", "product", "collection", "search", "cart", "checkout", "page", "404"],
  supportedBlocks: ["announcement-bar", "hero", "image-banner", "product-grid", "featured-collection", "category-grid", "image-with-text", "rich-text", "video-embed", "testimonials", "faq", "trust-badges", "logo-list", "spacer", "divider", "newsletter", "custom-html"],
  designTokens: [
    { key: "accent", label: "Accent", type: "color", default: "#38e1ff", group: "Colors" },
    { key: "accentContrast", label: "Accent text", type: "color", default: "#001014", group: "Colors" },
    { key: "background", label: "Background", type: "color", default: "#0a0c10", group: "Colors" },
    { key: "text", label: "Text", type: "color", default: "#e8edf2", group: "Colors" },
    { key: "muted", label: "Muted", type: "color", default: "#8b97a5", group: "Colors" },
    { key: "surface", label: "Surface", type: "color", default: "#11161d", group: "Colors" },
    { key: "border", label: "Border", type: "color", default: "#232c36", group: "Colors" },
    { key: "headingFont", label: "Heading font", type: "font", default: "Arial Narrow, Helvetica Neue, sans-serif", group: "Typography" },
    { key: "radius", label: "Radius", type: "length", default: "4px", group: "Layout" },
    { key: "container", label: "Container", type: "length", default: "1320px", group: "Layout" },
  ],
};

const css = `
body { background: #0a0c10; }
h1, h2, h3, h4, .tk-card-title { text-transform: uppercase; }
.tk-header { background: #0d1218; border-bottom: 1px solid #232c36; }
.tk-brand { text-transform: uppercase; letter-spacing: .18em; font-size: 1.1rem; }
.tk-brand::before { content: ""; width: 8px; height: 8px; background: #38e1ff; box-shadow: 0 0 12px #38e1ff; display: inline-block; margin-right: 4px; }
.tk-nav { text-transform: uppercase; font-size: .72rem; letter-spacing: .14em; gap: 24px; color: #b7c3cf; }
.tk-actions { text-transform: uppercase; font-size: .68rem; letter-spacing: .12em; color: #b7c3cf; }
.tk-cart-count { background: #38e1ff; color: #001014; }
.tk-announcement { background: #38e1ff; color: #001014; font-weight: 700; }
.tk-hero--split { background: linear-gradient(120deg, #0a0c10 30%, #0f1a24 100%); border-bottom: 1px solid #232c36; }
.tk-hero--split .tk-hero-copy { padding: clamp(40px, 7vw, 96px) clamp(24px, 5vw, 70px); }
.tk-hero-copy h1 { letter-spacing: -.02em; }
.tk-hero-copy p { color: #9fb0bf; }
.tk-hero--split .tk-hero-media { position: relative; }
.tk-hero--split .tk-hero-media::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, #0a0c10 0%, transparent 35%); }
.tk-section { border-top: 1px solid #1a222b; }
.tk-section-heading { text-align: left; }
.tk-section-heading h2 { font-size: clamp(1.9rem, 3.6vw, 3rem); }
.tk-card-media { background: #0f151c; border: 1px solid #1d252e; border-radius: 4px; }
.tk-card-media img { object-fit: contain; padding: 14px; }
.tk-card--minimal .tk-card-media img { padding: 18px; }
.tk-card-title { font-size: .88rem; letter-spacing: .02em; }
.tk-card-price { color: #38e1ff; font-variant-numeric: tabular-nums; }
.tk-btn { border-radius: 3px; letter-spacing: .14em; text-transform: uppercase; font-size: .72rem; }
.tk-btn--ghost { border-color: #33414f; color: #dbe6ef; }
.tk-category-card { background: #11161d; border-color: #232c36; }
.tk-category-card:hover { border-color: #38e1ff; }
.tk-testimonial, .tk-newsletter, .tk-summary, .tk-radio, .tk-notice { background: #11161d; border-color: #232c36; }
.tk-field input, .tk-field select, .tk-field textarea, .tk-coupon input, .tk-toolbar input, .tk-toolbar select, .tk-newsletter input {
  background: #0d1218; color: #e8edf2; border-color: #2a3542; border-radius: 3px;
}
.tk-pdp-media-main { background: #0f151c; border: 1px solid #1d252e; }
.tk-pdp-media-main img { object-fit: contain; padding: 24px; }
.tk-pdp-info h1 { text-transform: uppercase; letter-spacing: .04em; }
.tk-pdp-price { color: #38e1ff; font-variant-numeric: tabular-nums; }
.tk-chip { border-radius: 2px; border-color: #2a3542; text-transform: uppercase; font-size: .68rem; letter-spacing: .08em; }
.tk-chip--active { background: #38e1ff; color: #001014; }
.tk-footer { background: #080a0d; border-top: 1px solid #232c36; }
.tk-breadcrumbs { color: #7f8b98; }
.tk-faq details, .tk-faq { border-color: #232c36; }
/* Electronics product-led finish */
.tk-header { background: #0d1218; }
.tk-hero--split { min-height: 600px; }
.tk-hero--split .tk-hero-copy h1 { font-size: clamp(2.8rem, 6vw, 5.2rem); }
.tk-card { padding: 0 0 12px; }
.tk-card-media { aspect-ratio: 1 / 1; }
.tk-card-media img { object-fit: contain; padding: clamp(14px, 2vw, 28px); }
.tk-card-body { padding: 12px 12px 0; }
.tk-card-price { font-weight: 700; }
.tk-pdp-media-main { aspect-ratio: 1 / 1; }
.tk-pdp-info { border: 1px solid #232c36; background: #10161e; padding: clamp(20px, 3vw, 32px); }
.tk-pdp-info .tk-btn { box-shadow: 0 0 0 1px rgba(56,225,255,.12), 0 10px 28px rgba(56,225,255,.08); }
.tk-mobile-buybar { background: #0d1218; border-color: #2b3947; }
.tk-mobile-buybar-copy span { color: #38e1ff; }
.tk-footer { background: #080a0d; }
@media (max-width: 760px) {
  .tk-hero--split { min-height: auto; }
  .tk-hero--split .tk-hero-media { aspect-ratio: 16 / 10; }
  .tk-pdp-info { padding: 20px 16px; }
  .tk-card-body { padding-inline: 2px; }
}

`;

export const theme = createTheme({
  manifest,
  css,
  header: "split",
  hero: "split",
  card: "minimal",
  columns: 4,
  productLayout: "split",
  collectionLayout: "sidebar",
  footer: "columns",
});

export default theme;
