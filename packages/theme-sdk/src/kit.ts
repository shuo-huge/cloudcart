import { escapeAttr, escapeHtml, formatMoney, type PageSection } from "@cloudcart/shared";
import { sanitizeHtml } from "@cloudcart/security";
import { frameSection } from "./html";
import type { ThemeManifest } from "./manifest";
import type {
  CartData,
  CheckoutData,
  CollectionData,
  ContentData,
  HomeData,
  ProductData,
  StorefrontProduct,
  ThemeDefinition,
  ThemeRenderContext,
} from "./types";

export type HeaderStyle = "split" | "centered" | "minimal";
export type HeroStyle = "full" | "split" | "offset" | "minimal" | "stacked";
export type CardStyle = "tall" | "portrait" | "wide" | "minimal" | "overlay";
export type ProductLayout = "split" | "stacked" | "editorial";
export type CollectionLayout = "toolbar" | "sidebar" | "editorial";
export type FooterStyle = "columns" | "minimal" | "statement";

export interface ThemeKitConfig {
  manifest: ThemeManifest;
  css: string;
  header?: HeaderStyle;
  hero?: HeroStyle;
  card?: CardStyle;
  columns?: 2 | 3 | 4;
  productLayout?: ProductLayout;
  collectionLayout?: CollectionLayout;
  footer?: FooterStyle;
  labels?: {
    shop?: string;
    cart?: string;
    addToCart?: string;
    soldOut?: string;
    continueShopping?: string;
  };
}

const DEFAULT_LABELS = {
  shop: "Shop",
  cart: "Cart",
  addToCart: "Add to cart",
  soldOut: "Sold out",
  continueShopping: "Continue shopping",
};

function str(section: PageSection, key: string, fallback = ""): string {
  const value = section.settings[key];
  return typeof value === "string" ? value : fallback;
}

function num(section: PageSection, key: string, fallback: number): number {
  const value = section.settings[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function itemList(section: PageSection, key: string): Array<Record<string, unknown>> {
  const value = section.settings[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

function videoEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname)) {
      const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : (url.searchParams.get("v") ?? "");
      if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) return `https://www.youtube.com/embed/${id}`;
    }
    if (url.hostname === "vimeo.com" && /^\/\d+/.test(url.pathname)) {
      return `https://player.vimeo.com/video/${url.pathname.slice(1)}`;
    }
    if (url.hostname === "player.vimeo.com" && /^\/video\/\d+/.test(url.pathname)) return url.toString();
    return null;
  } catch {
    return null;
  }
}

export const KIT_CSS = `
:root {
  --tk-bg: var(--t-background, #ffffff);
  --tk-text: var(--t-text, #161616);
  --tk-muted: var(--t-muted, #6b6b6b);
  --tk-surface: var(--t-surface, #ffffff);
  --tk-border: var(--t-border, #e6e2dc);
  --tk-accent: var(--t-accent, #111111);
  --tk-accent-contrast: var(--t-accentContrast, #ffffff);
  --tk-font: var(--t-font, Inter, system-ui, -apple-system, "Segoe UI", sans-serif);
  --tk-heading-font: var(--t-headingFont, var(--tk-font));
  --tk-radius: var(--t-radius, 0px);
  --tk-container: var(--t-container, 1200px);
  --tk-heading-transform: var(--t-headingTransform, none);
  --tk-letter-spacing: var(--t-letterSpacing, -0.01em);
  --tk-card-ratio: var(--t-cardRatio, 4 / 5);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--tk-bg); color: var(--tk-text); font-family: var(--tk-font); line-height: 1.55; -webkit-font-smoothing: antialiased; }
img { max-width: 100%; display: block; }
a { color: inherit; text-decoration: none; }
h1, h2, h3, h4 { font-family: var(--tk-heading-font); font-weight: 500; line-height: 1.12; margin: 0 0 .5em; letter-spacing: var(--tk-letter-spacing); text-transform: var(--tk-heading-transform); }
h1 { font-size: clamp(2.2rem, 5.5vw, 4.4rem); }
h2 { font-size: clamp(1.55rem, 3vw, 2.5rem); }
p { margin: 0 0 1em; }
.tk-container { width: min(var(--tk-container), 100% - 40px); margin-inline: auto; }
.tk-section { padding: clamp(40px, 7vw, 90px) 0; }
.tk-section--tight { padding: clamp(24px, 4vw, 48px) 0; }
.tk-section-heading { text-align: center; margin-bottom: 34px; }
.tk-section-heading p { color: var(--tk-muted); margin: 0; }
.tk-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 26px; border: 1px solid var(--tk-accent); background: var(--tk-accent); color: var(--tk-accent-contrast); font: inherit; font-size: .82rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; cursor: pointer; border-radius: var(--tk-radius); transition: opacity .15s ease; }
.tk-btn:hover { opacity: .85; }
.tk-btn--ghost { background: transparent; color: var(--tk-accent); }
.tk-btn--light { background: #fff; color: #111; border-color: #fff; }
.tk-btn--block { width: 100%; }
.tk-announcement { background: var(--tk-accent); color: var(--tk-accent-contrast); text-align: center; padding: 9px 16px; font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; }
.tk-header { background: var(--t-headerBg, var(--tk-bg)); border-bottom: 1px solid var(--tk-border); position: sticky; top: 0; z-index: 40; }
.tk-header-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 76px; }
.tk-brand { font-family: var(--tk-heading-font); font-size: 1.45rem; letter-spacing: .02em; display: inline-flex; align-items: center; gap: 10px; }
.tk-brand img { height: 34px; width: auto; }
.tk-nav { display: flex; align-items: center; gap: 22px; font-size: .86rem; letter-spacing: .04em; }
.tk-nav a { padding: 5px 0; border-bottom: 1px solid transparent; }
.tk-nav a:hover { border-color: currentColor; }
.tk-actions { display: flex; align-items: center; gap: 18px; font-size: .78rem; letter-spacing: .1em; text-transform: uppercase; }
.tk-cart-count { min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; background: var(--tk-accent); color: var(--tk-accent-contrast); display: inline-flex; align-items: center; justify-content: center; font-size: .68rem; }
.tk-header--centered .tk-header-inner { flex-direction: column; gap: 10px; padding: 18px 0; justify-content: center; }
.tk-header--centered .tk-nav { order: 3; }
.tk-header--centered .tk-actions { position: absolute; right: 20px; top: 22px; }
.tk-header--centered { position: relative; }
.tk-header--centered .tk-header-inner { position: static; }
.tk-header--minimal .tk-nav { display: none; }
.tk-header--minimal .tk-header-inner { min-height: 64px; }
.tk-hero { position: relative; }
.tk-hero--full { min-height: clamp(440px, 72vh, 760px); display: grid; place-items: center; text-align: center; color: #fff; overflow: hidden; }
.tk-hero--full > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.tk-hero--full::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.52)); }
.tk-hero-copy { position: relative; z-index: 1; max-width: 760px; padding: 60px 24px; }
.tk-hero-copy p { font-size: 1.05rem; opacity: .9; }
.tk-hero--split, .tk-hero--offset { display: grid; grid-template-columns: 1fr 1fr; align-items: stretch; min-height: 540px; }
.tk-hero--offset { position: relative; display: block; min-height: 600px; }
.tk-hero--offset .tk-hero-media { position: absolute; inset: 0; }
.tk-hero--offset .tk-hero-media img { width: 100%; height: 100%; object-fit: cover; }
.tk-hero--offset .tk-hero-copy { position: relative; z-index: 2; max-width: 520px; margin: clamp(40px, 8vw, 120px); background: var(--tk-bg); padding: clamp(28px, 5vw, 56px); }
.tk-hero--split .tk-hero-copy { display: flex; flex-direction: column; justify-content: center; padding: clamp(36px, 6vw, 90px); }
.tk-hero--split .tk-hero-media { min-height: 420px; }
.tk-hero--split .tk-hero-media img, .tk-hero--stacked .tk-hero-media img { width: 100%; height: 100%; object-fit: cover; }
.tk-hero--minimal { padding: clamp(70px, 12vw, 170px) 0; text-align: center; border-bottom: 1px solid var(--tk-border); }
.tk-hero--minimal h1 { font-size: clamp(2.8rem, 8vw, 6.5rem); }
.tk-hero--stacked { display: flex; flex-direction: column; }
.tk-hero--stacked .tk-hero-media { aspect-ratio: 16 / 9; }
.tk-hero--stacked .tk-hero-copy { padding: 40px 0 10px; max-width: 720px; }
@media (max-width: 760px) { .tk-hero--split { grid-template-columns: 1fr; } .tk-hero--split .tk-hero-media { min-height: 300px; order: -1; } .tk-hero--offset .tk-hero-copy { margin: 20px; } }
.tk-grid { display: grid; gap: 26px 20px; }
.tk-grid--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.tk-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.tk-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 980px) { .tk-grid--4 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 700px) { .tk-grid--3, .tk-grid--4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tk-grid--2 { grid-template-columns: 1fr; } }
.tk-card { display: flex; flex-direction: column; position: relative; }
.tk-card-media { position: relative; aspect-ratio: var(--tk-card-ratio); background: #eee; overflow: hidden; border-radius: var(--tk-radius); }
.tk-card-media img { width: 100%; height: 100%; object-fit: cover; transition: transform .45s ease; }
.tk-card:hover .tk-card-media img { transform: scale(1.04); }
.tk-card--portrait .tk-card-media { aspect-ratio: 3 / 4; }
.tk-card--wide .tk-card-media { aspect-ratio: 4 / 3; }
.tk-card--minimal .tk-card-media { background: transparent; }
.tk-card--minimal .tk-card-media img { object-fit: contain; }
.tk-card-body { padding-top: 12px; }
.tk-card-title { font-family: var(--tk-font); font-size: .92rem; font-weight: 500; margin: 0 0 3px; }
.tk-card-price { font-size: .86rem; margin: 0; }
.tk-card--overlay .tk-card-body { position: absolute; left: 0; right: 0; bottom: 0; padding: 16px; background: linear-gradient(180deg, transparent, rgba(0,0,0,.55)); color: #fff; }
.tk-card--overlay .tk-card-title, .tk-card--overlay .tk-card-price { color: #fff; }
.tk-price-compare { color: var(--tk-muted); margin-left: 8px; font-size: .85em; }
.tk-badge { position: absolute; top: 10px; left: 10px; background: var(--tk-bg); color: var(--tk-text); padding: 4px 8px; font-size: .66rem; letter-spacing: .08em; text-transform: uppercase; border-radius: 999px; }
.tk-empty-state { text-align: center; padding: clamp(50px, 10vw, 130px) 20px; }
.tk-empty-state p { color: var(--tk-muted); }
.tk-image-text { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(26px, 6vw, 80px); align-items: center; }
.tk-image-text--reverse .tk-image-text-media { order: 2; }
.tk-image-text-media { aspect-ratio: 4 / 3; overflow: hidden; border-radius: var(--tk-radius); background: #eee; }
.tk-image-text-media img { width: 100%; height: 100%; object-fit: cover; }
@media (max-width: 760px) { .tk-image-text { grid-template-columns: 1fr; } .tk-image-text--reverse .tk-image-text-media { order: 0; } }
.tk-rich-text { max-width: 760px; margin-inline: auto; }
.tk-rich-text img { margin: 22px auto; border-radius: var(--tk-radius); }
.tk-video { aspect-ratio: 16 / 9; background: #000; border-radius: var(--tk-radius); overflow: hidden; }
.tk-video iframe { width: 100%; height: 100%; border: 0; }
.tk-testimonials { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
@media (max-width: 760px) { .tk-testimonials { grid-template-columns: 1fr; } }
.tk-testimonial { border: 1px solid var(--tk-border); background: var(--tk-surface); padding: 26px; border-radius: var(--tk-radius); }
.tk-testimonial blockquote { margin: 0 0 14px; font-family: var(--tk-heading-font); font-size: 1.1rem; }
.tk-testimonial cite { font-style: normal; font-size: .8rem; color: var(--tk-muted); }
.tk-stars { color: #b08a3e; letter-spacing: 2px; margin-bottom: 8px; }
.tk-faq { max-width: 820px; margin-inline: auto; border-top: 1px solid var(--tk-border); }
.tk-faq details { border-bottom: 1px solid var(--tk-border); padding: 18px 0; }
.tk-faq summary { cursor: pointer; display: flex; justify-content: space-between; gap: 16px; list-style: none; font-weight: 500; }
.tk-faq summary::-webkit-details-marker { display: none; }
.tk-faq p { color: var(--tk-muted); margin: 12px 0 0; }
.tk-trust { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
@media (max-width: 760px) { .tk-trust { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tk-trust-item { text-align: center; padding: 18px; }
.tk-trust-item strong { display: block; margin-bottom: 4px; }
.tk-trust-item span { color: var(--tk-muted); font-size: .82rem; }
.tk-logos { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 40px; opacity: .7; }
.tk-logos img { max-height: 32px; width: auto; }
.tk-newsletter { border: 1px solid var(--tk-border); background: var(--tk-surface); padding: clamp(28px, 5vw, 56px); text-align: center; border-radius: var(--tk-radius); }
.tk-newsletter form { display: flex; gap: 8px; max-width: 460px; margin: 18px auto 0; }
.tk-newsletter input { flex: 1; min-height: 46px; border: 1px solid var(--tk-border); background: var(--tk-surface); padding: 0 12px; font: inherit; border-radius: var(--tk-radius); }
.tk-category-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 760px) { .tk-category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tk-category-card { min-height: 190px; display: flex; flex-direction: column; justify-content: flex-end; padding: 20px; border: 1px solid var(--tk-border); background: var(--tk-surface); border-radius: var(--tk-radius); }
.tk-category-card h3 { margin: 0; font-size: 1.15rem; }
.tk-category-card span { color: var(--tk-muted); font-size: .78rem; }
.tk-pdp { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: clamp(26px, 5vw, 70px); }
.tk-pdp--stacked { grid-template-columns: 1fr; }
.tk-pdp--stacked .tk-pdp-info { max-width: 720px; }
.tk-pdp--editorial { grid-template-columns: minmax(0, 1.25fr) minmax(0, .75fr); }
.tk-pdp-media-main { aspect-ratio: 4 / 5; background: #eee; overflow: hidden; border-radius: var(--tk-radius); }
.tk-pdp-media-main img { width: 100%; height: 100%; object-fit: cover; }
.tk-pdp-thumbs { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.tk-pdp-thumbs img { width: 68px; height: 84px; object-fit: cover; border-radius: 3px; border: 1px solid var(--tk-border); }
.tk-pdp-info h1 { font-size: clamp(1.8rem, 3.5vw, 2.9rem); }
.tk-pdp--editorial .tk-pdp-info { padding-top: clamp(0px, 4vw, 60px); }
.tk-pdp-price { font-size: 1.2rem; margin-bottom: 16px; }
.tk-pdp-price s { color: var(--tk-muted); margin-left: 10px; font-size: .9em; }
.tk-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.tk-field label { font-size: .74rem; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; }
.tk-field input, .tk-field select, .tk-field textarea { width: 100%; min-height: 44px; border: 1px solid var(--tk-border); background: var(--tk-surface); color: var(--tk-text); padding: 8px 11px; font: inherit; border-radius: var(--tk-radius); }
.tk-field textarea { min-height: 90px; }
.tk-description { border-top: 1px solid var(--tk-border); margin-top: 24px; padding-top: 22px; color: var(--tk-muted); }
.tk-muted { color: var(--tk-muted); }
.tk-error { color: #b03a2a; }
.tk-breadcrumbs { display: flex; gap: 8px; flex-wrap: wrap; font-size: .76rem; color: var(--tk-muted); margin-bottom: 22px; }
.tk-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 26px; padding-bottom: 16px; border-bottom: 1px solid var(--tk-border); }
.tk-toolbar form { display: flex; gap: 8px; flex-wrap: wrap; }
.tk-toolbar input, .tk-toolbar select { min-height: 38px; border: 1px solid var(--tk-border); background: var(--tk-surface); padding: 6px 10px; font: inherit; border-radius: var(--tk-radius); }
.tk-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.tk-chip { padding: 6px 12px; border: 1px solid var(--tk-border); border-radius: 999px; font-size: .76rem; }
.tk-chip--active { background: var(--tk-accent); color: var(--tk-accent-contrast); border-color: var(--tk-accent); }
.tk-collection--sidebar { display: grid; grid-template-columns: 210px 1fr; gap: 34px; align-items: start; }
.tk-collection-aside { position: sticky; top: 100px; }
.tk-collection-aside .tk-chips { flex-direction: column; align-items: flex-start; }
@media (max-width: 860px) { .tk-collection--sidebar { grid-template-columns: 1fr; } .tk-collection-aside { position: static; } }
.tk-pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 40px; font-size: .82rem; }
.tk-page-link--disabled { opacity: .35; text-decoration: none; }
.tk-cart-layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, .8fr); gap: clamp(26px, 5vw, 60px); align-items: start; }
@media (max-width: 860px) { .tk-cart-layout { grid-template-columns: 1fr; } }
.tk-cart-line { display: grid; grid-template-columns: 88px 1fr auto; gap: 16px; align-items: center; padding: 20px 0; border-bottom: 1px solid var(--tk-border); }
.tk-cart-line img { width: 88px; height: 108px; object-fit: cover; background: #eee; border-radius: var(--tk-radius); }
.tk-cart-line h3 { font-family: var(--tk-font); font-size: .96rem; margin: 0 0 4px; }
.tk-cart-lines { border-top: 1px solid var(--tk-border); }
.tk-qty { display: inline-flex; align-items: center; border: 1px solid var(--tk-border); border-radius: var(--tk-radius); overflow: hidden; margin-top: 8px; }
.tk-qty button { width: 32px; height: 36px; border: 0; background: transparent; cursor: pointer; color: inherit; }
.tk-qty input { width: 44px; height: 36px; border: 0; text-align: center; font: inherit; background: transparent; color: inherit; }
.tk-summary { border: 1px solid var(--tk-border); background: var(--tk-surface); padding: 24px; border-radius: var(--tk-radius); position: sticky; top: 100px; }
.tk-summary-row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; font-size: .9rem; }
.tk-summary-row--total { border-top: 1px solid var(--tk-border); margin-top: 10px; padding-top: 14px; font-weight: 600; font-size: 1.02rem; }
.tk-coupon { display: flex; gap: 8px; margin: 14px 0; }
.tk-coupon input { flex: 1; min-height: 42px; border: 1px solid var(--tk-border); background: var(--tk-surface); color: var(--tk-text); padding: 0 12px; font: inherit; border-radius: var(--tk-radius); }
.tk-checkout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(290px, .8fr); gap: clamp(26px, 5vw, 60px); align-items: start; }
@media (max-width: 900px) { .tk-checkout { grid-template-columns: 1fr; } }
.tk-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tk-form-grid .tk-field--full { grid-column: 1 / -1; }
@media (max-width: 560px) { .tk-form-grid { grid-template-columns: 1fr; } }
.tk-radio-list { display: grid; gap: 8px; }
.tk-radio { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--tk-border); background: var(--tk-surface); padding: 13px 15px; border-radius: var(--tk-radius); cursor: pointer; }
.tk-radio input { margin-top: 3px; width: auto; min-height: 0; }
.tk-radio strong { display: block; font-size: .9rem; }
.tk-radio span { color: var(--tk-muted); font-size: .8rem; }
.tk-checkout-section { margin-bottom: 30px; }
.tk-checkout-section h2 { font-size: 1.2rem; margin-bottom: 12px; }
.tk-order-line { display: flex; justify-content: space-between; gap: 14px; font-size: .88rem; }
.tk-order-lines { display: grid; gap: 10px; }
.tk-notice { border: 1px solid var(--tk-border); background: var(--tk-surface); padding: 14px 16px; border-radius: var(--tk-radius); margin-bottom: 18px; font-size: .88rem; }
.tk-notice--error { border-color: #d6aaa1; background: #fbf0ee; color: #7d2d1e; }
.tk-footer { border-top: 1px solid var(--tk-border); padding: clamp(40px, 6vw, 74px) 0 30px; margin-top: 24px; }
.tk-footer-grid { display: grid; grid-template-columns: 1.5fr repeat(3, minmax(0, 1fr)); gap: 30px; }
@media (max-width: 760px) { .tk-footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .tk-footer-grid { grid-template-columns: 1fr; } }
.tk-footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 20px; margin: 18px auto; }
.tk-footer-links a { display: inline-block; }
.tk-footer h3 { font-family: var(--tk-font); font-size: .74rem; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 12px; }
.tk-footer a { display: block; color: var(--tk-muted); font-size: .87rem; padding: 4px 0; }
.tk-footer--minimal { text-align: center; }
.tk-footer--minimal .tk-footer-grid { grid-template-columns: 1fr; justify-items: center; }
.tk-footer--statement .tk-footer-grid { grid-template-columns: 1fr; }
.tk-footer--statement .tk-footer-brand { font-family: var(--tk-heading-font); font-size: clamp(2rem, 6vw, 4rem); }
.tk-footer-bottom { display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap; border-top: 1px solid var(--tk-border); margin-top: 36px; padding-top: 18px; font-size: .74rem; color: var(--tk-muted); }
.tk-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
`;

export function createTheme(config: ThemeKitConfig): ThemeDefinition {
  const labels = { ...DEFAULT_LABELS, ...config.labels };
  const columns = config.columns ?? 4;

  function header(ctx: ThemeRenderContext): string {
    const style = config.header ?? "split";
    const logo = ctx.branding.logoUrl
      ? `<img src="${escapeAttr(ctx.branding.logoUrl)}" alt="">`
      : "";
    const nav = ctx.navigation.map((item) =>
      `<a href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>`).join("");
    return `<header class="tk-header tk-header--${style}">
  <div class="tk-container tk-header-inner">
    <a class="tk-brand" href="/">${logo}<span>${escapeHtml(ctx.branding.name)}</span></a>
    <nav class="tk-nav" aria-label="Main navigation">${nav}</nav>
    <div class="tk-actions">
      <a href="/search">Search</a>
      <a href="/cart">${escapeHtml(labels.cart)} <span class="tk-cart-count" data-cart-count>${ctx.cartCount}</span></a>
    </div>
  </div>
</header>`;
  }

  function footer(ctx: ThemeRenderContext): string {
    const style = config.footer ?? "columns";
    const nav = ctx.navigation.map((item) => "<a href=\"" + escapeAttr(item.href) + "\">" + escapeHtml(item.label) + "</a>").join("");
    const pages = ctx.footerPages ?? [];
    const link = (slug: string) => {
      const item = pages.find((page) => page.href === "/pages/" + slug);
      return item ? "<a href=\"" + escapeAttr(item.href) + "\">" + escapeHtml(item.label) + "</a>" : "";
    };
    const service = [link("contact-us"), link("faq"), "<a href=\"/cart\">Your cart</a>"].join("");
    const policies = [link("shipping-policy"), link("returns-refunds"), link("privacy-policy"), link("terms-of-service"), link("payment-policy")].join("");
    const about = link("about-us");
    const brand = style === "statement" ? "<div class=\"tk-footer-brand\"><a href=\"/\">" + escapeHtml(ctx.branding.name) + "</a></div>"
      : "<a class=\"tk-brand\" href=\"/\">" + escapeHtml(ctx.branding.name) + "</a>";
    const brandColumn = "<div>" + brand + "<p class=\"tk-muted\" style=\"margin-top:12px;max-width:38ch\">" +
      escapeHtml(ctx.settings["footer.tagline"] || "Thoughtfully selected, delivered with care.") + "</p>" + about + "</div>";
    const shopColumn = "<div><h3>Shop</h3>" + nav + "<a href=\"/search\">Search</a></div>";
    const serviceColumn = "<div><h3>Customer Service</h3>" + service + "</div>";
    const policyColumn = policies ? "<div><h3>Policies</h3>" + policies + "</div>" : "";
    const bottom = "<div class=\"tk-footer-bottom\"><span>© " + new Date().getUTCFullYear() + " " +
      escapeHtml(ctx.branding.name) + "</span><span>Powered by CloudCart</span></div>";
    if (style === "minimal") {
      const allLinks = pages.map((item) => "<a href=\"" + escapeAttr(item.href) + "\">" + escapeHtml(item.label) + "</a>").join("");
      return "<footer class=\"tk-footer tk-footer--minimal\"><div class=\"tk-container\">" +
        brandColumn + "<nav class=\"tk-footer-links\" aria-label=\"Footer navigation\">" + nav + allLinks + "</nav>" + bottom + "</div></footer>";
    }
    return "<footer class=\"tk-footer" + (style === "statement" ? " tk-footer--statement" : "") +
      "\"><div class=\"tk-container\"><div class=\"tk-footer-grid\">" +
      brandColumn + shopColumn + serviceColumn + policyColumn + "</div>" + bottom + "</div></footer>";
  }

  function layout(ctx: ThemeRenderContext, body: string, announcement?: string): string {
    const bar = announcement ? `<div class="tk-announcement">${escapeHtml(announcement)}</div>` : "";
    return `${bar}${header(ctx)}<main id="main">${body}</main>${footer(ctx)}`;
  }

  function card(product: StorefrontProduct): string {
    const style = config.card ?? "tall";
    const href = `/products/${encodeURIComponent(product.slug)}`;
    const image = product.imageUrl
      ? `<img src="${escapeAttr(product.imageUrl)}" alt="${escapeAttr(product.imageAlt)}" loading="lazy" decoding="async">`
      : "";
    const compare = product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents
      ? `<s class="tk-price-compare">${formatMoney(product.compareAtPriceCents, product.currency)}</s>`
      : "";
    return `<article class="tk-card tk-card--${style}">
  <a class="tk-card-media" href="${escapeAttr(href)}">${image}${!product.inStock ? `<span class="tk-badge">${escapeHtml(labels.soldOut)}</span>` : ""}</a>
  <div class="tk-card-body">
    <h3 class="tk-card-title"><a href="${escapeAttr(href)}">${escapeHtml(product.name)}</a></h3>
    <p class="tk-card-price">${formatMoney(product.priceCents, product.currency)} ${compare}</p>
  </div>
</article>`;
  }

  function grid(products: StorefrontProduct[]): string {
    if (products.length === 0) {
      return `<div class="tk-empty-state"><h2>No products yet</h2><p>Products added in the admin will appear here.</p></div>`;
    }
    return `<div class="tk-grid tk-grid--${columns}">${products.map(card).join("")}</div>`;
  }

  function heroSection(section: PageSection): string {
    const style = config.hero ?? "full";
    const title = str(section, "title", "Welcome");
    const subtitle = str(section, "subtitle");
    const buttonText = str(section, "buttonText");
    const buttonUrl = str(section, "buttonUrl", "/products");
    const image = str(section, "image");
    const copy = `<div class="tk-hero-copy">
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      ${buttonText ? `<p><a class="tk-btn${style === "full" ? " tk-btn--light" : ""}" href="${escapeAttr(buttonUrl)}">${escapeHtml(buttonText)}</a></p>` : ""}
    </div>`;
    if (style === "split" || style === "offset") {
      return `<section class="tk-hero tk-hero--${style}">
        ${style === "split" ? copy : ""}
        <div class="tk-hero-media">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(str(section, "imageAlt"))}" fetchpriority="high">` : ""}</div>
        ${style === "offset" ? copy : ""}
      </section>`;
    }
    if (style === "minimal") {
      return `<section class="tk-hero tk-hero--minimal"><div class="tk-container">${copy}</div></section>`;
    }
    if (style === "stacked") {
      return `<section class="tk-hero tk-hero--stacked"><div class="tk-container">
        <div class="tk-hero-media">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(str(section, "imageAlt"))}" fetchpriority="high">` : ""}</div>
        ${copy}
      </div></section>`;
    }
    return `<section class="tk-hero tk-hero--full">
      ${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(str(section, "imageAlt"))}" fetchpriority="high">` : ""}
      ${copy}
    </section>`;
  }

  function renderSection(section: PageSection, data: HomeData): string {
    const title = str(section, "title");
    switch (section.type) {
      case "hero":
        return heroSection(section);
      case "image-banner": {
        const image = str(section, "image");
        return `<section class="tk-section tk-section--tight"><div class="tk-container">
          <div class="tk-image-text">
            <div class="tk-image-text-media">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(str(section, "imageAlt"))}" loading="lazy">` : ""}</div>
            <div><h2>${escapeHtml(title)}</h2><p class="tk-muted">${escapeHtml(str(section, "text"))}</p>
            ${str(section, "buttonText") ? `<a class="tk-btn" href="${escapeAttr(str(section, "buttonUrl", "/products"))}">${escapeHtml(str(section, "buttonText"))}</a>` : ""}</div>
          </div>
        </div></section>`;
      }
      case "product-grid":
      case "featured-collection": {
        const source = str(section, "source", "featured");
        const limit = Math.max(1, Math.min(24, num(section, "limit", 8)));
        const products = (source === "new" ? data.newArrivals : source === "all" ? data.products : data.featuredProducts).slice(0, limit);
        return `<section class="tk-section"><div class="tk-container">
          ${title ? `<header class="tk-section-heading"><h2>${escapeHtml(title)}</h2>${str(section, "subtitle") ? `<p>${escapeHtml(str(section, "subtitle"))}</p>` : ""}</header>` : ""}
          ${grid(products)}
        </div></section>`;
      }
      case "category-grid": {
        const categories = data.categories.slice(0, Math.max(1, num(section, "limit", 4)));
        if (categories.length === 0) return "";
        return `<section class="tk-section"><div class="tk-container">
          ${title ? `<header class="tk-section-heading"><h2>${escapeHtml(title)}</h2></header>` : ""}
          <div class="tk-category-grid">${categories.map((category) => `
            <a class="tk-category-card" href="/collections/${escapeAttr(category.slug)}">
              <h3>${escapeHtml(category.name)}</h3><span>${category.productCount ?? 0} products</span>
            </a>`).join("")}</div>
        </div></section>`;
      }
      case "image-with-text":
        return `<section class="tk-section"><div class="tk-container">
          <div class="tk-image-text${str(section, "imagePosition") === "right" ? " tk-image-text--reverse" : ""}">
            <div class="tk-image-text-media">${str(section, "image") ? `<img src="${escapeAttr(str(section, "image"))}" alt="${escapeAttr(str(section, "imageAlt"))}" loading="lazy">` : ""}</div>
            <div><h2>${escapeHtml(title)}</h2><div class="tk-muted">${sanitizeHtml(str(section, "text"), { allowImages: true })}</div>
            ${str(section, "buttonText") ? `<p><a class="tk-btn" href="${escapeAttr(str(section, "buttonUrl", "/products"))}">${escapeHtml(str(section, "buttonText"))}</a></p>` : ""}</div>
          </div>
        </div></section>`;
      case "rich-text":
        return `<section class="tk-section"><div class="tk-container"><div class="tk-rich-text">
          ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
          ${sanitizeHtml(str(section, "text"), { allowImages: true })}
        </div></div></section>`;
      case "video-embed": {
        const url = videoEmbedUrl(str(section, "url"));
        if (!url) return "";
        return `<section class="tk-section"><div class="tk-container">
          ${title ? `<header class="tk-section-heading"><h2>${escapeHtml(title)}</h2></header>` : ""}
          <div class="tk-video"><iframe src="${escapeAttr(url)}" title="${escapeAttr(title || "Video")}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
        </div></section>`;
      }
      case "testimonials": {
        const list = itemList(section, "items");
        if (list.length === 0) return "";
        return `<section class="tk-section"><div class="tk-container">
          ${title ? `<header class="tk-section-heading"><h2>${escapeHtml(title)}</h2></header>` : ""}
          <div class="tk-testimonials">${list.slice(0, 6).map((item) => `
            <div class="tk-testimonial">
              <div class="tk-stars">${"★".repeat(Math.max(1, Math.min(5, Number(item.rating) || 5)))}</div>
              <blockquote>${escapeHtml(String(item.quote ?? ""))}</blockquote>
              <cite>${escapeHtml(String(item.name ?? ""))}</cite>
            </div>`).join("")}</div>
        </div></section>`;
      }
      case "faq": {
        const list = itemList(section, "items");
        if (list.length === 0) return "";
        return `<section class="tk-section"><div class="tk-container">
          ${title ? `<header class="tk-section-heading"><h2>${escapeHtml(title)}</h2></header>` : ""}
          <div class="tk-faq">${list.slice(0, 20).map((item) => `
            <details><summary>${escapeHtml(String(item.question ?? ""))}<span>+</span></summary>
            <p>${escapeHtml(String(item.answer ?? ""))}</p></details>`).join("")}</div>
        </div></section>`;
      }
      case "trust-badges": {
        const list = itemList(section, "items");
        if (list.length === 0) return "";
        return `<section class="tk-section tk-section--tight"><div class="tk-container">
          <div class="tk-trust">${list.slice(0, 6).map((item) => `
            <div class="tk-trust-item"><strong>${escapeHtml(String(item.title ?? ""))}</strong><span>${escapeHtml(String(item.text ?? ""))}</span></div>`).join("")}</div>
        </div></section>`;
      }
      case "logo-list": {
        const list = itemList(section, "items");
        if (list.length === 0) return "";
        return `<section class="tk-section tk-section--tight"><div class="tk-container">
          ${title ? `<header class="tk-section-heading"><h2>${escapeHtml(title)}</h2></header>` : ""}
          <div class="tk-logos">${list.slice(0, 10).map((item) => item.image
            ? `<img src="${escapeAttr(String(item.image))}" alt="${escapeAttr(String(item.name ?? "Logo"))}" loading="lazy">`
            : "").join("")}</div>
        </div></section>`;
      }
      case "spacer":
        return `<div style="height:${Math.max(0, Math.min(240, num(section, "height", 40)))}px" aria-hidden="true"></div>`;
      case "divider":
        return `<div class="tk-container"><hr style="border:0;border-top:1px solid var(--tk-border);margin:0"></div>`;
      case "newsletter":
        return `<section class="tk-section"><div class="tk-container"><div class="tk-newsletter">
          <h2>${escapeHtml(title || "Stay in the loop")}</h2>
          <p class="tk-muted">${escapeHtml(str(section, "text", "New arrivals, stories and offers — no spam."))}</p>
          <form data-newsletter-form>
            <label class="tk-sr-only" for="tk-newsletter-email">Email address</label>
            <input id="tk-newsletter-email" type="email" name="email" placeholder="Your email address" required>
            <button class="tk-btn" type="submit">Subscribe</button>
          </form>
          <p class="tk-muted" data-newsletter-message style="margin-top:10px;font-size:.82rem"></p>
        </div></div></section>`;
      case "custom-html":
        return `<section class="tk-section"><div class="tk-container">${sanitizeHtml(str(section, "html"), { allowImages: true })}</div></section>`;
      default:
        return "";
    }
  }

  function collectionToolbar(data: CollectionData, categories: string): string {
    const sortOptions = [["newest", "Newest"], ["price_asc", "Price ↑"], ["price_desc", "Price ↓"], ["name", "A–Z"]]
      .map(([value, label]) => `<option value="${value}"${data.sort === value ? " selected" : ""}>${label}</option>`).join("");
    return `<div class="tk-toolbar">
      ${categories}
      <form method="get" action="${escapeAttr(data.basePath)}">
        <input type="search" name="q" value="${escapeAttr(data.query ?? "")}" placeholder="Search" aria-label="Search products">
        <select name="sort" aria-label="Sort">${sortOptions}</select>
        <button class="tk-btn tk-btn--ghost" type="submit">Apply</button>
      </form>
    </div>`;
  }

  function cartLines(data: CartData): string {
    return data.lines.map((line) => `
      <div class="tk-cart-line">
        <a href="/products/${escapeAttr(line.slug)}">${line.imageUrl ? `<img src="${escapeAttr(line.imageUrl)}" alt="${escapeAttr(line.name)}" loading="lazy">` : ""}</a>
        <div>
          <h3><a href="/products/${escapeAttr(line.slug)}">${escapeHtml(line.name)}</a></h3>
          ${line.variantTitle ? `<p class="tk-muted" style="font-size:.8rem;margin:0">${escapeHtml(line.variantTitle)}</p>` : ""}
          <p class="tk-muted" style="font-size:.82rem;margin:4px 0">${formatMoney(line.unitPriceCents, data.currency)}</p>
          <div class="tk-qty">
            <button type="button" data-qty-step="-1" aria-label="Decrease">−</button>
            <input type="number" min="1" max="99" value="${line.quantity}" data-cart-qty data-item-id="${escapeAttr(line.itemId)}" aria-label="Quantity">
            <button type="button" data-qty-step="1" aria-label="Increase">+</button>
          </div>
        </div>
        <div style="text-align:right">
          <p style="margin:0">${formatMoney(line.totalCents, data.currency)}</p>
          <button type="button" class="tk-btn tk-btn--ghost" style="min-height:auto;padding:4px 0;border:0;background:none;color:var(--tk-muted);text-decoration:underline;font-size:.76rem" data-cart-remove data-item-id="${escapeAttr(line.itemId)}">Remove</button>
        </div>
      </div>`).join("");
  }

  function summary(data: CartData): string {
    return `<aside class="tk-summary">
      <h2 style="font-size:1.2rem">Summary</h2>
      <div class="tk-summary-row"><span>Subtotal</span><span>${formatMoney(data.subtotalCents, data.currency)}</span></div>
      ${data.discountCents > 0 ? `<div class="tk-summary-row"><span>Discount</span><span>−${formatMoney(data.discountCents, data.currency)}</span></div>` : ""}
      <div class="tk-summary-row"><span>Shipping</span><span>${data.shippingCents > 0 ? formatMoney(data.shippingCents, data.currency) : "At checkout"}</span></div>
      <div class="tk-summary-row tk-summary-row--total"><span>Total</span><span>${formatMoney(data.totalCents, data.currency)}</span></div>
      <form class="tk-coupon" data-coupon-form>
        <input name="code" value="${escapeAttr(data.couponCode ?? "")}" placeholder="Discount code" aria-label="Discount code">
        <button class="tk-btn tk-btn--ghost" type="submit">Apply</button>
      </form>
      ${data.error ? `<p class="tk-error" style="font-size:.82rem">${escapeHtml(data.error)}</p>` : ""}
      <a class="tk-btn tk-btn--block" href="/checkout">Checkout</a>
    </aside>`;
  }

  return {
    manifest: config.manifest,
    css: `${KIT_CSS}\n${config.css}`,

    renderHome(ctx, data) {
      const announcement = data.page.sections.find((section) => section.type === "announcement-bar" && section.enabled);
      const sections = data.page.sections.filter((section) =>
        section.enabled && !["announcement-bar", "header", "footer"].includes(section.type));
      const body = sections.length > 0
        ? sections.map((section) => frameSection(section, renderSection(section, data))).join("")
        : `<section class="tk-section"><div class="tk-container">${grid(data.featuredProducts.length > 0 ? data.featuredProducts : data.products)}</div></section>`;
      return layout(ctx, body, announcement ? str(announcement, "text") : ctx.settings.announcement);
    },

    renderProduct(ctx, data) {
      const product = data.product;
      const mainImage = data.images[0]?.url ?? product.imageUrl;
      const compare = product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents
        ? `<s>${formatMoney(product.compareAtPriceCents, product.currency)}</s>` : "";
      const category = data.related.length > 0 ? null : null;
      const variantField = data.variants.length > 0
        ? `<div class="tk-field"><label for="variant">Option</label><select id="variant" data-variant-select>${data.variants.map((variant) =>
          `<option value="${escapeAttr(variant.id)}"${variant.stock <= 0 ? " disabled" : ""}>${escapeHtml(variant.title)} — ${formatMoney(variant.priceCents, product.currency)}</option>`).join("")}</select></div>`
        : "";
      return layout(ctx, `<div class="tk-section"><div class="tk-container">
        <nav class="tk-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/products">${escapeHtml(labels.shop)}</a><span>/</span><span>${escapeHtml(product.name)}</span></nav>
        <div class="tk-pdp tk-pdp--${config.productLayout ?? "split"}">
          <div>
            <div class="tk-pdp-media-main">${mainImage ? `<img src="${escapeAttr(mainImage)}" alt="${escapeAttr(data.images[0]?.alt || product.name)}" fetchpriority="high">` : ""}</div>
            ${data.images.length > 1 ? `<div class="tk-pdp-thumbs">${data.images.slice(0, 6).map((image) => `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.alt)}" loading="lazy">`).join("")}</div>` : ""}
          </div>
          <div class="tk-pdp-info">
            <h1>${escapeHtml(product.name)}</h1>
            <p class="tk-pdp-price">${formatMoney(product.priceCents, product.currency)} ${compare}</p>
            <p class="tk-muted" style="font-size:.84rem">${product.inStock ? "In stock" : `<span class="tk-error">${escapeHtml(labels.soldOut)}</span>`}</p>
            <div style="margin:20px 0">
              ${variantField}
              <div class="tk-field"><label for="quantity">Quantity</label><input id="quantity" type="number" min="1" max="99" value="1" data-quantity-input></div>
              <button class="tk-btn tk-btn--block" type="button" data-add-to-cart data-product-id="${escapeAttr(product.id)}" ${product.inStock ? "" : "disabled"}>${escapeHtml(labels.addToCart)}</button>
              <p class="tk-muted" data-cart-message style="font-size:.82rem;margin-top:8px"></p>
            </div>
            <div class="tk-description">${data.descriptionHtml}</div>
          </div>
        </div>
      </div></div>
      ${data.related.length > 0 ? `<section class="tk-section"><div class="tk-container"><header class="tk-section-heading"><h2>You may also like</h2></header>${grid(data.related)}</div></section>` : ""}`);
    },

    renderCollection(ctx, data) {
      const style = config.collectionLayout ?? "toolbar";
      const chips = data.categories.slice(0, 12).map((category) =>
        `<a class="tk-chip${data.activeCategory === category.slug ? " tk-chip--active" : ""}" href="/collections/${escapeAttr(category.slug)}">${escapeHtml(category.name)}</a>`).join("");
      const allChip = `<a class="tk-chip${data.activeCategory ? "" : " tk-chip--active"}" href="/products">All</a>`;
      const chipsBlock = `<div class="tk-chips">${allChip}${chips}</div>`;
      const toolbar = collectionToolbar(data, chipsBlock);
      const body = `<div class="tk-section"><div class="tk-container">
        <h1>${escapeHtml(data.title)}</h1>
        ${data.description ? `<p class="tk-muted" style="max-width:60ch">${escapeHtml(data.description)}</p>` : ""}
        ${style === "sidebar"
          ? `<div class="tk-collection--sidebar"><aside class="tk-collection-aside">${chipsBlock}</aside><div>${toolbar.replace(chipsBlock, "")}${grid(data.products)}</div></div>`
          : style === "editorial"
            ? `${chipsBlock}<div style="height:20px"></div>${grid(data.products)}`
            : `${toolbar}${grid(data.products)}`}
        ${paginationLinksFor(data)}
      </div></div>`;
      return layout(ctx, body);
    },

    renderCart(ctx, data) {
      if (data.lines.length === 0) {
        return layout(ctx, `<div class="tk-section"><div class="tk-container tk-empty-state">
          <h1>Your cart is empty</h1><p>Find something you love and it will show up here.</p>
          <a class="tk-btn" href="/products">${escapeHtml(labels.continueShopping)}</a>
        </div></div>`);
      }
      return layout(ctx, `<div class="tk-section"><div class="tk-container" data-cart-page>
        <h1>Your cart</h1>
        <p class="tk-muted" data-cart-message></p>
        <div class="tk-cart-layout">
          <div class="tk-cart-lines">${cartLines(data)}</div>
          ${summary(data)}
        </div>
      </div></div>`);
    },

    renderCheckout(ctx, data) {
      const values = data.values ?? {};
      const shippingOptions = data.shippingRates.map((rate) => `
        <label class="tk-radio"><input type="radio" name="shippingRateId" value="${escapeAttr(rate.id)}"${rate.id === values.shippingRateId ? " checked" : ""} required>
        <span><strong>${escapeHtml(rate.name)}</strong><span>${rate.priceCents === 0 ? "Free" : formatMoney(rate.priceCents, data.cart.currency)}</span></span></label>`).join("");
      const paymentOptions = data.paymentMethods.map((method) => `
        <label class="tk-radio"><input type="radio" name="paymentMethod" value="${escapeAttr(method.id)}"${method.id === (values.paymentMethod ?? data.paymentMethods[0]?.id) ? " checked" : ""} required>
        <span><strong>${escapeHtml(method.name)}</strong><span>${escapeHtml(method.description)}</span></span></label>`).join("");
      const countries = data.countries.map((country) =>
        `<option value="${escapeAttr(country.code)}"${(values.country ?? "US") === country.code ? " selected" : ""}>${escapeHtml(country.name)}</option>`).join("");
      return layout(ctx, `<div class="tk-section"><div class="tk-container">
        <h1>Checkout</h1>
        ${data.error ? `<div class="tk-notice tk-notice--error">${escapeHtml(data.error)}</div>` : ""}
        <form method="post" action="/checkout" class="tk-checkout">
          <div>
            <section class="tk-checkout-section"><h2>Contact</h2>
              <div class="tk-form-grid">
                <div class="tk-field tk-field--full"><label for="email">Email</label><input id="email" name="email" type="email" required value="${escapeAttr(values.email ?? "")}"></div>
                <div class="tk-field"><label for="name">Full name</label><input id="name" name="name" required value="${escapeAttr(values.name ?? "")}"></div>
                <div class="tk-field"><label for="phone">Phone</label><input id="phone" name="phone" value="${escapeAttr(values.phone ?? "")}"></div>
              </div>
            </section>
            <section class="tk-checkout-section"><h2>Shipping address</h2>
              <div class="tk-form-grid">
                <div class="tk-field tk-field--full"><label for="line1">Address</label><input id="line1" name="line1" required value="${escapeAttr(values.line1 ?? "")}"></div>
                <div class="tk-field tk-field--full"><label for="line2">Apartment, suite (optional)</label><input id="line2" name="line2" value="${escapeAttr(values.line2 ?? "")}"></div>
                <div class="tk-field"><label for="city">City</label><input id="city" name="city" required value="${escapeAttr(values.city ?? "")}"></div>
                <div class="tk-field"><label for="state">State / Province</label><input id="state" name="state" value="${escapeAttr(values.state ?? "")}"></div>
                <div class="tk-field"><label for="postalCode">Postal code</label><input id="postalCode" name="postalCode" required value="${escapeAttr(values.postalCode ?? "")}"></div>
                <div class="tk-field"><label for="country">Country</label><select id="country" name="country" required>${countries}</select></div>
              </div>
            </section>
            <section class="tk-checkout-section"><h2>Shipping method</h2><div class="tk-radio-list">${shippingOptions}</div></section>
            <section class="tk-checkout-section"><h2>Payment</h2><div class="tk-radio-list">${paymentOptions}</div></section>
            <section class="tk-checkout-section"><h2>Notes</h2>
              <div class="tk-field"><label for="customerNote">Order note (optional)</label><textarea id="customerNote" name="customerNote">${escapeHtml(values.customerNote ?? "")}</textarea></div>
              <input type="hidden" name="couponCode" value="${escapeAttr(data.cart.couponCode ?? "")}">
            </section>
            <button class="tk-btn tk-btn--block" type="submit">Place order</button>
          </div>
          <aside class="tk-summary">
            <h2 style="font-size:1.15rem">Order summary</h2>
            <div class="tk-order-lines">${data.cart.lines.map((line) => `<div class="tk-order-line"><span>${escapeHtml(line.name)} × ${line.quantity}</span><span>${formatMoney(line.totalCents, data.cart.currency)}</span></div>`).join("")}</div>
            <div class="tk-summary-row" style="margin-top:12px"><span>Subtotal</span><span>${formatMoney(data.cart.subtotalCents, data.cart.currency)}</span></div>
            ${data.cart.discountCents > 0 ? `<div class="tk-summary-row"><span>Discount</span><span>−${formatMoney(data.cart.discountCents, data.cart.currency)}</span></div>` : ""}
            <div class="tk-summary-row"><span>Shipping</span><span>${formatMoney(data.cart.shippingCents, data.cart.currency)}</span></div>
            <div class="tk-summary-row tk-summary-row--total"><span>Total</span><span>${formatMoney(data.cart.totalCents, data.cart.currency)}</span></div>
          </aside>
        </form>
      </div></div>`);
    },

    renderContent(ctx, data) {
      const announcement = data.page.sections.find((section) => section.enabled && section.type === "announcement-bar");
      const sections = data.page.sections.filter((section) =>
        section.enabled && !["announcement-bar", "header", "footer"].includes(section.type));
      const body = sections.length
        ? sections.map((section) => frameSection(section, renderSection(section, data))).join("")
        : "<div class=\"tk-section\"><div class=\"tk-container\"><div class=\"tk-rich-text\"><h1>" +
          escapeHtml(data.title) + "</h1>" + data.bodyHtml + "</div></div></div>";
      return layout(ctx, body, announcement ? str(announcement, "text") : undefined);
    },

    renderNotFound(ctx) {
      return layout(ctx, `<div class="tk-section"><div class="tk-container tk-empty-state">
        <h1>Page not found</h1><p>The page you are looking for does not exist.</p>
        <a class="tk-btn" href="/">Back to home</a>
      </div></div>`);
    },
  };
}

function paginationLinksFor(data: CollectionData): string {
  const pages = data.pagination.totalPages;
  if (pages <= 1) return "";
  const separator = data.basePath.includes("?") ? "&" : "?";
  const link = (page: number, label: string, disabled: boolean) => disabled
    ? `<span class="tk-page-link--disabled">${label}</span>`
    : `<a href="${escapeAttr(`${data.basePath}${separator}page=${page}`)}">${label}</a>`;
  return `<nav class="tk-pagination" aria-label="Pagination">
    ${link(Math.max(1, data.pagination.page - 1), "← Previous", data.pagination.page <= 1)}
    <span>Page ${data.pagination.page} of ${pages}</span>
    ${link(Math.min(pages, data.pagination.page + 1), "Next →", data.pagination.page >= pages)}
  </nav>`;
}
