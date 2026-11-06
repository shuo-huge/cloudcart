export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  previewImage: string;
  description: string;
  supportedPages: string[];
  supportedBlocks: string[];
  /** CSS custom properties exposed in the theme editor. */
  designTokens: ThemeToken[];
}

export interface ThemeToken {
  key: string;
  label: string;
  type: "color" | "font" | "length" | "number" | "select";
  default: string;
  options?: Array<{ label: string; value: string }>;
  group?: string;
}

export const STOREFRONT_PAGES = [
  "home",
  "product",
  "collection",
  "search",
  "cart",
  "checkout",
  "page",
  "404",
] as const;

export type StorefrontPage = (typeof STOREFRONT_PAGES)[number];

export const BLOCK_TYPES = [
  "announcement-bar",
  "header",
  "hero",
  "image-banner",
  "product-grid",
  "featured-collection",
  "category-grid",
  "image-with-text",
  "rich-text",
  "video-embed",
  "testimonials",
  "faq",
  "trust-badges",
  "logo-list",
  "spacer",
  "divider",
  "newsletter",
  "footer",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];
