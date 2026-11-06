import { createTheme, type ThemeManifest } from "@cloudcart/theme-sdk";

const manifest: ThemeManifest = {
  id: "fashion",
  name: "Fashion",
  version: "1.1.0",
  previewImage: "/static/themes/fashion.svg",
  description: "Editorial fashion storefront with oversized typography, full-bleed campaign imagery, refined product grids and a mobile-first shopping flow.",
  supportedPages: ["home", "product", "collection", "search", "cart", "checkout", "page", "404"],
  supportedBlocks: ["announcement-bar", "hero", "image-banner", "product-grid", "featured-collection", "category-grid", "image-with-text", "rich-text", "video-embed", "testimonials", "faq", "trust-badges", "logo-list", "spacer", "divider", "newsletter", "custom-html"],
  designTokens: [
    { key: "accent", label: "Accent", type: "color", default: "#17130f", group: "Colors" },
    { key: "background", label: "Background", type: "color", default: "#f5f0e8", group: "Colors" },
    { key: "text", label: "Text", type: "color", default: "#17130f", group: "Colors" },
    { key: "muted", label: "Muted", type: "color", default: "#7b7268", group: "Colors" },
    { key: "surface", label: "Surface", type: "color", default: "#fbf8f2", group: "Colors" },
    { key: "border", label: "Border", type: "color", default: "#dcd3c4", group: "Colors" },
    { key: "font", label: "Body font", type: "font", default: "Helvetica Neue, Arial, sans-serif", group: "Typography" },
    { key: "headingFont", label: "Heading font", type: "font", default: "Didot, Bodoni MT, Georgia, serif", group: "Typography" },
    { key: "radius", label: "Radius", type: "length", default: "0px", group: "Layout" },
    { key: "container", label: "Container", type: "length", default: "1280px", group: "Layout" },
  ],
};

const css = `
.tk-header { border-bottom: 1px solid #1c1813; background: #f5f0e8; }
.tk-header-inner { min-height: 86px; }
.tk-brand { font-size: 1.7rem; letter-spacing: .12em; text-transform: uppercase; }
.tk-nav { text-transform: uppercase; font-size: .72rem; letter-spacing: .16em; gap: 26px; }
.tk-actions { text-transform: uppercase; font-size: .68rem; letter-spacing: .16em; }
.tk-hero--offset { min-height: 680px; }
.tk-hero--offset .tk-hero-copy { max-width: 560px; margin: clamp(30px, 7vw, 96px); padding: clamp(28px, 5vw, 64px); border: 1px solid #1c1813; }
.tk-hero--offset h1 { font-size: clamp(2.8rem, 6vw, 5.2rem); text-transform: uppercase; letter-spacing: .01em; }
.tk-hero-copy p { font-size: .84rem; letter-spacing: .12em; text-transform: uppercase; }
.tk-section { border-top: 1px solid #dcd3c4; }
.tk-section-heading { text-align: left; display: flex; justify-content: space-between; align-items: baseline; gap: 20px; }
.tk-section-heading h2 { font-size: clamp(1.8rem, 4vw, 3rem); text-transform: uppercase; letter-spacing: .04em; }
.tk-section-heading p { text-transform: uppercase; font-size: .72rem; letter-spacing: .14em; }
.tk-card-title { font-size: .78rem; text-transform: uppercase; letter-spacing: .1em; }
.tk-card-price { font-size: .82rem; }
.tk-card-media { background: #eae3d7; }
.tk-card:hover .tk-card-media img { transform: scale(1.02); }
.tk-btn { border-radius: 0; letter-spacing: .16em; font-size: .72rem; }
.tk-pdp { grid-template-columns: minmax(0, 1.35fr) minmax(0, .65fr); }
.tk-pdp--editorial .tk-pdp-info { position: sticky; top: 110px; align-self: start; }
.tk-pdp-info h1 { text-transform: uppercase; letter-spacing: .03em; }
.tk-pdp-info h1 { font-size: clamp(2rem, 3.6vw, 3.2rem); }
.tk-description { font-size: .9rem; line-height: 1.8; }
.tk-collection--sidebar { grid-template-columns: 1fr; }
.tk-collection { border-top: 0; }
.tk-chip { border-radius: 0; text-transform: uppercase; letter-spacing: .08em; font-size: .68rem; }
.tk-footer { border-top: 1px solid #1c1813; }
.tk-footer-brand { font-size: clamp(2.6rem, 8vw, 6rem); text-transform: uppercase; letter-spacing: .02em; }
.tk-footer h3 { letter-spacing: .18em; }
@media (max-width: 760px) { .tk-hero--offset .tk-hero-copy { border: 0; } }
/* Fashion house editorial finish */
.tk-header { background: #f5f0e8; border-bottom-color: #cfc5b7; }
.tk-brand { letter-spacing: .14em; }
.tk-hero--offset { min-height: min(72vw, 760px); }
.tk-hero--offset .tk-hero-copy { box-shadow: 12px 12px 0 rgba(23,19,15,.06); }
.tk-section-heading h2 { font-weight: 500; }
.tk-card-media { background: #e8e0d4; }
.tk-card-body { padding-top: 13px; }
.tk-card-title { line-height: 1.45; }
.tk-card-price { letter-spacing: .04em; }
.tk-pdp-media-main { background: #eee8de; }
.tk-pdp-thumb.is-active { outline-color: #17130f; }
.tk-footer { background: #eee8de; }
@media (max-width: 760px) {
  .tk-hero--offset { min-height: auto; }
  .tk-hero--offset .tk-hero-copy { box-shadow: 6px 6px 0 rgba(23,19,15,.06); }
  .tk-section-heading { align-items: flex-start; }
  .tk-footer { padding-top: 36px; }
}

@media (max-width: 760px) {
  .tk-header-inner { min-height: 66px; }
  .tk-brand { font-size: 1.08rem; letter-spacing: .07em; }
  .tk-hero--offset { min-height: auto; }
  .tk-hero--offset .tk-hero-copy { margin: -28px 16px 0; padding: 24px 20px; }
  .tk-pdp { grid-template-columns: minmax(0, 1fr); }
  .tk-pdp--editorial .tk-pdp-info { position: static; top: auto; padding-top: 0; }
}

`;

export const theme = createTheme({
  manifest,
  css,
  header: "split",
  hero: "offset",
  card: "tall",
  columns: 3,
  productLayout: "editorial",
  collectionLayout: "editorial",
  footer: "statement",
});

export default theme;
