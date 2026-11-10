import { escapeAttr, escapeHtml, jsonForScript, moneyToInput, stripTags, truncate } from "@cloudcart/shared";
import type { ThemeToken } from "@cloudcart/theme-sdk";

export interface DocumentOptions {
  title: string;
  description: string;
  canonicalUrl: string;
  storeName: string;
  locale: string;
  ogType?: "website" | "product";
  ogImage?: string | null;
  noIndex?: boolean;
  themeCss: string;
  tokens: ThemeToken[];
  settings: Record<string, string>;
  body: string;
  assetJs: string;
  assetCss: string | null;
  jsonLd?: unknown[];
}

export function sanitizeCssValue(value: string): string {
  return value.replace(/[;{}<>\\]/g, "").slice(0, 300);
}

export function tokenCss(tokens: ThemeToken[], settings: Record<string, string>): string {
  const declarations = tokens.map((token) => {
    const raw = settings[token.key] ?? token.default;
    return `--t-${token.key}: ${sanitizeCssValue(String(raw))};`;
  });
  return `:root { ${declarations.join(" ")} }`;
}

export function renderDocument(options: DocumentOptions): string {
  const title = truncate(options.title, 70);
  const description = truncate(options.description, 160);
  const jsonLd = (options.jsonLd ?? []).map((entry) =>
    `<script type="application/ld+json">${jsonForScript(entry)}</script>`).join("");
  const variables = tokenCss(options.tokens, options.settings);
  return `<!doctype html>
<html lang="${escapeAttr(options.locale.split("-")[0] ?? "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(description)}">
<link rel="canonical" href="${escapeAttr(options.canonicalUrl)}">
${options.noIndex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">'}
<meta property="og:site_name" content="${escapeAttr(options.storeName)}">
<meta property="og:type" content="${escapeAttr(options.ogType ?? "website")}">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:url" content="${escapeAttr(options.canonicalUrl)}">
${options.ogImage ? `<meta property="og:image" content="${escapeAttr(options.ogImage)}">` : ""}
<meta name="twitter:card" content="${options.ogImage ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
${options.assetCss ? `<link rel="stylesheet" href="${escapeAttr(options.assetCss)}">` : ""}
<style>${variables}</style>
<style>${options.themeCss}</style>
${jsonLd}
</head>
<body>
${options.body}
<script type="module" src="${escapeAttr(options.assetJs)}"></script>
</body>
</html>`;
}

export function productJsonLd(input: {
  name: string;
  description: string;
  slug: string;
  images: string[];
  sku: string | null;
  priceCents: number;
  currency: string;
  inStock: boolean;
  origin: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: truncate(stripTags(input.description), 300),
    image: input.images,
    ...(input.sku ? { sku: input.sku } : {}),
    offers: {
      "@type": "Offer",
      url: `${input.origin}/products/${encodeURIComponent(input.slug)}`,
      priceCurrency: input.currency,
      price: moneyToInput(input.priceCents, input.currency),
      availability: input.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function websiteJsonLd(origin: string, name: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
