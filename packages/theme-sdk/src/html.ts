import { escapeAttr, escapeHtml, formatMoney } from "@cloudcart/shared";
import type { StorefrontProduct } from "./types";

export function money(cents: number, currency: string): string {
  return escapeHtml(formatMoney(cents, currency));
}

export function productCard(product: StorefrontProduct, basePath = ""): string {
  const href = `${basePath}/products/${encodeURIComponent(product.slug)}`;
  const compare = product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents
    ? `<s class="cc-price-compare">${money(product.compareAtPriceCents, product.currency)}</s>`
    : "";
  const image = product.imageUrl
    ? `<img src="${escapeAttr(product.imageUrl)}" alt="${escapeAttr(product.imageAlt)}" loading="lazy" decoding="async" width="600" height="750">`
    : `<div class="cc-product-placeholder" aria-hidden="true"></div>`;
  return `<article class="cc-product-card">
  <a class="cc-product-media" href="${escapeAttr(href)}">${image}</a>
  <div class="cc-product-info">
    <h3 class="cc-product-title"><a href="${escapeAttr(href)}">${escapeHtml(product.name)}</a></h3>
    <p class="cc-product-price">${money(product.priceCents, product.currency)} ${compare}</p>
    ${product.inStock ? "" : '<p class="cc-product-stock">Sold out</p>'}
  </div>
</article>`;
}

export function discountPercent(product: StorefrontProduct): number | null {
  if (!product.compareAtPriceCents || product.compareAtPriceCents <= product.priceCents) return null;
  return Math.round(((product.compareAtPriceCents - product.priceCents) * 100) / product.compareAtPriceCents);
}

export function stars(rating: number): string {
  const full = Math.round(Math.max(0, Math.min(5, rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export function sectionHeading(title: string, subtitle?: string): string {
  return `<header class="cc-section-heading">
  <h2>${escapeHtml(title)}</h2>
  ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
</header>`;
}

export function paginationLinks(basePath: string, page: number, totalPages: number): string {
  if (totalPages <= 1) return "";
  const link = (target: number, label: string, disabled = false) => {
    if (disabled) return `<span class="cc-page-link cc-page-link--disabled">${label}</span>`;
    const separator = basePath.includes("?") ? "&" : "?";
    return `<a class="cc-page-link" href="${escapeAttr(`${basePath}${separator}page=${target}`)}">${label}</a>`;
  };
  return `<nav class="cc-pagination" aria-label="Pagination">
  ${link(Math.max(1, page - 1), "← Previous", page <= 1)}
  <span class="cc-page-current">Page ${page} of ${totalPages}</span>
  ${link(Math.min(totalPages, page + 1), "Next →", page >= totalPages)}
</nav>`;
}

export function responsiveImage(src: string, alt: string, className = ""): string {
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="${escapeAttr(className)}" loading="lazy" decoding="async">`;
}

const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/;
const SAFE_FONTS: Record<string, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  display: "'Arial Black', Impact, sans-serif",
};
const ALIGNMENTS = new Set(["left", "center", "right"]);

function safeColor(value: unknown): string | null {
  return typeof value === "string" && SAFE_COLOR.test(value.trim()) ? value.trim() : null;
}

function safeNumber(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * Applies the editor's presentation settings (background, colour, spacing,
 * alignment, width, font) around a rendered section. Only allow-listed values
 * are emitted, so page JSON can never inject arbitrary CSS.
 */
export function frameSection(section: { settings: Record<string, unknown> }, inner: string): string {
  if (!inner) return inner;
  const settings = section.settings;
  const styles: string[] = [];
  const background = safeColor(settings.background);
  const textColor = safeColor(settings.textColor);
  const top = safeNumber(settings.paddingTop, 0, 200);
  const bottom = safeNumber(settings.paddingBottom, 0, 200);
  const maxWidth = safeNumber(settings.maxWidth, 320, 1600);
  const align = typeof settings.align === "string" && ALIGNMENTS.has(settings.align) ? settings.align : null;
  const font = typeof settings.font === "string" ? SAFE_FONTS[settings.font] : null;
  if (background) styles.push(`background-color:${background}`);
  if (textColor) styles.push(`color:${textColor}`);
  if (top !== null && top > 0) styles.push(`padding-top:${top}px`);
  if (bottom !== null && bottom > 0) styles.push(`padding-bottom:${bottom}px`);
  if (align) styles.push(`text-align:${align}`);
  if (font) styles.push(`font-family:${font}`);
  if (maxWidth !== null) styles.push(`max-width:${maxWidth}px`, "margin-left:auto", "margin-right:auto");
  if (styles.length === 0) return inner;
  return `<div class="cc-section-frame" style="${escapeAttr(styles.join(";"))}">${inner}</div>`;
}
