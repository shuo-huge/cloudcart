import { createTheme, type ThemeManifest } from "@cloudcart/theme-sdk";

const manifest: ThemeManifest = {
  id: "sports",
  name: "Sports",
  version: "1.0.0",
  previewImage: "/static/themes/sports.svg",
  description: "High-impact athletics: black and safety yellow, condensed uppercase type and image-overlay product cards.",
  supportedPages: ["home", "product", "collection", "search", "cart", "checkout", "page", "404"],
  supportedBlocks: ["announcement-bar", "hero", "image-banner", "product-grid", "featured-collection", "category-grid", "image-with-text", "rich-text", "video-embed", "testimonials", "faq", "trust-badges", "logo-list", "spacer", "divider", "newsletter", "custom-html"],
  designTokens: [
    { key: "accent", label: "Safety yellow", type: "color", default: "#f7c600", group: "Colors" },
    { key: "accentContrast", label: "Accent text", type: "color", default: "#0a0a0a", group: "Colors" },
    { key: "background", label: "Background", type: "color", default: "#f2f2f0", group: "Colors" },
    { key: "text", label: "Text", type: "color", default: "#0a0a0a", group: "Colors" },
    { key: "muted", label: "Muted", type: "color", default: "#5a5a5a", group: "Colors" },
    { key: "surface", label: "Surface", type: "color", default: "#ffffff", group: "Colors" },
    { key: "border", label: "Border", type: "color", default: "#0a0a0a", group: "Colors" },
    { key: "headingFont", label: "Heading font", type: "font", default: "Impact, Arial Black, sans-serif", group: "Typography" },
    { key: "radius", label: "Radius", type: "length", default: "0px", group: "Layout" },
    { key: "container", label: "Container", type: "length", default: "1400px", group: "Layout" },
  ],
};

const css = `
body { background: #f2f2f0; }
h1, h2, h3, h4 { text-transform: uppercase; }
.tk-header { background: #0a0a0a; color: #fff; border-bottom: 4px solid #f7c600; }
.tk-brand { text-transform: uppercase; font-size: 1.5rem; letter-spacing: .04em; }
.tk-brand span { border-bottom: 4px solid #f7c600; padding-bottom: 2px; }
.tk-actions { color: #fff; text-transform: uppercase; font-weight: 700; }
.tk-cart-count { background: #f7c600; color: #0a0a0a; }
.tk-announcement { background: #f7c600; color: #0a0a0a; font-weight: 800; letter-spacing: .06em; }
.tk-hero--full { min-height: clamp(440px, 68vh, 720px); }
.tk-hero--full::after { background: linear-gradient(100deg, rgba(0,0,0,.72) 10%, rgba(0,0,0,.15) 70%); }
.tk-hero-copy { text-align: left; max-width: 900px; }
.tk-hero-copy h1 { font-size: clamp(3.2rem, 9vw, 7.5rem); letter-spacing: -.01em; }
.tk-hero-copy p { text-transform: uppercase; font-weight: 700; letter-spacing: .12em; font-size: .82rem; }
.tk-btn { background: #f7c600; border-color: #f7c600; color: #0a0a0a; font-weight: 800; letter-spacing: .1em; }
.tk-btn--light { background: #f7c600; color: #0a0a0a; border-color: #f7c600; }
.tk-section { border-top: 4px solid #0a0a0a; }
.tk-section-heading { text-align: left; }
.tk-section-heading h2 { font-size: clamp(2rem, 4.5vw, 3.6rem); letter-spacing: -.01em; }
.tk-grid { gap: 3px; }
.tk-card { background: #fff; }
.tk-card-media { border-radius: 0; }
.tk-card--overlay .tk-card-body { padding: 14px; }
.tk-card--overlay .tk-card-title { font-family: var(--tk-heading-font); font-size: 1.25rem; text-transform: uppercase; margin: 0; }
.tk-card--overlay .tk-card-price { font-weight: 700; }
.tk-card:hover .tk-card-media img { transform: scale(1.06); }
.tk-category-card { border: 3px solid #0a0a0a; background: #f7c600; }
.tk-category-card h3 { font-size: 1.5rem; }
.tk-trust-item { border: 3px solid #0a0a0a; background: #fff; }
.tk-testimonial { border: 3px solid #0a0a0a; }
.tk-newsletter { border: 3px solid #0a0a0a; background: #f7c600; }
.tk-newsletter input { border: 3px solid #0a0a0a; }
.tk-pdp--stacked .tk-pdp-media-main { border: 4px solid #0a0a0a; }
.tk-pdp-info h1 { font-size: clamp(2.4rem, 6vw, 4.4rem); }
.tk-pdp-price { background: #f7c600; display: inline-block; padding: 4px 12px; font-weight: 700; }
.tk-field input, .tk-field select, .tk-field textarea { border: 2px solid #0a0a0a; }
.tk-summary { border: 3px solid #0a0a0a; }
.tk-footer { background: #0a0a0a; color: #fff; border-top: 6px solid #f7c600; }
.tk-footer a, .tk-footer .tk-muted { color: #bdbdbd; }
.tk-footer-brand { color: #f7c600; }
.tk-chip { border-radius: 0; border: 2px solid #0a0a0a; font-weight: 700; text-transform: uppercase; font-size: .68rem; }
.tk-chip--active { background: #0a0a0a; color: #f7c600; }
`;

export const theme = createTheme({
  manifest,
  css,
  header: "minimal",
  hero: "full",
  card: "overlay",
  columns: 4,
  productLayout: "stacked",
  collectionLayout: "editorial",
  footer: "statement",
});

export default theme;
