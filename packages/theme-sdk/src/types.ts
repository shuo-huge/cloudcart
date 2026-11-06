import type { PageDocument } from "@cloudcart/shared";
import type { ThemeManifest } from "./manifest";

export interface StoreBranding {
  name: string;
  logoUrl: string | null;
  currency: string;
  locale: string;
}

export interface StorefrontProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  imageUrl: string | null;
  imageAlt: string;
  inStock: boolean;
  featured: boolean;
  tags: string[];
}

export interface StorefrontCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  productCount?: number;
}

export interface NavItem {
  label: string;
  href: string;
}

export interface ThemeRenderContext {
  branding: StoreBranding;
  settings: Record<string, string>;
  navigation: NavItem[];
  footerPages?: NavItem[];
  cartCount: number;
  currentPath: string;
}

export interface HomeData {
  page: PageDocument;
  products: StorefrontProduct[];
  categories: StorefrontCategory[];
  featuredProducts: StorefrontProduct[];
  newArrivals: StorefrontProduct[];
}

export interface ProductData {
  product: StorefrontProduct;
  images: Array<{ url: string; alt: string }>;
  variants: Array<{ id: string; title: string; priceCents: number; stock: number }>;
  related: StorefrontProduct[];
  descriptionHtml: string;
  canonicalUrl: string;
  metaTitle: string;
  metaDescription: string;
}

export interface CollectionData {
  title: string;
  description: string;
  products: StorefrontProduct[];
  categories: StorefrontCategory[];
  pagination: { page: number; totalPages: number; total: number };
  basePath: string;
  sort: string;
  activeCategory: string | null;
  query: string | null;
}

export interface CartViewLine {
  productId: string;
  itemId: string;
  variantId: string | null;
  variantTitle?: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  stock: number;
}

export interface CartData {
  lines: CartViewLine[];
  subtotalCents: number;
  currency: string;
  couponCode: string | null;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  error?: string;
}

export interface CheckoutData {
  cart: CartData;
  shippingRates: Array<{ id: string; name: string; priceCents: number }>;
  countries: Array<{ code: string; name: string }>;
  paymentMethods: Array<{ id: string; name: string; description: string }>;
  error?: string;
  values?: Record<string, string>;
}

export interface ContentData extends HomeData {
  title: string;
  bodyHtml: string;
  metaTitle: string;
  metaDescription: string;
}

export interface ThemeDefinition {
  manifest: ThemeManifest;
  /** Extra CSS injected for this theme. Tokens are applied as CSS variables. */
  css: string;
  renderHome(ctx: ThemeRenderContext, data: HomeData): string;
  renderProduct(ctx: ThemeRenderContext, data: ProductData): string;
  renderCollection(ctx: ThemeRenderContext, data: CollectionData): string;
  renderCart(ctx: ThemeRenderContext, data: CartData): string;
  renderCheckout(ctx: ThemeRenderContext, data: CheckoutData): string;
  renderContent(ctx: ThemeRenderContext, data: ContentData): string;
  renderNotFound?(ctx: ThemeRenderContext): string;
}

export interface RenderedPage {
  body: string;
  head?: string;
}
