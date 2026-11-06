import {
  escapeAttr,
  escapeHtml,
  formatMoney,
  type PageSection,
} from "@cloudcart/shared";
import { sanitizeHtml } from "@cloudcart/security";
import {
  frameSection,
  paginationLinks,
  productCard,
  sectionHeading,
  stars,
  type CartData,
  type CheckoutData,
  type CollectionData,
  type ContentData,
  type HomeData,
  type NavItem,
  type ProductData,
  type StorefrontProduct,
  type ThemeDefinition,
  type ThemeRenderContext,
} from "@cloudcart/theme-sdk";

export const manifest = {
  id: "default",
  name: "Default",
  version: "1.0.0",
  previewImage: "/static/themes/default.svg",
  description: "A calm, editorial storefront with generous whitespace and a warm neutral palette.",
  supportedPages: ["home", "product", "collection", "search", "cart", "checkout", "page", "404"],
  supportedBlocks: [
    "announcement-bar", "hero", "image-banner", "product-grid", "featured-collection",
    "category-grid", "image-with-text", "rich-text", "video-embed", "testimonials",
    "faq", "trust-badges", "logo-list", "spacer", "divider", "newsletter", "custom-html",
  ],
  designTokens: [
    { key: "accent", label: "Accent color", type: "color", default: "#1f2937", group: "Colors" },
    { key: "background", label: "Background", type: "color", default: "#fbfaf7", group: "Colors" },
    { key: "text", label: "Text", type: "color", default: "#1b1b19", group: "Colors" },
    { key: "muted", label: "Muted text", type: "color", default: "#6f6b64", group: "Colors" },
    { key: "surface", label: "Card surface", type: "color", default: "#ffffff", group: "Colors" },
    { key: "border", label: "Border", type: "color", default: "#e4dfd6", group: "Colors" },
    { key: "font", label: "Font family", type: "font", default: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif", group: "Typography" },
    { key: "headingFont", label: "Heading font", type: "font", default: "Georgia, 'Times New Roman', serif", group: "Typography" },
    { key: "radius", label: "Corner radius", type: "length", default: "4px", group: "Layout" },
    { key: "container", label: "Container width", type: "length", default: "1180px", group: "Layout" },
  ],
};

const css = `
:root {
  --cc-font: var(--t-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
  --cc-heading-font: var(--t-headingFont, Georgia, "Times New Roman", serif);
  --cc-bg: var(--t-background, #fbfaf7);
  --cc-text: var(--t-text, #1b1b19);
  --cc-muted: var(--t-muted, #6f6b64);
  --cc-surface: var(--t-surface, #ffffff);
  --cc-border: var(--t-border, #e4dfd6);
  --cc-accent: var(--t-accent, #1f2937);
  --cc-radius: var(--t-radius, 4px);
  --cc-container: var(--t-container, 1180px);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--cc-bg); color: var(--cc-text); font-family: var(--cc-font); line-height: 1.6; -webkit-font-smoothing: antialiased; }
img { max-width: 100%; display: block; }
a { color: inherit; text-decoration: none; }
h1, h2, h3, h4 { font-family: var(--cc-heading-font); font-weight: 400; line-height: 1.15; margin: 0 0 .5em; letter-spacing: -.01em; }
h1 { font-size: clamp(2.2rem, 5vw, 3.8rem); }
h2 { font-size: clamp(1.6rem, 3vw, 2.4rem); }
p { margin: 0 0 1em; }
.cc-container { width: min(var(--cc-container), 100% - 40px); margin-inline: auto; }
.cc-announcement { background: var(--cc-accent); color: #fff; text-align: center; font-size: .85rem; padding: 9px 16px; letter-spacing: .04em; }
.cc-header { border-bottom: 1px solid var(--cc-border); background: var(--cc-bg); position: sticky; top: 0; z-index: 40; }
.cc-header-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 74px; }
.cc-brand { font-family: var(--cc-heading-font); font-size: 1.5rem; letter-spacing: .02em; display: inline-flex; align-items: center; gap: 10px; }
.cc-brand img { height: 34px; width: auto; }
.cc-nav { display: flex; align-items: center; gap: 22px; font-size: .9rem; }
.cc-nav a { padding: 6px 0; border-bottom: 1px solid transparent; }
.cc-nav a:hover { border-color: var(--cc-text); }
.cc-header-actions { display: flex; align-items: center; gap: 18px; font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; }
.cc-cart-link { display: inline-flex; gap: 6px; align-items: center; }
.cc-cart-count { min-width: 20px; height: 20px; border-radius: 999px; background: var(--cc-accent); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: .7rem; }
.cc-section { padding: clamp(42px, 7vw, 88px) 0; }
.cc-section--tight { padding: clamp(24px, 4vw, 48px) 0; }
.cc-section-heading { text-align: center; margin-bottom: 36px; }
.cc-section-heading p { color: var(--cc-muted); margin: 0; }
.cc-hero { position: relative; min-height: clamp(420px, 62vh, 680px); display: grid; place-items: center; text-align: center; color: #fff; overflow: hidden; }
.cc-hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cc-hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,20,18,.25), rgba(20,20,18,.55)); }
.cc-hero-inner { position: relative; z-index: 1; max-width: 760px; padding: 60px 24px; }
.cc-hero h1 { font-size: clamp(2.6rem, 7vw, 5rem); }
.cc-hero p { font-size: clamp(1rem, 2vw, 1.25rem); opacity: .92; }
.cc-hero--plain { color: var(--cc-text); background: var(--cc-surface); }
.cc-hero--plain::after { display: none; }
.cc-button { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 26px; border: 1px solid var(--cc-accent); background: var(--cc-accent); color: #fff; font: inherit; font-size: .85rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; border-radius: var(--cc-radius); transition: opacity .15s ease; }
.cc-button:hover { opacity: .86; }
.cc-button--light { background: #fff; color: var(--cc-text); border-color: #fff; }
.cc-button--ghost { background: transparent; color: var(--cc-accent); }
.cc-button--block { width: 100%; }
.cc-product-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 26px 22px; }
@media (max-width: 900px) { .cc-product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .cc-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 14px; } }
.cc-product-card { display: flex; flex-direction: column; }
.cc-product-media { position: relative; aspect-ratio: 4 / 5; background: #ece8e1; overflow: hidden; border-radius: var(--cc-radius); }
.cc-product-media img { width: 100%; height: 100%; object-fit: cover; transition: transform .5s ease; }
.cc-product-card:hover .cc-product-media img { transform: scale(1.03); }
.cc-product-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg, #e9e4dc, #f5f2ec); }
.cc-product-info { padding-top: 14px; }
.cc-product-title { font-family: var(--cc-font); font-size: .95rem; font-weight: 500; margin: 0 0 4px; }
.cc-product-price { font-size: .9rem; color: var(--cc-text); margin: 0; }
.cc-price-compare { color: var(--cc-muted); margin-left: 8px; font-size: .85em; }
.cc-product-stock { color: var(--cc-muted); font-size: .8rem; margin: 4px 0 0; }
.cc-badge { position: absolute; top: 12px; left: 12px; background: var(--cc-bg); color: var(--cc-text); font-size: .68rem; letter-spacing: .08em; text-transform: uppercase; padding: 5px 9px; border-radius: 999px; }
.cc-category-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
@media (max-width: 760px) { .cc-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cc-category-card { display: flex; flex-direction: column; justify-content: flex-end; min-height: 220px; padding: 22px; background: var(--cc-surface); border: 1px solid var(--cc-border); border-radius: var(--cc-radius); }
.cc-category-card h3 { margin: 0; font-size: 1.25rem; }
.cc-category-card span { color: var(--cc-muted); font-size: .82rem; }
.cc-image-text { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(28px, 6vw, 80px); align-items: center; }
.cc-image-text--reverse .cc-image-text-media { order: 2; }
.cc-image-text-media { aspect-ratio: 4 / 3; overflow: hidden; background: #e9e4dc; border-radius: var(--cc-radius); }
.cc-image-text-media img { width: 100%; height: 100%; object-fit: cover; }
.cc-image-text-content h2 { margin-top: 0; }
.cc-image-text-content p { color: var(--cc-muted); }
@media (max-width: 760px) { .cc-image-text { grid-template-columns: 1fr; } .cc-image-text--reverse .cc-image-text-media { order: 0; } }
.cc-rich-text { max-width: 780px; margin-inline: auto; }
.cc-rich-text img { margin: 24px auto; border-radius: var(--cc-radius); }
.cc-video { position: relative; aspect-ratio: 16 / 9; background: #111; border-radius: var(--cc-radius); overflow: hidden; }
.cc-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.cc-testimonials { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
@media (max-width: 760px) { .cc-testimonials { grid-template-columns: 1fr; } }
.cc-testimonial { background: var(--cc-surface); border: 1px solid var(--cc-border); padding: 28px; border-radius: var(--cc-radius); }
.cc-testimonial blockquote { margin: 0 0 16px; font-family: var(--cc-heading-font); font-size: 1.15rem; }
.cc-testimonial cite { font-style: normal; font-size: .85rem; color: var(--cc-muted); }
.cc-stars { color: #b58a3c; letter-spacing: 2px; margin-bottom: 10px; }
.cc-faq { max-width: 820px; margin-inline: auto; border-top: 1px solid var(--cc-border); }
.cc-faq details { border-bottom: 1px solid var(--cc-border); padding: 20px 0; }
.cc-faq summary { cursor: pointer; font-weight: 500; list-style: none; display: flex; justify-content: space-between; gap: 16px; }
.cc-faq summary::-webkit-details-marker { display: none; }
.cc-faq details p { color: var(--cc-muted); margin: 14px 0 0; }
.cc-trust { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
@media (max-width: 760px) { .cc-trust { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cc-trust-item { text-align: center; padding: 20px; }
.cc-trust-item strong { display: block; font-size: .95rem; margin-bottom: 4px; }
.cc-trust-item span { color: var(--cc-muted); font-size: .82rem; }
.cc-logos { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 42px; opacity: .65; }
.cc-logos img { max-height: 34px; width: auto; }
.cc-newsletter { background: var(--cc-surface); border: 1px solid var(--cc-border); padding: clamp(28px, 5vw, 56px); border-radius: var(--cc-radius); text-align: center; }
.cc-newsletter form { display: flex; gap: 10px; max-width: 480px; margin: 20px auto 0; }
.cc-newsletter input { flex: 1; min-height: 46px; border: 1px solid var(--cc-border); padding: 0 14px; font: inherit; border-radius: var(--cc-radius); background: #fff; }
.cc-pdp { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); gap: clamp(28px, 5vw, 72px); }
@media (max-width: 860px) { .cc-pdp { grid-template-columns: 1fr; } }
.cc-pdp-gallery-main { aspect-ratio: 4 / 5; background: #ece8e1; overflow: hidden; border-radius: var(--cc-radius); }
.cc-pdp-gallery-main img { width: 100%; height: 100%; object-fit: cover; }
.cc-pdp-thumbs { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.cc-pdp-thumbs img { width: 72px; height: 90px; object-fit: cover; border-radius: 3px; border: 1px solid var(--cc-border); }
.cc-pdp-info { position: sticky; top: 100px; align-self: start; }
.cc-pdp-info h1 { font-size: clamp(1.9rem, 3.6vw, 2.9rem); }
.cc-pdp-price { font-size: 1.25rem; margin-bottom: 18px; }
.cc-pdp-price s { color: var(--cc-muted); margin-left: 10px; font-size: .9em; }
.cc-options { margin: 22px 0; display: grid; gap: 14px; }
.cc-field { display: flex; flex-direction: column; gap: 6px; }
.cc-field label { font-size: .8rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.cc-field input, .cc-field select, .cc-field textarea { min-height: 46px; border: 1px solid var(--cc-border); background: #fff; padding: 9px 12px; font: inherit; border-radius: var(--cc-radius); }
.cc-field textarea { min-height: 96px; resize: vertical; }
.cc-description { border-top: 1px solid var(--cc-border); margin-top: 28px; padding-top: 24px; color: #45423d; }
.cc-breadcrumbs { font-size: .8rem; color: var(--cc-muted); margin-bottom: 26px; display: flex; gap: 8px; flex-wrap: wrap; }
.cc-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin: 26px 0 30px; padding-bottom: 18px; border-bottom: 1px solid var(--cc-border); }
.cc-toolbar form { display: flex; gap: 8px; flex-wrap: wrap; }
.cc-toolbar select, .cc-toolbar input { min-height: 40px; border: 1px solid var(--cc-border); background: #fff; padding: 6px 10px; font: inherit; border-radius: var(--cc-radius); }
.cc-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.cc-chip { padding: 7px 13px; border: 1px solid var(--cc-border); border-radius: 999px; font-size: .8rem; background: var(--cc-surface); }
.cc-chip--active { background: var(--cc-accent); color: #fff; border-color: var(--cc-accent); }
.cc-pagination { display: flex; align-items: center; justify-content: center; gap: 18px; margin-top: 48px; font-size: .85rem; }
.cc-page-link { text-decoration: underline; text-underline-offset: 4px; }
.cc-page-link--disabled { opacity: .35; text-decoration: none; }
.cc-empty { text-align: center; padding: clamp(48px, 10vw, 120px) 20px; }
.cc-empty p { color: var(--cc-muted); }
.cc-cart-layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, .8fr); gap: clamp(28px, 5vw, 64px); align-items: start; }
@media (max-width: 860px) { .cc-cart-layout { grid-template-columns: 1fr; } }
.cc-cart-lines { border-top: 1px solid var(--cc-border); }
.cc-cart-line { display: grid; grid-template-columns: 92px 1fr auto; gap: 18px; padding: 22px 0; border-bottom: 1px solid var(--cc-border); align-items: center; }
.cc-cart-line img { width: 92px; height: 112px; object-fit: cover; border-radius: var(--cc-radius); background: #ece8e1; }
.cc-cart-line h3 { font-family: var(--cc-font); font-weight: 500; font-size: 1rem; margin: 0 0 4px; }
.cc-cart-line .cc-muted { font-size: .82rem; }
.cc-qty { display: inline-flex; align-items: center; border: 1px solid var(--cc-border); border-radius: var(--cc-radius); overflow: hidden; }
.cc-qty button { width: 34px; height: 38px; border: 0; background: transparent; cursor: pointer; font-size: 1rem; }
.cc-qty input { width: 46px; height: 38px; border: 0; text-align: center; font: inherit; }
.cc-link-button { background: none; border: 0; padding: 0; color: var(--cc-muted); text-decoration: underline; cursor: pointer; font: inherit; font-size: .8rem; }
.cc-summary { background: var(--cc-surface); border: 1px solid var(--cc-border); border-radius: var(--cc-radius); padding: 26px; position: sticky; top: 100px; }
.cc-summary h2 { font-size: 1.35rem; }
.cc-summary-row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; font-size: .92rem; }
.cc-summary-row--total { border-top: 1px solid var(--cc-border); margin-top: 12px; padding-top: 16px; font-size: 1.05rem; font-weight: 600; }
.cc-coupon { display: flex; gap: 8px; margin: 16px 0; }
.cc-coupon input { flex: 1; min-height: 42px; border: 1px solid var(--cc-border); padding: 0 12px; font: inherit; border-radius: var(--cc-radius); }
.cc-checkout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(300px, .8fr); gap: clamp(28px, 5vw, 64px); align-items: start; }
@media (max-width: 900px) { .cc-checkout { grid-template-columns: 1fr; } }
.cc-checkout-section { margin-bottom: 34px; }
.cc-checkout-section h2 { font-size: 1.25rem; margin-bottom: 16px; }
.cc-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.cc-form-grid .cc-field--full { grid-column: 1 / -1; }
@media (max-width: 560px) { .cc-form-grid { grid-template-columns: 1fr; } }
.cc-radio-list { display: grid; gap: 10px; }
.cc-radio { display: flex; gap: 12px; align-items: flex-start; border: 1px solid var(--cc-border); background: var(--cc-surface); padding: 14px 16px; border-radius: var(--cc-radius); cursor: pointer; }
.cc-radio input { margin-top: 3px; }
.cc-radio strong { display: block; font-size: .92rem; }
.cc-radio span { color: var(--cc-muted); font-size: .82rem; }
.cc-manual-payment { background: var(--cc-surface); border: 1px solid var(--cc-border); padding: 22px; border-radius: var(--cc-radius); margin-top: 18px; }
.cc-bank-details { display: grid; grid-template-columns: max-content 1fr; gap: 8px 18px; margin: 14px 0; font-size: .9rem; }
.cc-bank-details dt { color: var(--cc-muted); }
.cc-bank-details dd { margin: 0; }
.cc-order-lines { display: grid; gap: 14px; }
.cc-order-line { display: flex; justify-content: space-between; gap: 14px; font-size: .9rem; }
.cc-order-line span { color: var(--cc-muted); }
.cc-notice { border: 1px solid var(--cc-border); background: var(--cc-surface); padding: 16px 18px; border-radius: var(--cc-radius); margin-bottom: 20px; }
.cc-notice--error { border-color: #c9a29a; background: #fbf0ee; color: #7a2e20; }
.cc-notice--success { border-color: #aabfa9; background: #f0f6ef; color: #2f5b2c; }
.cc-footer { border-top: 1px solid var(--cc-border); padding: clamp(44px, 7vw, 80px) 0 34px; margin-top: 40px; }
.cc-footer-grid { display: grid; grid-template-columns: 1.5fr repeat(3, minmax(0, 1fr)); gap: 32px; }
@media (max-width: 760px) { .cc-footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .cc-footer-grid { grid-template-columns: 1fr; } }
.cc-footer h3 { font-size: .8rem; font-family: var(--cc-font); letter-spacing: .12em; text-transform: uppercase; margin-bottom: 14px; }
.cc-footer a { display: block; color: var(--cc-muted); font-size: .9rem; padding: 4px 0; }
.cc-footer-bottom { margin-top: 44px; padding-top: 20px; border-top: 1px solid var(--cc-border); display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: .78rem; color: var(--cc-muted); }
.cc-muted { color: var(--cc-muted); }
.cc-error { color: #a63b2a; }
.cc-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.cc-custom-html img { margin: 0 auto; }
`;

interface ItemSettings {
  [key: string]: unknown;
}

function str(section: PageSection, key: string, fallback = ""): string {
  const value = section.settings[key];
  return typeof value === "string" ? value : fallback;
}

function num(section: PageSection, key: string, fallback: number): number {
  const value = section.settings[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function items(section: PageSection, key: string): ItemSettings[] {
  const value = section.settings[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ItemSettings => typeof item === "object" && item !== null);
}

function header(ctx: ThemeRenderContext): string {
  const logo = ctx.branding.logoUrl
    ? `<img src="${escapeAttr(ctx.branding.logoUrl)}" alt="${escapeAttr(ctx.branding.name)}">`
    : "";
  const nav = ctx.navigation
    .map((item) => `<a href="${escapeAttr(item.href)}"${ctx.currentPath === item.href ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`)
    .join("");
  return `<header class="cc-header">
  <div class="cc-container cc-header-inner">
    <a class="cc-brand" href="/">${logo}<span>${escapeHtml(ctx.branding.name)}</span></a>
    <nav class="cc-nav" aria-label="Main navigation">${nav}</nav>
    <div class="cc-header-actions">
      <a href="/search">Search</a>
      <a href="/cart" class="cc-cart-link">Cart <span class="cc-cart-count" data-cart-count>${ctx.cartCount}</span></a>
    </div>
  </div>
</header>`;
}

function footer(ctx: ThemeRenderContext): string {
  const nav = ctx.navigation.map((item) => "<a href=\"" + escapeAttr(item.href) + "\">" + escapeHtml(item.label) + "</a>").join("");
  const pages = ctx.footerPages ?? [];
  const link = (slug: string) => {
    const page = pages.find((item) => item.href === "/pages/" + slug);
    return page ? "<a href=\"" + escapeAttr(page.href) + "\">" + escapeHtml(page.label) + "</a>" : "";
  };
  const service = [link("contact-us"), link("faq"), "<a href=\"/cart\">Your cart</a>"].join("");
  const policies = [link("shipping-policy"), link("returns-refunds"), link("privacy-policy"), link("terms-of-service"), link("payment-policy")].join("");
  const brand = "<div><a class=\"cc-brand\" href=\"/\">" + escapeHtml(ctx.branding.name) + "</a>" +
    "<p class=\"cc-muted\" style=\"margin-top:14px;max-width:36ch\">" +
    escapeHtml(ctx.settings["footer.tagline"] || "Thoughtfully selected products, delivered with care.") + "</p>" + link("about-us") + "</div>";
  const body = brand + "<div><h3>Shop</h3>" + nav + "<a href=\"/search\">Search</a></div>" +
    "<div><h3>Customer Service</h3>" + service + "</div>" +
    (policies ? "<div><h3>Policies</h3>" + policies + "</div>" : "");
  return "<footer class=\"cc-footer\"><div class=\"cc-container\"><div class=\"cc-footer-grid\">" + body + "</div>" +
    "<div class=\"cc-footer-bottom\"><span>© " + new Date().getUTCFullYear() + " " + escapeHtml(ctx.branding.name) +
    ". All rights reserved.</span><span>Powered by CloudCart</span></div></div></footer>";
}

function layout(ctx: ThemeRenderContext, body: string, options: { announcement?: string } = {}): string {
  const announcement = options.announcement
    ? `<div class="cc-announcement">${escapeHtml(options.announcement)}</div>`
    : "";
  return `${announcement}${header(ctx)}<main id="main">${body}</main>${footer(ctx)}`;
}

function productGrid(products: StorefrontProduct[], ctx: ThemeRenderContext): string {
  if (products.length === 0) {
    return `<div class="cc-empty"><h2>No products yet</h2><p>Products added in the admin will appear here.</p></div>`;
  }
  return `<div class="cc-product-grid">${products.map((product) => productCard(product)).join("")}</div>`;
}

function videoEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com" || url.hostname === "youtu.be") {
      const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : (url.searchParams.get("v") ?? "");
      if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) return `https://www.youtube.com/embed/${id}`;
    }
    if (url.hostname === "player.vimeo.com" && /^\/video\/\d+/.test(url.pathname)) {
      return url.toString();
    }
    if (url.hostname === "vimeo.com" && /^\/\d+/.test(url.pathname)) {
      return `https://player.vimeo.com/video/${url.pathname.replace("/", "")}`;
    }
    return null;
  } catch {
    return null;
  }
}

function renderSection(section: PageSection, ctx: ThemeRenderContext, data: HomeData): string {
  const title = str(section, "title");
  switch (section.type) {
    case "hero": {
      const image = str(section, "image");
      const buttonText = str(section, "buttonText");
      const buttonUrl = str(section, "buttonUrl", "/products");
      return `<section class="cc-hero${image ? "" : " cc-hero--plain"}">
  ${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(str(section, "imageAlt"))}" fetchpriority="high">` : ""}
  <div class="cc-hero-inner">
    <h1>${escapeHtml(title || "Welcome")}</h1>
    ${str(section, "subtitle") ? `<p>${escapeHtml(str(section, "subtitle"))}</p>` : ""}
    ${buttonText ? `<p><a class="cc-button${image ? " cc-button--light" : ""}" href="${escapeAttr(buttonUrl)}">${escapeHtml(buttonText)}</a></p>` : ""}
  </div>
</section>`;
    }
    case "image-banner": {
      const image = str(section, "image");
      return `<section class="cc-section cc-section--tight"><div class="cc-container">
  <div class="cc-image-text">
    <div class="cc-image-text-media">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(str(section, "imageAlt"))}" loading="lazy">` : ""}</div>
    <div class="cc-image-text-content">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(str(section, "text"))}</p>
      ${str(section, "buttonText") ? `<a class="cc-button" href="${escapeAttr(str(section, "buttonUrl", "/products"))}">${escapeHtml(str(section, "buttonText"))}</a>` : ""}
    </div>
  </div>
</div></section>`;
    }
    case "product-grid":
    case "featured-collection": {
      const source = str(section, "source", "featured");
      const limit = Math.max(1, Math.min(24, num(section, "limit", 8)));
      const products = (source === "new" ? data.newArrivals : source === "all" ? data.products : data.featuredProducts).slice(0, limit);
      return `<section class="cc-section"><div class="cc-container">
  ${title ? sectionHeading(title, str(section, "subtitle") || undefined) : ""}
  ${productGrid(products, ctx)}
</div></section>`;
    }
    case "category-grid": {
      const categories = data.categories.slice(0, Math.max(1, num(section, "limit", 4)));
      if (categories.length === 0) return "";
      return `<section class="cc-section"><div class="cc-container">
  ${title ? sectionHeading(title, str(section, "subtitle") || undefined) : ""}
  <div class="cc-category-grid">${categories.map((category) => `
    <a class="cc-category-card" href="/collections/${escapeAttr(category.slug)}">
      <h3>${escapeHtml(category.name)}</h3>
      <span>${category.productCount ?? 0} products</span>
    </a>`).join("")}</div>
</div></section>`;
    }
    case "image-with-text":
      return `<section class="cc-section"><div class="cc-container">
  <div class="cc-image-text${str(section, "imagePosition") === "right" ? " cc-image-text--reverse" : ""}">
    <div class="cc-image-text-media">${str(section, "image") ? `<img src="${escapeAttr(str(section, "image"))}" alt="${escapeAttr(str(section, "imageAlt"))}" loading="lazy">` : ""}</div>
    <div class="cc-image-text-content">
      <h2>${escapeHtml(title)}</h2>
      <div>${sanitizeHtml(str(section, "text"), { allowImages: true })}</div>
      ${str(section, "buttonText") ? `<a class="cc-button" href="${escapeAttr(str(section, "buttonUrl", "/products"))}">${escapeHtml(str(section, "buttonText"))}</a>` : ""}
    </div>
  </div>
</div></section>`;
    case "rich-text":
      return `<section class="cc-section"><div class="cc-container"><div class="cc-rich-text">
  ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
  ${sanitizeHtml(str(section, "text"), { allowImages: true })}
</div></div></section>`;
    case "video-embed": {
      const url = videoEmbedUrl(str(section, "url"));
      if (!url) return "";
      return `<section class="cc-section"><div class="cc-container">
  ${title ? sectionHeading(title) : ""}
  <div class="cc-video"><iframe src="${escapeAttr(url)}" title="${escapeAttr(title || "Video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
</div></section>`;
    }
    case "testimonials": {
      const list = items(section, "items");
      if (list.length === 0) return "";
      return `<section class="cc-section"><div class="cc-container">
  ${title ? sectionHeading(title) : ""}
  <div class="cc-testimonials">${list.slice(0, 6).map((item) => `
    <div class="cc-testimonial">
      <div class="cc-stars" aria-hidden="true">${stars(Number(item.rating) || 5)}</div>
      <blockquote>${escapeHtml(String(item.quote ?? ""))}</blockquote>
      <cite>${escapeHtml(String(item.name ?? ""))}</cite>
    </div>`).join("")}</div>
</div></section>`;
    }
    case "faq": {
      const list = items(section, "items");
      if (list.length === 0) return "";
      return `<section class="cc-section"><div class="cc-container">
  ${title ? sectionHeading(title) : ""}
  <div class="cc-faq">${list.slice(0, 20).map((item) => `
    <details><summary>${escapeHtml(String(item.question ?? ""))}<span aria-hidden="true">+</span></summary>
    <p>${escapeHtml(String(item.answer ?? ""))}</p></details>`).join("")}</div>
</div></section>`;
    }
    case "trust-badges": {
      const list = items(section, "items");
      if (list.length === 0) return "";
      return `<section class="cc-section cc-section--tight"><div class="cc-container">
  ${title ? sectionHeading(title) : ""}
  <div class="cc-trust">${list.slice(0, 6).map((item) => `
    <div class="cc-trust-item"><strong>${escapeHtml(String(item.title ?? ""))}</strong><span>${escapeHtml(String(item.text ?? ""))}</span></div>`).join("")}</div>
</div></section>`;
    }
    case "logo-list": {
      const list = items(section, "items");
      if (list.length === 0) return "";
      return `<section class="cc-section cc-section--tight"><div class="cc-container">
  ${title ? sectionHeading(title) : ""}
  <div class="cc-logos">${list.slice(0, 10).map((item) => item.image
        ? `<img src="${escapeAttr(String(item.image))}" alt="${escapeAttr(String(item.name ?? "Logo"))}" loading="lazy">`
        : "").join("")}</div>
</div></section>`;
    }
    case "spacer":
      return `<div style="height:${Math.max(0, Math.min(240, num(section, "height", 40)))}px" aria-hidden="true"></div>`;
    case "divider":
      return `<div class="cc-container"><hr style="border:0;border-top:1px solid var(--cc-border);margin:0"></div>`;
    case "newsletter":
      return `<section class="cc-section"><div class="cc-container"><div class="cc-newsletter">
  <h2>${escapeHtml(title || "Stay in the loop")}</h2>
  <p class="cc-muted">${escapeHtml(str(section, "text", "New arrivals, stories and offers — no spam."))}</p>
  <form data-newsletter-form>
    <label class="cc-sr-only" for="newsletter-email">Email address</label>
    <input id="newsletter-email" type="email" name="email" placeholder="Your email address" required>
    <button class="cc-button" type="submit">Subscribe</button>
  </form>
  <p class="cc-muted" data-newsletter-message style="margin-top:12px;font-size:.85rem"></p>
</div></div></section>`;
    case "custom-html":
      return `<section class="cc-section"><div class="cc-container cc-custom-html">${sanitizeHtml(str(section, "html"), { allowImages: true })}</div></section>`;
    default:
      return "";
  }
}

function cartCount(ctx: ThemeRenderContext): number {
  return ctx.cartCount;
}

export const theme: ThemeDefinition = {
  manifest: manifest as unknown as ThemeDefinition["manifest"], // token types narrowed at runtime by the registry
  css,

  renderHome(ctx, data) {
    const announcement = data.page.sections.find((s) => s.type === "announcement-bar" && s.enabled);
    const sections = data.page.sections.filter(
      (s) => s.enabled && s.type !== "announcement-bar" && s.type !== "header" && s.type !== "footer",
    );
    const body = sections.length > 0
      ? sections.map((section) => frameSection(section, renderSection(section, ctx, data))).join("")
      : `<section class="cc-section"><div class="cc-container">${productGrid(data.featuredProducts.length > 0 ? data.featuredProducts : data.products, ctx)}</div></section>`;
    return layout(ctx, body, { announcement: announcement ? str(announcement, "text", ctx.settings["announcement"] ?? "") : (ctx.settings["announcement"] ?? "") });
  },

  renderProduct(ctx: ThemeRenderContext, data: ProductData) {
    const product = data.product;
    const mainImage = data.images[0]?.url ?? product.imageUrl;
    const compare = product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents
      ? `<s>${formatMoney(product.compareAtPriceCents, product.currency)}</s>`
      : "";
    const variantOptions = data.variants.length > 0
      ? `<div class="cc-field"><label for="variant">Option</label><select id="variant" data-variant-select>${data.variants.map((variant) => `<option value="${escapeAttr(variant.id)}"${variant.stock <= 0 ? " disabled" : ""}>${escapeHtml(variant.title)} — ${formatMoney(variant.priceCents, product.currency)}${variant.stock <= 0 ? " (Sold out)" : ""}</option>`).join("")}</select></div>`
      : "";
    const breadcrumbs = `<nav class="cc-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/products">Shop</a><span>/</span><span>${escapeHtml(product.name)}</span></nav>`;
    return layout(ctx, `<div class="cc-section"><div class="cc-container">
  ${breadcrumbs}
  <div class="cc-pdp">
    <div>
      <div class="cc-pdp-gallery-main">${mainImage ? `<img src="${escapeAttr(mainImage)}" alt="${escapeAttr(data.images[0]?.alt || product.name)}" fetchpriority="high">` : ""}</div>
      ${data.images.length > 1 ? `<div class="cc-pdp-thumbs">${data.images.slice(0, 6).map((image) => `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.alt || product.name)}" loading="lazy">`).join("")}</div>` : ""}
    </div>
    <div class="cc-pdp-info">
      <h1>${escapeHtml(product.name)}</h1>
      <p class="cc-pdp-price">${formatMoney(product.priceCents, product.currency)} ${compare}</p>
      ${product.inStock ? `<p class="cc-muted" style="font-size:.85rem">In stock${data.variants.length === 0 && data.images.length === 0 ? "" : ""}</p>` : `<p class="cc-error" style="font-size:.85rem">Out of stock</p>`}
      <div class="cc-options">
        ${variantOptions}
        <div class="cc-field"><label for="quantity">Quantity</label><input id="quantity" type="number" min="1" max="99" value="1" data-quantity-input></div>
      </div>
      <button class="cc-button cc-button--block" type="button" data-add-to-cart data-product-id="${escapeAttr(product.id)}" ${product.inStock ? "" : "disabled"}>Add to cart</button>
      <p class="cc-muted" data-cart-message style="margin-top:10px;font-size:.85rem"></p>
      <div class="cc-description">${data.descriptionHtml}</div>
    </div>
  </div>
</div></div>
${data.related.length > 0 ? `<section class="cc-section"><div class="cc-container">${sectionHeading("You may also like")}${productGrid(data.related, ctx)}</div></section>` : ""}`);
  },

  renderCollection(ctx: ThemeRenderContext, data: CollectionData) {
    const chips = data.categories.slice(0, 10).map((category) => {
      const active = data.activeCategory === category.slug;
      return `<a class="cc-chip${active ? " cc-chip--active" : ""}" href="/collections/${escapeAttr(category.slug)}">${escapeHtml(category.name)}</a>`;
    }).join("");
    const sortOptions = [
      ["newest", "Newest"],
      ["price_asc", "Price: low to high"],
      ["price_desc", "Price: high to low"],
      ["name", "Name"],
    ].map(([value, label]) => `<option value="${value}"${data.sort === value ? " selected" : ""}>${label}</option>`).join("");
    const searchValue = data.query ? escapeAttr(data.query) : "";
    return layout(ctx, `<div class="cc-section"><div class="cc-container">
  <h1>${escapeHtml(data.title)}</h1>
  ${data.description ? `<p class="cc-muted" style="max-width:60ch">${escapeHtml(data.description)}</p>` : ""}
  <div class="cc-toolbar">
    <div class="cc-chips"><a class="cc-chip${data.activeCategory ? "" : " cc-chip--active"}" href="/products">All</a>${chips}</div>
    <form method="get" action="${escapeAttr(data.basePath)}">
      ${data.activeCategory ? `<input type="hidden" name="category" value="${escapeAttr(data.activeCategory)}">` : ""}
      <input type="search" name="q" value="${searchValue}" placeholder="Search products" aria-label="Search products">
      <select name="sort" aria-label="Sort products">${sortOptions}</select>
      <button class="cc-button cc-button--ghost" type="submit">Apply</button>
    </form>
  </div>
  ${productGrid(data.products, ctx)}
  ${paginationLinks(data.basePath, data.pagination.page, data.pagination.totalPages)}
</div></div>`);
  },

  renderCart(ctx: ThemeRenderContext, data: CartData) {
    if (data.lines.length === 0) {
      return layout(ctx, `<div class="cc-section"><div class="cc-container cc-empty">
  <h1>Your cart is empty</h1>
  <p>Find something you love and it will show up here.</p>
  <a class="cc-button" href="/products">Continue shopping</a>
</div></div>`);
    }
    const lines = data.lines.map((line) => `
  <div class="cc-cart-line">
    <a href="/products/${escapeAttr(line.slug)}">${line.imageUrl ? `<img src="${escapeAttr(line.imageUrl)}" alt="${escapeAttr(line.name)}" loading="lazy">` : `<div class="cc-product-placeholder"></div>`}</a>
    <div>
      <h3><a href="/products/${escapeAttr(line.slug)}">${escapeHtml(line.name)}</a></h3>
      ${line.variantId ? `<p class="cc-muted">Option: ${escapeHtml(line.variantId)}</p>` : ""}
      <p class="cc-muted">${formatMoney(line.unitPriceCents, data.currency)} each</p>
      <div class="cc-qty" style="margin-top:10px">
        <button type="button" data-qty-step="-1" aria-label="Decrease quantity">−</button>
        <input type="number" min="1" max="99" value="${line.quantity}" data-cart-qty data-item-id="${escapeAttr(line.itemId)}" aria-label="Quantity">
        <button type="button" data-qty-step="1" aria-label="Increase quantity">+</button>
      </div>
      ${line.stock < line.quantity ? `<p class="cc-error" style="font-size:.8rem;margin-top:6px">Only ${line.stock} available</p>` : ""}
    </div>
    <div style="text-align:right">
      <p style="margin:0">${formatMoney(line.totalCents, data.currency)}</p>
      <button class="cc-link-button" type="button" data-cart-remove data-item-id="${escapeAttr(line.itemId)}">Remove</button>
    </div>
  </div>`).join("");
    return layout(ctx, `<div class="cc-section"><div class="cc-container" data-cart-page>
  <h1>Your cart</h1>
  <p class="cc-muted" data-cart-message></p>
  <div class="cc-cart-layout">
    <div class="cc-cart-lines">${lines}</div>
    <aside class="cc-summary">
      <h2>Order summary</h2>
      <div class="cc-summary-row"><span>Subtotal</span><span>${formatMoney(data.subtotalCents, data.currency)}</span></div>
      ${data.discountCents > 0 ? `<div class="cc-summary-row"><span>Discount ${data.couponCode ? `(${escapeHtml(data.couponCode)})` : ""}</span><span>−${formatMoney(data.discountCents, data.currency)}</span></div>` : ""}
      <div class="cc-summary-row"><span>Shipping</span><span>${data.shippingCents > 0 ? formatMoney(data.shippingCents, data.currency) : "Calculated at checkout"}</span></div>
      <div class="cc-summary-row cc-summary-row--total"><span>Total</span><span>${formatMoney(data.totalCents, data.currency)}</span></div>
      <form class="cc-coupon" data-coupon-form>
        <input name="code" value="${escapeAttr(data.couponCode ?? "")}" placeholder="Discount code" aria-label="Discount code">
        <button class="cc-button cc-button--ghost" type="submit">Apply</button>
      </form>
      ${data.error ? `<p class="cc-error" style="font-size:.85rem">${escapeHtml(data.error)}</p>` : ""}
      <a class="cc-button cc-button--block" href="/checkout">Checkout</a>
      <p class="cc-muted" style="font-size:.78rem;margin-top:12px">Taxes and shipping are calculated at checkout.</p>
    </aside>
  </div>
</div></div>`);
  },

  renderCheckout(ctx: ThemeRenderContext, data: CheckoutData) {
    const v = data.values ?? {};
    const shippingOptions = data.shippingRates.map((rate) => `
      <label class="cc-radio"><input type="radio" name="shippingRateId" value="${escapeAttr(rate.id)}"${rate.id === data.values?.shippingRateId ? " checked" : ""} required>
      <span><strong>${escapeHtml(rate.name)}</strong><span>${rate.priceCents === 0 ? "Free" : formatMoney(rate.priceCents, data.cart.currency)}</span></span></label>`).join("");
    const paymentOptions = data.paymentMethods.map((method) => `
      <label class="cc-radio"><input type="radio" name="paymentMethod" value="${escapeAttr(method.id)}"${method.id === (v.paymentMethod ?? data.paymentMethods[0]?.id) ? " checked" : ""} required>
      <span><strong>${escapeHtml(method.name)}</strong><span>${escapeHtml(method.description)}</span></span></label>`).join("");
    const countryOptions = data.countries.map((country) => `<option value="${escapeAttr(country.code)}"${(v.country ?? "US") === country.code ? " selected" : ""}>${escapeHtml(country.name)}</option>`).join("");
    return layout(ctx, `<div class="cc-section"><div class="cc-container">
  <h1>Checkout</h1>
  ${data.error ? `<div class="cc-notice cc-notice--error">${escapeHtml(data.error)}</div>` : ""}
  <form method="post" action="/checkout" class="cc-checkout">
    <div>
      <section class="cc-checkout-section">
        <h2>Contact</h2>
        <div class="cc-form-grid">
          <div class="cc-field cc-field--full"><label for="email">Email</label><input id="email" name="email" type="email" required value="${escapeAttr(v.email ?? "")}"></div>
          <div class="cc-field"><label for="name">Full name</label><input id="name" name="name" required value="${escapeAttr(v.name ?? "")}"></div>
          <div class="cc-field"><label for="phone">Phone</label><input id="phone" name="phone" value="${escapeAttr(v.phone ?? "")}"></div>
        </div>
      </section>
      <section class="cc-checkout-section">
        <h2>Shipping address</h2>
        <div class="cc-form-grid">
          <div class="cc-field cc-field--full"><label for="line1">Address</label><input id="line1" name="line1" required value="${escapeAttr(v.line1 ?? "")}"></div>
          <div class="cc-field cc-field--full"><label for="line2">Apartment, suite (optional)</label><input id="line2" name="line2" value="${escapeAttr(v.line2 ?? "")}"></div>
          <div class="cc-field"><label for="city">City</label><input id="city" name="city" required value="${escapeAttr(v.city ?? "")}"></div>
          <div class="cc-field"><label for="state">State / Province</label><input id="state" name="state" value="${escapeAttr(v.state ?? "")}"></div>
          <div class="cc-field"><label for="postalCode">Postal code</label><input id="postalCode" name="postalCode" required value="${escapeAttr(v.postalCode ?? "")}"></div>
          <div class="cc-field"><label for="country">Country</label><select id="country" name="country" required>${countryOptions}</select></div>
        </div>
      </section>
      <section class="cc-checkout-section">
        <h2>Shipping method</h2>
        <div class="cc-radio-list">${shippingOptions}</div>
      </section>
      <section class="cc-checkout-section">
        <h2>Payment</h2>
        <div class="cc-radio-list">${paymentOptions}</div>
      </section>
      <section class="cc-checkout-section">
        <h2>Notes</h2>
        <div class="cc-field"><label for="customerNote">Order note (optional)</label><textarea id="customerNote" name="customerNote">${escapeHtml(v.customerNote ?? "")}</textarea></div>
        <input type="hidden" name="couponCode" value="${escapeAttr(data.cart.couponCode ?? "")}">
      </section>
      <button class="cc-button cc-button--block" type="submit">Place order</button>
    </div>
    <aside class="cc-summary">
      <h2>Order summary</h2>
      <div class="cc-order-lines">${data.cart.lines.map((line) => `<div class="cc-order-line"><span>${escapeHtml(line.name)} × ${line.quantity}</span><span>${formatMoney(line.totalCents, data.cart.currency)}</span></div>`).join("")}</div>
      <div class="cc-summary-row" style="margin-top:14px"><span>Subtotal</span><span>${formatMoney(data.cart.subtotalCents, data.cart.currency)}</span></div>
      ${data.cart.discountCents > 0 ? `<div class="cc-summary-row"><span>Discount</span><span>−${formatMoney(data.cart.discountCents, data.cart.currency)}</span></div>` : ""}
      <div class="cc-summary-row"><span>Shipping</span><span>${formatMoney(data.cart.shippingCents, data.cart.currency)}</span></div>
      <div class="cc-summary-row cc-summary-row--total"><span>Total</span><span>${formatMoney(data.cart.totalCents, data.cart.currency)}</span></div>
      <p class="cc-muted" style="font-size:.78rem;margin-top:14px">Your order will be created and stock reserved only after you place it.</p>
    </aside>
  </form>
</div></div>`);
  },

  renderContent(ctx: ThemeRenderContext, data: ContentData) {
    const announcement = data.page.sections.find((section) => section.enabled && section.type === "announcement-bar");
    const sections = data.page.sections.filter((section) =>
      section.enabled && !["announcement-bar", "header", "footer"].includes(section.type));
    const body = sections.length
      ? sections.map((section) => frameSection(section, renderSection(section, ctx, data))).join("")
      : "<div class=\"cc-section\"><div class=\"cc-container\"><div class=\"cc-rich-text\"><h1>" +
        escapeHtml(data.title) + "</h1>" + data.bodyHtml + "</div></div></div>";
    return layout(ctx, body, { announcement: announcement ? str(announcement, "text") : (ctx.settings["announcement"] ?? "") });
  },

  renderNotFound(ctx: ThemeRenderContext) {
    return layout(ctx, `<div class="cc-section"><div class="cc-container cc-empty">
  <h1>Page not found</h1>
  <p>The page you are looking for does not exist or has moved.</p>
  <a class="cc-button" href="/">Back to home</a>
</div></div>`);
  },
};

export default theme;
