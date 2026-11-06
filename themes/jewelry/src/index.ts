import { createTheme, type ThemeManifest } from "@cloudcart/theme-sdk";

const manifest: ThemeManifest = {
  id: "jewelry",
  name: "Jewelry",
  version: "1.1.0",
  previewImage: "/static/themes/jewelry.svg",
  description: "Quiet luxury jewelry storefront with ivory surfaces, gold details, elegant typography and a refined mobile browsing experience.",
  supportedPages: ["home", "product", "collection", "search", "cart", "checkout", "page", "404"],
  supportedBlocks: ["announcement-bar", "hero", "image-banner", "product-grid", "featured-collection", "category-grid", "image-with-text", "rich-text", "video-embed", "testimonials", "faq", "trust-badges", "logo-list", "spacer", "divider", "newsletter", "custom-html"],
  designTokens: [
    { key: "accent", label: "Gold accent", type: "color", default: "#a5844e", group: "Colors" },
    { key: "accentContrast", label: "Accent text", type: "color", default: "#ffffff", group: "Colors" },
    { key: "background", label: "Background", type: "color", default: "#fbf9f4", group: "Colors" },
    { key: "text", label: "Text", type: "color", default: "#1c1a17", group: "Colors" },
    { key: "muted", label: "Muted", type: "color", default: "#7c7468", group: "Colors" },
    { key: "surface", label: "Surface", type: "color", default: "#ffffff", group: "Colors" },
    { key: "border", label: "Border", type: "color", default: "#e7dfd1", group: "Colors" },
    { key: "headingFont", label: "Heading font", type: "font", default: "Optima, Palatino Linotype, Georgia, serif", group: "Typography" },
    { key: "radius", label: "Radius", type: "length", default: "0px", group: "Layout" },
    { key: "container", label: "Container", type: "length", default: "1100px", group: "Layout" },
  ],
};

const css = `
.tk-header { border-bottom: 1px solid #e7dfd1; background: #fbf9f4; }
.tk-header--centered .tk-header-inner { padding: 26px 0 16px; min-height: auto; }
.tk-brand { font-size: 1.75rem; letter-spacing: .28em; text-transform: uppercase; }
.tk-nav { text-transform: uppercase; font-size: .68rem; letter-spacing: .22em; gap: 30px; color: #5f584e; }
.tk-actions { text-transform: uppercase; font-size: .66rem; letter-spacing: .18em; }
.tk-announcement { background: #1c1a17; color: #f3ecdf; font-size: .68rem; letter-spacing: .22em; }
.tk-hero--full { min-height: clamp(420px, 62vh, 640px); }
.tk-hero-copy h1 { font-size: clamp(2.4rem, 5.5vw, 4.6rem); letter-spacing: .06em; }
.tk-hero-copy p { letter-spacing: .18em; text-transform: uppercase; font-size: .72rem; }
.tk-hero--full .tk-hero-copy { border: 1px solid rgba(255,255,255,.45); padding: clamp(34px, 6vw, 64px); backdrop-filter: blur(2px); }
.tk-section { border-top: 1px solid #e7dfd1; }
.tk-section-heading h2 { font-size: clamp(1.7rem, 3.2vw, 2.6rem); letter-spacing: .08em; }
.tk-section-heading p { letter-spacing: .16em; text-transform: uppercase; font-size: .68rem; }
.tk-card-media { background: #f3eee4; }
.tk-card-title { font-size: .82rem; letter-spacing: .12em; text-transform: uppercase; }
.tk-card-price { color: #a5844e; letter-spacing: .06em; }
.tk-btn { background: #1c1a17; border-color: #1c1a17; letter-spacing: .2em; font-size: .68rem; }
.tk-btn--ghost { background: transparent; color: #1c1a17; border-color: #a5844e; }
.tk-category-card { border-color: #e7dfd1; background: #fffdf8; }
.tk-category-card h3 { letter-spacing: .14em; text-transform: uppercase; font-size: .9rem; }
.tk-pdp { grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr); }
.tk-pdp-info { position: sticky; top: 120px; align-self: start; }
.tk-pdp-info h1 { letter-spacing: .08em; font-size: clamp(1.8rem, 3vw, 2.6rem); }
.tk-pdp-price { color: #a5844e; letter-spacing: .06em; }
.tk-description { border-top-color: #a5844e; }
.tk-footer { border-top: 1px solid #a5844e; }
.tk-footer--minimal .tk-brand { letter-spacing: .3em; }
.tk-faq details, .tk-faq { border-color: #e7dfd1; }
.tk-chip { border-radius: 0; border-color: #d8cfbe; text-transform: uppercase; letter-spacing: .12em; font-size: .66rem; }
.tk-chip--active { background: #1c1a17; border-color: #1c1a17; }
/* Fine jewelry luxury finish */
.tk-header { background: #fbf9f4; }
.tk-brand { letter-spacing: .24em; }
.tk-hero--full { min-height: clamp(500px, 68vh, 720px); }
.tk-hero--full .tk-hero-copy { max-width: 680px; outline: 1px solid rgba(255,255,255,.4); outline-offset: 8px; }
.tk-section-heading { margin-bottom: 42px; }
.tk-card-media { background: #f3eee4; }
.tk-card-title { letter-spacing: .14em; }
.tk-card-price { color: #a5844e; }
.tk-pdp-media-main { background: #f5f1e9; }
.tk-pdp-info { padding-top: 24px; }
.tk-pdp-info .tk-btn { min-height: 54px; }
.tk-mobile-buybar { background: #fbf9f4; border-color: #d8c8a9; }
.tk-footer { background: #f5f1e9; }
@media (max-width: 760px) {
  .tk-hero--full { min-height: 66svh; min-height: 66vh; }
  .tk-hero--full .tk-hero-copy { outline-offset: 4px; padding: 26px 20px; }
  .tk-section-heading { margin-bottom: 24px; }
  .tk-pdp-info { padding-top: 0; }
}

@media (max-width: 760px) {
  .tk-header--centered .tk-header-inner { min-height: 66px; padding: 8px 0; }
  .tk-brand { font-size: 1.18rem; letter-spacing: .12em; }
  .tk-pdp { grid-template-columns: minmax(0, 1fr); }
  .tk-pdp-info { position: static; top: auto; }
}

`;

export const theme = createTheme({
  manifest,
  css,
  header: "centered",
  hero: "full",
  card: "portrait",
  columns: 3,
  productLayout: "editorial",
  collectionLayout: "editorial",
  footer: "minimal",
});

export default theme;
