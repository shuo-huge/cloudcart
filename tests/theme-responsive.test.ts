import { describe, expect, it } from "vitest";
import { createTheme } from "@cloudcart/theme-sdk";
import type { ProductData, ThemeRenderContext } from "@cloudcart/theme-sdk";
import defaultTheme from "@cloudcart/theme-default";

const context: ThemeRenderContext = {
  branding: { name: "Studio Store", logoUrl: null, currency: "USD", locale: "en-US" },
  settings: {},
  navigation: [{ label: "Shop", href: "/products" }, { label: "About", href: "/pages/about-us" }],
  footerPages: [{ label: "Returns", href: "/pages/returns-refunds" }],
  cartCount: 2,
  currentPath: "/products/sample",
};

const productData: ProductData = {
  product: {
    id: "prod_sample",
    slug: "sample",
    name: "Sample Product",
    description: "A useful product.",
    priceCents: 2499,
    compareAtPriceCents: 2999,
    currency: "USD",
    imageUrl: "https://images.example.test/main.jpg",
    imageAlt: "Sample product front",
    inStock: true,
    featured: true,
    tags: [],
  },
  images: [
    { url: "https://images.example.test/main.jpg", alt: "Sample product front" },
    { url: "https://images.example.test/detail.jpg", alt: "Sample product detail" },
  ],
  variants: [],
  related: [],
  descriptionHtml: "<p>Made for everyday use.</p>",
  canonicalUrl: "https://store.example.test/products/sample",
  metaTitle: "Sample Product",
  metaDescription: "A useful product.",
};

describe("responsive theme storefront", () => {
  it("renders an accessible mobile navigation and sticky product purchase bar in shared themes", () => {
    const theme = createTheme({
      manifest: {
        id: "responsive-test",
        name: "Responsive Test",
        version: "1.0.0",
        previewImage: "/preview.svg",
        description: "Test theme",
        supportedPages: ["product"],
        supportedBlocks: [],
        designTokens: [],
      },
      css: "",
      header: "split",
      productLayout: "split",
    });

    const html = theme.renderProduct(context, productData);
    expect(html).toContain('class="tk-skip-link"');
    expect(html).toContain('class="tk-mobile-menu"');
    expect(html).toContain('aria-label="Mobile navigation"');
    expect(html).toContain('data-sticky-product-bar');
    expect(html).toContain('data-sticky-add-to-cart');
    expect(html).toContain('data-product-main-image');
    expect(html).toContain('data-gallery-image');
    expect(theme.css).toContain("@media (max-width: 760px)");
    expect(theme.css).toContain(".tk-mobile-buybar.is-visible");
  });

  it("applies the same mobile purchase and gallery behavior to the Default theme", () => {
    const html = defaultTheme.renderProduct(context, productData);
    expect(html).toContain('class="cc-skip-link"');
    expect(html).toContain('class="cc-mobile-menu"');
    expect(html).toContain('data-sticky-product-bar');
    expect(html).toContain('data-sticky-add-to-cart');
    expect(html).toContain('data-product-main-image');
    expect(html).toContain('data-gallery-image');
    expect(defaultTheme.css).toContain(".cc-mobile-buybar.is-visible");
  });
});
