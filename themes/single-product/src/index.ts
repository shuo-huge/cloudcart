import { createTheme, type ThemeManifest } from "@cloudcart/theme-sdk";

const manifest: ThemeManifest = {
  id: "single-product",
  name: "Single Product",
  version: "1.1.0",
  previewImage: "/static/themes/single-product.svg",
  description: "Conversion-focused single-product storefront with a bold campaign hero, focused product story, persistent mobile purchase action and clear trust-building sections.",
  supportedPages: ["home", "product", "collection", "search", "cart", "checkout", "page", "404"],
  supportedBlocks: ["announcement-bar", "hero", "image-banner", "product-grid", "featured-collection", "category-grid", "image-with-text", "rich-text", "video-embed", "testimonials", "faq", "trust-badges", "logo-list", "spacer", "divider", "newsletter", "custom-html"],
  designTokens: [
    { key: "accent", label: "Accent", type: "color", default: "#111111", group: "Colors" },
    { key: "background", label: "Background", type: "color", default: "#ffffff", group: "Colors" },
    { key: "text", label: "Text", type: "color", default: "#101010", group: "Colors" },
    { key: "muted", label: "Muted", type: "color", default: "#777777", group: "Colors" },
    { key: "surface", label: "Surface", type: "color", default: "#fafafa", group: "Colors" },
    { key: "border", label: "Border", type: "color", default: "#e8e8e8", group: "Colors" },
    { key: "headingFont", label: "Heading font", type: "font", default: "Helvetica Neue, Arial, sans-serif", group: "Typography" },
    { key: "radius", label: "Radius", type: "length", default: "0px", group: "Layout" },
    { key: "container", label: "Container", type: "length", default: "1000px", group: "Layout" },
  ],
};

const css = `
body { background: #fff; }
.tk-header { border-bottom: 1px solid #eee; }
.tk-header--minimal .tk-header-inner { min-height: 70px; }
.tk-brand { font-size: 1rem; letter-spacing: .2em; text-transform: uppercase; }
.tk-actions { font-size: .68rem; letter-spacing: .16em; }
.tk-hero--minimal { padding: clamp(90px, 16vw, 210px) 0 clamp(60px, 10vw, 120px); border-bottom: 0; }
.tk-hero--minimal h1 { font-size: clamp(3.2rem, 11vw, 9rem); font-weight: 600; letter-spacing: -.055em; line-height: .92; max-width: 12ch; margin-inline: auto; }
.tk-hero--minimal p { color: #6e6e6e; font-size: 1rem; max-width: 44ch; margin-inline: auto; }
.tk-btn { background: #111; border-color: #111; letter-spacing: .18em; font-size: .68rem; }
.tk-section { padding: clamp(50px, 9vw, 110px) 0; }
.tk-section-heading { text-align: left; }
.tk-section-heading h2 { font-size: clamp(1.7rem, 3.4vw, 2.5rem); letter-spacing: -.03em; }
.tk-card--minimal .tk-card-media { aspect-ratio: 1; background: #f5f5f5; }
.tk-card--minimal .tk-card-media img { object-fit: cover; }
.tk-card-title { font-size: .92rem; font-weight: 500; }
.tk-card-price { color: #6e6e6e; }
.tk-pdp--stacked { max-width: 780px; margin-inline: auto; }
.tk-pdp-media-main { aspect-ratio: 1; background: #f5f5f5; }
.tk-pdp-info h1 { font-size: clamp(2rem, 5vw, 3.4rem); letter-spacing: -.04em; }
.tk-pdp-info { padding-top: 10px; }
.tk-description { color: #6e6e6e; line-height: 1.8; }
.tk-summary { background: #fafafa; border-color: #eee; }
.tk-newsletter { background: #fafafa; border-color: #eee; }
.tk-testimonial { background: #fafafa; border-color: #eee; }
.tk-footer { border-top: 1px solid #eee; }
.tk-footer--minimal .tk-brand { letter-spacing: .24em; font-size: .9rem; }
.tk-chip { border-color: #ddd; font-size: .7rem; }
.tk-chip--active { background: #111; border-color: #111; }
.tk-category-card { background: #fafafa; border-color: #eee; }
/* Single-product conversion landing page finish */
.tk-header { background: #fff; }
.tk-hero--minimal { padding-block: clamp(76px, 13vw, 160px); }
.tk-hero--minimal h1 { max-width: 11ch; text-wrap: balance; }
.tk-hero--minimal .tk-btn { min-height: 54px; padding-inline: 34px; }
.tk-section-heading { max-width: 760px; }
.tk-pdp--stacked { max-width: 980px; }
.tk-pdp--stacked .tk-pdp-media-main { aspect-ratio: 5 / 4; }
.tk-pdp--stacked .tk-pdp-info { max-width: 620px; margin-inline: auto; }
.tk-pdp-info h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); }
.tk-pdp-info .tk-btn { min-height: 58px; font-size: .76rem; }
.tk-trust { max-width: 980px; margin-inline: auto; }
.tk-testimonials { max-width: 1100px; margin-inline: auto; }
.tk-mobile-buybar { background: #fff; box-shadow: 0 -12px 34px rgba(0,0,0,.12); }
.tk-mobile-buybar .tk-btn { min-height: 50px; }
.tk-footer { background: #fafafa; }
@media (max-width: 760px) {
  .tk-hero--minimal { padding-block: 70px 48px; }
  .tk-hero--minimal h1 { font-size: clamp(2.8rem, 14vw, 4.5rem); }
  .tk-pdp--stacked .tk-pdp-media-main { aspect-ratio: 1 / 1; }
  .tk-pdp--stacked .tk-pdp-info { max-width: none; }
}

`;

export const theme = createTheme({
  manifest,
  css,
  header: "minimal",
  hero: "minimal",
  card: "minimal",
  columns: 2,
  productLayout: "stacked",
  collectionLayout: "editorial",
  footer: "minimal",
});

export default theme;
