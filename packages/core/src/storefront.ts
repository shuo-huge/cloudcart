import type { Database } from "@cloudcart/database";
import { sanitizeHtml } from "@cloudcart/security";
import {
  COUNTRIES,
  escapeHtml,
  formatMoney,
  stripTags,
  type PageDocument,
} from "@cloudcart/shared";
import type {
  CartData,
  CheckoutData,
  CollectionData,
  ContentData,
  HomeData,
  NavItem,
  ProductData,
  StorefrontCategory,
  StorefrontProduct,
  ThemeDefinition,
  ThemeRenderContext,
} from "@cloudcart/theme-sdk";
import { getOrCreateCart, loadCart } from "./cart";
import { getCategoryBySlug, listCategories } from "./categories";
import { getPage, getPublishedDocument } from "./pages";
import { getEnabledPaymentMethods } from "./payments";
import { getPublicProductBySlug, listPublicProducts, toPublicVariants, type PublicProduct } from "./products";
import { breadcrumbJsonLd, productJsonLd, websiteJsonLd } from "./seo";
import { getShippingOptions } from "./shipping";
import type { StoreConfig } from "./settings";
import type { CartRow } from "@cloudcart/database";

export interface StorefrontDeps {
  db: Database;
  theme: ThemeDefinition;
  store: StoreConfig;
  settings: Record<string, string>;
  origin: string;
  cartCount: number;
  path: string;
}

export interface StorefrontPage {
  status: number;
  body: string;
  title: string;
  description: string;
  canonicalPath: string;
  ogImage: string | null;
  jsonLd: unknown[];
  noIndex?: boolean;
  redirect?: string;
}

function mediaPath(key: string | null): string | null {
  if (!key) return null;
  return /^https:\/\//i.test(key) ? key : `/media/${key}`;
}

function toStorefrontProduct(row: PublicProduct): StorefrontProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    compareAtPriceCents: row.compare_at_price_cents,
    currency: row.currency,
    imageUrl: mediaPath(row.image_key),
    imageAlt: row.image_alt || row.name,
    inStock: row.manage_stock === 0 || row.stock > 0,
    featured: row.featured === 1,
    tags: row.tags ?? [],
  };
}

function descriptionHtml(value: string): string {
  const cleaned = sanitizeHtml(value, { allowImages: true });
  return cleaned.replace(/\n/g, "<br>");
}

export class Storefront {
  private categories: StorefrontCategory[] = [];
  private ctx: ThemeRenderContext;
  private navigation: NavItem[] = [];
  private loaded = false;

  constructor(private readonly deps: StorefrontDeps) {
    this.ctx = {
      branding: {
        name: deps.store.name,
        logoUrl: deps.store.logo,
        currency: deps.store.currency,
        locale: deps.store.locale,
      },
      settings: deps.settings,
      navigation: [],
      footerPages: [],
      cartCount: deps.cartCount,
      currentPath: deps.path,
    };
  }

  private async loadCategories(): Promise<StorefrontCategory[]> {
    if (this.loaded) return this.categories;
    const rows = await listCategories(this.deps.db);
    this.categories = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      productCount: row.product_count,
    }));
    this.navigation = [
      { label: "Home", href: "/" },
      { label: "Shop", href: "/products" },
      ...this.categories.slice(0, 6).map((category) => ({
        label: category.name,
        href: `/collections/${category.slug}`,
      })),
    ];
    this.ctx.navigation = this.navigation;
    const published = await this.deps.db.all<{ slug: string; title: string }>(
      "SELECT slug, title FROM pages WHERE type = 'content' AND published_version IS NOT NULL ORDER BY title LIMIT 100",
    );
    this.ctx.footerPages = published.map((page) => ({ label: page.title, href: "/pages/" + page.slug }));
    this.loaded = true;
    return this.categories;
  }

  private page(partial: Omit<StorefrontPage, "status"> & { status?: number }): StorefrontPage {
    return { status: partial.status ?? 200, ...partial };
  }

  async home(documentOverride?: PageDocument): Promise<StorefrontPage> {
    await this.loadCategories();
    const db = this.deps.db;
    const document: PageDocument = documentOverride ?? (await getPublishedDocument(db, "home")) ?? {
      version: 1,
      page: "home",
      sections: [],
    };
    const [all, featured, newest] = await Promise.all([
      listPublicProducts(db, { page: 1, perPage: 12, sort: "newest" }),
      listPublicProducts(db, { page: 1, perPage: 8, featured: true, sort: "featured" }),
      listPublicProducts(db, { page: 1, perPage: 8, sort: "newest" }),
    ]);
    const data: HomeData = {
      page: document,
      products: all.items.map(toStorefrontProduct),
      categories: this.categories,
      featuredProducts: featured.items.map(toStorefrontProduct),
      newArrivals: newest.items.map(toStorefrontProduct),
    };
    const body = this.deps.theme.renderHome(this.ctx, data);
    return this.page({
      body,
      title: this.deps.store.seoTitle || this.deps.store.name,
      description: this.deps.store.seoDescription || `Shop ${this.deps.store.name}.`,
      canonicalPath: "/",
      ogImage: null,
      jsonLd: [websiteJsonLd(this.deps.origin, this.deps.store.name)],
    });
  }

  async product(slug: string): Promise<StorefrontPage> {
    await this.loadCategories();
    const detail = await getPublicProductBySlug(this.deps.db, slug);
    if (!detail) return this.notFound();
    const product = detail.product;
    const images = detail.images.map((image) => ({
      url: mediaPath(image.r2_key) ?? "",
      alt: image.alt || product.name,
    }));
    const primary: StorefrontProduct = toStorefrontProduct(product);
    const data: ProductData = {
      product: primary,
      images: images.length > 0 ? images : primary.imageUrl ? [{ url: primary.imageUrl, alt: primary.imageAlt }] : [],
      variants: toPublicVariants(detail.variants).map((variant) => ({
        id: variant.id,
        title: variant.title,
        priceCents: variant.price_cents,
        stock: variant.stock,
      })),
      related: detail.related.map(toStorefrontProduct),
      descriptionHtml: descriptionHtml(product.description),
      canonicalUrl: `${this.deps.origin}/products/${product.slug}`,
      metaTitle: "",
      metaDescription: "",
    };
    const category = detail.categories[0];
    const title = product.seo_title || product.name;
    const description = product.seo_description
      || (product.description ? stripTags(product.description).slice(0, 160) : `Buy ${product.name} at ${this.deps.store.name}.`);
    const jsonLd = [
      productJsonLd({
        name: product.name,
        description: product.description,
        slug: product.slug,
        images: data.images.map((image) => new URL(image.url, this.deps.origin).toString()),
        sku: null,
        priceCents: product.price_cents,
        currency: product.currency,
        inStock: primary.inStock,
        origin: this.deps.origin,
      }),
      breadcrumbJsonLd([
        { name: "Home", url: `${this.deps.origin}/` },
        ...(category ? [{ name: category.name, url: `${this.deps.origin}/collections/${category.slug}` }] : []),
        { name: product.name, url: `${this.deps.origin}/products/${product.slug}` },
      ]),
    ];
    return this.page({
      body: this.deps.theme.renderProduct(this.ctx, data),
      title: product.name,
      description,
      canonicalPath: `/products/${product.slug}`,
      ogImage: images[0] ? new URL(images[0].url, this.deps.origin).toString() : null,
      jsonLd,
    });
  }

  async collection(input: { categorySlug?: string; page?: number; sort?: string; q?: string }): Promise<StorefrontPage> {
    await this.loadCategories();
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const sort = ["newest", "oldest", "price_asc", "price_desc", "name"].includes(input.sort ?? "")
      ? input.sort!
      : "newest";
    let category = null;
    if (input.categorySlug) {
      category = await getCategoryBySlug(this.deps.db, input.categorySlug);
      if (!category) return this.notFound();
    }
    const query = (input.q ?? "").trim();
    const result = await listPublicProducts(this.deps.db, {
      page,
      perPage: 12,
      sort,
      search: query || undefined,
      categorySlug: category?.slug,
    });
    const totalPages = Math.max(1, Math.ceil(result.total / 12));
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (sort !== "newest") params.set("sort", sort);
    const basePath = category
      ? `/collections/${category.slug}${params.size > 0 ? `?${params.toString()}` : ""}`
      : query
        ? `/search?${params.toString()}`
        : `/products${params.size > 0 ? `?${params.toString()}` : ""}`;
    const categoryTitle = category?.seo_title || category?.name;
    const categoryDescription = category?.seo_description || category?.description;
    const data: CollectionData = {
      title: categoryTitle ?? (query ? `Search results for “${query}”` : "All products"),
      description: categoryDescription ?? (query ? `${result.total} products matched your search.` : ""),
      products: result.items.map(toStorefrontProduct),
      categories: this.categories,
      pagination: { page, totalPages, total: result.total },
      basePath,
      sort,
      activeCategory: category?.slug ?? null,
      query: query || null,
    };
    const title = categoryTitle ?? (query ? `Search: ${query}` : "All products");
    return this.page({
      body: this.deps.theme.renderCollection(this.ctx, data),
      title,
      description: descriptionHtml(categoryDescription ?? `Browse ${title} at ${this.deps.store.name}.`).slice(0, 160),
      canonicalPath: basePath.split("?")[0]!,
      ogImage: null,
      jsonLd: [
        breadcrumbJsonLd([
          { name: "Home", url: `${this.deps.origin}/` },
          { name: title, url: `${this.deps.origin}${basePath.split("?")[0]}` },
        ]),
      ],
      noIndex: Boolean(query),
    });
  }

  async search(q: string, page = 1, sort = "newest"): Promise<StorefrontPage> {
    return this.collection({ q, page, sort });
  }

  async cartView(cartToken: string | null): Promise<{ page: StorefrontPage; newToken?: string }> {
    await this.loadCategories();
    const { cart, newToken } = await getOrCreateCart(this.deps.db, cartToken, this.deps.store.currency);
    const view = await loadCart(this.deps.db, cart);
    const data = this.toCartData(view);
    return {
      page: this.page({
        body: this.deps.theme.renderCart(this.ctx, data),
        title: "Your cart",
        description: `Your shopping cart at ${this.deps.store.name}.`,
        canonicalPath: "/cart",
        ogImage: null,
        jsonLd: [],
        noIndex: true,
      }),
      newToken,
    };
  }

  async checkoutView(
    cartToken: string | null,
    values: Record<string, string> = {},
    error?: string,
  ): Promise<{ page: StorefrontPage; newToken?: string }> {
    await this.loadCategories();
    const { cart, newToken } = await getOrCreateCart(this.deps.db, cartToken, this.deps.store.currency);
    const view = await loadCart(this.deps.db, cart, {
      country: values.country ?? "",
      shippingRateId: values.shippingRateId ?? null,
    });
    if (view.lines.length === 0) {
      return {
        page: this.page({
          body: "",
          title: "Checkout",
          description: "",
          canonicalPath: "/checkout",
          ogImage: null,
          jsonLd: [],
          status: 302,
          redirect: "/cart",
        }),
      };
    }
    const shippingRates = await getShippingOptions(this.deps.db, values.country ?? "", view.subtotalCents);
    const paymentMethods = await getEnabledPaymentMethods(this.deps.db);
    const data: CheckoutData = {
      cart: this.toCartData(view),
      shippingRates: shippingRates.map((rate) => ({ id: rate.id, name: rate.name, priceCents: rate.priceCents })),
      countries: COUNTRIES,
      paymentMethods,
      error,
      values: {
        ...values,
        shippingRateId: values.shippingRateId ?? shippingRates[0]?.id ?? "",
      },
    };
    return {
      page: this.page({
        body: this.deps.theme.renderCheckout(this.ctx, data),
        title: "Checkout",
        description: `Secure checkout at ${this.deps.store.name}.`,
        canonicalPath: "/checkout",
        ogImage: null,
        jsonLd: [],
        noIndex: true,
        status: error ? 400 : 200,
      }),
      newToken,
    };
  }

  async content(slug: string, documentOverride?: PageDocument): Promise<StorefrontPage> {
    await this.loadCategories();
    const page = await getPage(this.deps.db, slug);
    if (!page) return this.notFound();
    const document = documentOverride ?? await getPublishedDocument(this.deps.db, slug);
    if (!document) return this.notFound();
    const html = document.sections
      .filter((section) => section.enabled && section.type === "rich-text")
      .map((section) => sanitizeHtml(String(section.settings.text ?? ""), { allowImages: true }))
      .join("\n");
    const requiresCatalog = document.sections.some((section) =>
      section.enabled && ["product-grid", "featured-collection", "category-grid"].includes(section.type));
    let products: StorefrontProduct[] = [];
    let featuredProducts: StorefrontProduct[] = [];
    let newArrivals: StorefrontProduct[] = [];
    if (requiresCatalog) {
      const [all, featured, newest] = await Promise.all([
        listPublicProducts(this.deps.db, { page: 1, perPage: 12, sort: "newest" }),
        listPublicProducts(this.deps.db, { page: 1, perPage: 8, featured: true, sort: "featured" }),
        listPublicProducts(this.deps.db, { page: 1, perPage: 8, sort: "newest" }),
      ]);
      products = all.items.map(toStorefrontProduct);
      featuredProducts = featured.items.map(toStorefrontProduct);
      newArrivals = newest.items.map(toStorefrontProduct);
    }
    const data: ContentData = {
      page: document,
      products,
      categories: this.categories,
      featuredProducts,
      newArrivals,
      title: page.title,
      bodyHtml: html || "<p>This page is being prepared.</p>",
      metaTitle: page.title,
      metaDescription: stripTags(html).slice(0, 160) || page.title,
    };
    return this.page({
      body: this.deps.theme.renderContent(this.ctx, data),
      title: data.metaTitle,
      description: data.metaDescription,
      canonicalPath: "/pages/" + slug,
      ogImage: null,
      jsonLd: [],
    });
  }

  notFound(): StorefrontPage {
    const body = this.deps.theme.renderNotFound
      ? this.deps.theme.renderNotFound(this.ctx)
      : "<h1>Page not found</h1>";
    return this.page({
      status: 404,
      body,
      title: "Page not found",
      description: "The page you are looking for does not exist.",
      canonicalPath: this.deps.path,
      ogImage: null,
      jsonLd: [],
      noIndex: true,
    });
  }

  private toCartData(view: Awaited<ReturnType<typeof loadCart>>): CartData {
    return {
      lines: view.lines.map((line) => ({
        itemId: line.itemId,
        productId: line.productId,
        variantId: line.variantId,
        variantTitle: line.variantTitle,
        name: line.name,
        slug: line.slug,
        imageUrl: mediaPath(line.imageKey),
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        totalCents: line.totalCents,
        stock: line.stock,
      })),
      subtotalCents: view.subtotalCents,
      currency: view.currency,
      couponCode: view.couponCode,
      discountCents: view.discountCents,
      shippingCents: view.shippingCents,
      totalCents: view.totalCents,
      error: view.couponError ?? undefined,
    };
  }
}

export function orderStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatOrderMoney(cents: number, currency: string): string {
  return escapeHtml(formatMoney(cents, currency));
}

export type { CartRow };
