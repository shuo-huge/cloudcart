import { expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loadFixtures } from "./fixtures";
import { productArt } from "./screenshot-art";

const OUT_DIR = path.resolve("docs/images/screenshots");
const ADMIN_STATE = path.resolve("e2e/.auth/admin.json");
const VIEWPORT = { width: 1440, height: 1050 };

type Method = "GET" | "POST" | "PUT" | "DELETE";

async function call<T>(
  request: APIRequestContext,
  csrf: string,
  method: Method,
  url: string,
  data?: unknown,
): Promise<T> {
  const response = await request.fetch(url, {
    method,
    headers: { Accept: "application/json", "X-CSRF-Token": csrf },
    data,
    failOnStatusCode: false,
  });
  const text = await response.text();
  expect(response.ok(), `${method} ${url} -> ${response.status()} ${text.slice(0, 600)}`).toBeTruthy();
  const body = JSON.parse(text) as { data?: T };
  return (body.data ?? ({} as T));
}

async function routeDemoArt(route: Route): Promise<void> {
  const url = route.request().url();
  const matched = url.match(/\/seed\/([^/]+)/);
  const seed = matched?.[1] ? decodeURIComponent(matched[1]) : "studio";
  await route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    headers: { "cache-control": "public, max-age=3600" },
    body: productArt(seed),
  });
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page
    .waitForFunction(() => Array.from(document.images).every((image) => image.complete), undefined, { timeout: 5_000 })
    .catch(() => undefined);
}

async function openAdmin(page: Page, suffix: string, readySelector: string): Promise<void> {
  await page.goto(`/admin${suffix}`, { waitUntil: "domcontentloaded" });
  await page.locator(readySelector).first().waitFor({ state: "visible" });
  await settle(page);
}

async function scrollCardIntoView(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().evaluate((element) => {
    const card = element.closest("section.card") ?? element;
    card.scrollIntoView({ block: "start" });
    window.scrollBy(0, -74);
  });
  await page.waitForTimeout(350);
}

async function capture(page: Page, locale: "en" | "zh", name: string): Promise<void> {
  const dir = path.join(OUT_DIR, locale);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.jpg`);
  await page.screenshot({
    path: file,
    type: "jpeg",
    quality: 86,
    animations: "disabled",
    caret: "hide",
  });
  console.log(`[screenshots] ${path.relative(process.cwd(), file)}`);
}

test("captures README screenshots in English and Simplified Chinese", async ({
  request,
  browser,
}) => {
  test.setTimeout(300_000);

  const adminState = await request.storageState();
  const csrf = adminState.cookies.find((cookie) => cookie.name === "cc_csrf")?.value ?? "";
  expect(csrf, "admin session is missing its CSRF cookie").toBeTruthy();
  const fixtures = loadFixtures();

  /* ------------------------------------------------------------------ */
  /* Demo store data                                                     */
  /* ------------------------------------------------------------------ */

  await call(request, csrf, "PUT", "/api/admin/settings", {
    settings: {
      "store.name": "Lumen & Co.",
      "store.currency": "USD",
      "store.email": "hello@lumen.example",
      "store.phone": "+1 415 555 0142",
      "store.address": "48 Clement Street, San Francisco, CA 94118",
      "seo.title": "Lumen & Co. — Everyday objects, considered",
      "seo.description": "A small collection of useful, quietly made pieces for the home.",
      "tax.default_rate_bps": "825",
      "tax.default_name": "Sales tax",
      "tax.included": "0",
    },
  });

  await call(request, csrf, "POST", "/api/admin/plugins/admin-i18n/enable", {});
  await call(request, csrf, "PUT", "/api/admin/plugins/admin-i18n/settings", {
    settings: { defaultLocale: "en", showSwitcher: "1" },
  });

  await call(request, csrf, "PUT", "/api/admin/media/storage", {
    defaultProvider: "jsdelivr",
    jsdelivr: {
      owner: "lumen-studio",
      repo: "cloudcart-media",
      branch: "main",
      path: "products",
      token: "github_pat_readme_screenshot_demo",
    },
  });

  const categoryNames = ["Bags", "Lighting", "Home", "Accessories"];
  const categoryIds: string[] = [];
  for (const name of categoryNames) {
    const category = await call<{ id: string }>(request, csrf, "POST", "/api/admin/categories", { name });
    categoryIds.push(category.id);
  }

  interface ProductSpec {
    name: string;
    slug: string;
    description: string;
    price: string;
    compareAtPrice?: string;
    stock: number;
    category: number;
    featured: boolean;
    seeds: string[];
  }

  const products: ProductSpec[] = [
    {
      name: "Ridge Canvas Tote",
      slug: "ridge-canvas-tote",
      description: "Waxed 18 oz canvas, vegetable-tanned leather handles and an interior zip pocket. Built to carry the week.",
      price: "58.00",
      stock: 24,
      category: 0,
      featured: true,
      seeds: ["tote-1", "tote-2", "tote-3"],
    },
    {
      name: "Halo Table Lamp",
      slug: "halo-table-lamp",
      description: "A warm, dimmable pool of light in a hand-finished stoneware base with a linen shade.",
      price: "129.00",
      compareAtPrice: "149.00",
      stock: 12,
      category: 1,
      featured: true,
      seeds: ["lamp-1", "lamp-2"],
    },
    {
      name: "Linen Throw — Oat",
      slug: "linen-throw-oat",
      description: "Stonewashed European linen with a hand-knotted fringe. Light enough for summer, warm enough for winter.",
      price: "74.00",
      stock: 31,
      category: 2,
      featured: true,
      seeds: ["throw-1", "throw-2"],
    },
    {
      name: "Arc Ceramic Vase",
      slug: "arc-ceramic-vase",
      description: "Wheel-thrown stoneware in a soft matte glaze. Each piece varies slightly in tone and profile.",
      price: "42.00",
      stock: 18,
      category: 2,
      featured: true,
      seeds: ["vase-1", "vase-2"],
    },
    {
      name: "Field Notes Journal",
      slug: "field-notes-journal",
      description: "A compact cloth-bound notebook with 160 pages of fountain-pen-friendly paper and a lay-flat spine.",
      price: "18.00",
      stock: 64,
      category: 3,
      featured: false,
      seeds: ["journal-1", "journal-2"],
    },
    {
      name: "Studio Apron",
      slug: "studio-apron",
      description: "Heavy cotton twill with cross-back straps, deep pockets and a reinforced hem for daily work.",
      price: "64.00",
      stock: 15,
      category: 0,
      featured: false,
      seeds: ["apron-1", "apron-2"],
    },
  ];

  const productIds: Record<string, string> = {};
  for (const spec of products) {
    const product = await call<{ id: string }>(request, csrf, "POST", "/api/admin/products", {
      name: spec.name,
      slug: spec.slug,
      description: spec.description,
      status: "active",
      type: "simple",
      price: spec.price,
      compareAtPrice: spec.compareAtPrice ?? null,
      sku: spec.slug.toUpperCase().slice(0, 24),
      stock: spec.stock,
      manageStock: true,
      featured: spec.featured,
      seoTitle: spec.name,
      seoDescription: spec.description.slice(0, 160),
      categoryIds: [categoryIds[spec.category]!],
      tags: ["lumen", "home", "everyday"],
      variants: [],
    });
    productIds[spec.slug] = product.id;
    for (const seed of spec.seeds) {
      const media = await call<{ id: string }>(request, csrf, "POST", "/api/admin/media/external", {
        url: `https://picsum.photos/seed/${seed}/900/900`,
        alt: `${spec.name} product photo`,
      });
      await call(request, csrf, "POST", `/api/admin/products/${product.id}/images`, {
        mediaId: media.id,
        alt: spec.name,
      });
    }
  }

  // Remove the generic product created by the deterministic E2E setup.
  await call(request, csrf, "DELETE", `/api/admin/products/${fixtures.productId}`);

  await call(request, csrf, "PUT", "/api/admin/pages/home/draft", {
    document: {
      version: 1,
      page: "home",
      sections: [
        {
          id: "home-announcement",
          type: "announcement-bar",
          enabled: true,
          settings: { text: "Complimentary shipping on orders over $75" },
        },
        {
          id: "home-hero",
          type: "hero",
          enabled: true,
          settings: {
            title: "Everyday objects, considered.",
            subtitle: "A small collection of useful pieces, made to be used rather than stored.",
            buttonText: "Shop the collection",
            buttonUrl: "/products",
          },
        },
        {
          id: "home-grid",
          type: "product-grid",
          enabled: true,
          settings: { title: "New arrivals", subtitle: "Quietly made for daily life.", source: "featured", limit: 6 },
        },
      ],
    },
  });
  await call(request, csrf, "POST", "/api/admin/pages/home/publish", {});

  /* ------------------------------------------------------------------ */
  /* Orders placed through the real storefront checkout                   */
  /* ------------------------------------------------------------------ */

  const orderSpecs = [
    {
      slug: "ridge-canvas-tote",
      email: "maya.chen@example.com",
      name: "Maya Chen",
      line1: "18 Linden Street",
      city: "San Francisco",
      state: "CA",
      postalCode: "94102",
      confirm: true,
      ship: false,
    },
    {
      slug: "halo-table-lamp",
      email: "jonas.reed@example.com",
      name: "Jonas Reed",
      line1: "220 Mercer Street",
      city: "New York",
      state: "NY",
      postalCode: "10012",
      confirm: true,
      ship: true,
    },
    {
      slug: "linen-throw-oat",
      email: "priya.nair@example.com",
      name: "Priya Nair",
      line1: "9 Elm Court",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      confirm: false,
      ship: false,
    },
  ];

  for (const order of orderSpecs) {
    const guest = await browser.newContext({ viewport: { width: 1360, height: 880 }, locale: "en-US" });
    await guest.route("https://picsum.photos/**", routeDemoArt);
    const guestPage = await guest.newPage();
    await guestPage.goto(`/products/${order.slug}`);
    await guestPage.locator("[data-add-to-cart]:not([data-sticky-add-to-cart])").click();
    await expect(guestPage.locator(".cc-cart-count").first()).toHaveText("1");

    await guestPage.goto("/checkout");
    await guestPage.locator('input[name="email"]').fill(order.email);
    await guestPage.locator('input[name="name"]').fill(order.name);
    await guestPage.locator('input[name="line1"]').fill(order.line1);
    await guestPage.locator('input[name="city"]').fill(order.city);
    await guestPage.locator('input[name="state"]').fill(order.state);
    await guestPage.locator('input[name="postalCode"]').fill(order.postalCode);
    await expect(guestPage.locator('select[name="country"]')).toHaveValue("US");
    await guestPage.getByRole("button", { name: "Place order" }).click();
    await expect(guestPage).toHaveURL(/\/orders\//);
    await expect(guestPage.locator("body")).toContainText("Thank you");
    await guest.close();

    const list = await call<{ items: Array<{ id: string; email: string }> }>(
      request,
      csrf,
      "GET",
      `/api/admin/orders?perPage=20&q=${encodeURIComponent(order.email)}`,
    );
    const created = list.items.find((item) => item.email === order.email);
    expect(created, `order for ${order.email} was not created`).toBeTruthy();
    if (!created) continue;

    if (order.confirm) {
      await call(request, csrf, "POST", `/api/admin/orders/${created.id}/confirm-payment`, {
        note: "Bank transfer received",
      });
    }
    if (order.ship) {
      await call(request, csrf, "POST", `/api/admin/orders/${created.id}/shipping`, {
        carrier: "UPS",
        trackingNumber: "1Z999AA10123456784",
        trackingUrl: "https://www.ups.com/track",
      });
      await call(request, csrf, "POST", `/api/admin/orders/${created.id}/status`, { status: "shipped" });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Capture both locales                                                */
  /* ------------------------------------------------------------------ */

  const toteId = productIds["ridge-canvas-tote"]!;
  const captureSet: Array<{ name: string; path: string; ready: string; scroll?: string }> = [
    { name: "dashboard", path: "/", ready: ".stats-grid" },
    { name: "products", path: "/products", ready: ".product-cell" },
    { name: "product-media", path: `/products/${toteId}`, ready: ".media-grid", scroll: ".media-grid" },
    { name: "orders", path: "/orders", ready: "table tbody tr" },
    { name: "page-builder", path: "/pages/home/edit", ready: ".editor-three" },
    { name: "settings-media", path: "/settings", ready: ".settings-subcard", scroll: ".settings-subcard" },
  ];

  const contexts: Record<"en" | "zh", BrowserContext> = {
    en: await browser.newContext({ storageState: ADMIN_STATE, viewport: VIEWPORT, locale: "en-US" }),
    zh: await browser.newContext({ storageState: ADMIN_STATE, viewport: VIEWPORT, locale: "zh-CN" }),
  };
  for (const adminContext of Object.values(contexts)) {
    await adminContext.route("https://picsum.photos/**", routeDemoArt);
  }

  for (const locale of ["en", "zh"] as const) {
    const adminPage = await contexts[locale].newPage();
    await adminPage.goto("/admin/", { waitUntil: "domcontentloaded" });
    await adminPage.locator(".sidebar").waitFor({ state: "visible" });
    await adminPage.evaluate((value) => {
      if (value === "en") window.localStorage.removeItem("cloudcart.admin.locale");
      else window.localStorage.setItem("cloudcart.admin.locale", value === "zh" ? "zh-CN" : value);
    }, locale);
    await adminPage.reload({ waitUntil: "domcontentloaded" });
    await adminPage.locator(".sidebar").waitFor({ state: "visible" });
    if (locale === "zh") {
      await expect(adminPage.locator(".sidebar")).toContainText("商品");
    } else {
      await expect(adminPage.locator(".sidebar")).toContainText("Products");
    }

    for (const shot of captureSet) {
      await openAdmin(adminPage, shot.path, shot.ready);
      if (locale === "zh") {
        await expect(adminPage.locator(".sidebar")).toContainText("商品");
      } else {
        await expect(adminPage.locator(".sidebar")).toContainText("Products");
      }
      if (shot.name === "page-builder") {
        await adminPage.locator("iframe.preview-iframe").waitFor({ state: "visible" });
        await adminPage.waitForTimeout(1_000);
      }
      if (shot.scroll) await scrollCardIntoView(adminPage, shot.scroll);
      await settle(adminPage);
      await capture(adminPage, locale, shot.name);
    }
    await adminPage.close();
  }

  await contexts.en.close();
  await contexts.zh.close();
});
