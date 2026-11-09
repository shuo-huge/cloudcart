import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";

const BASE = "https://example.com";
const OWNER = {
  email: "owner@example.com",
  password: "Sup3rSecret!",
  name: "Store Owner",
  storeName: "Test Store",
  currency: "USD",
};

const jar = new Map<string, string>();

function cookieHeader(): string {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function captureCookies(response: Response): void {
  const cookies = response.headers.getSetCookie();
  for (const cookie of cookies) {
    const pair = cookie.split(";")[0] ?? "";
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index);
    const value = decodeURIComponent(pair.slice(index + 1));
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (jar.size > 0 && !headers.has("Cookie")) headers.set("Cookie", cookieHeader());
  const response = await SELF.fetch(BASE + path, { ...init, headers, redirect: init.redirect ?? "manual" });
  captureCookies(response);
  return response;
}

async function json(path: string, method: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function csrfHeaders(): Record<string, string> {
  return { "X-CSRF-Token": jar.get("cc_csrf") ?? "" };
}

async function ensureSession(): Promise<void> {
  const statusRes = await request("/api/setup/status");
  const status = (await statusRes.json()) as { installed: boolean };
  if (!status.installed) {
    const res = await json("/api/admin/setup", "POST", {
      setupToken: "test-setup-token-123456",
      ...OWNER,
    });
    expect(res.status).toBe(200);
    return;
  }
  const res = await json("/api/admin/login", "POST", {
    email: OWNER.email,
    password: OWNER.password,
  });
  expect(res.status).toBe(200);
}

async function createProduct(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await json("/api/admin/products", "POST", {
    name: "Linen Shirt",
    description: "A soft linen shirt.",
    status: "active",
    type: "simple",
    price: "25.00",
    stock: 10,
    manageStock: true,
    featured: true,
    tags: ["summer"],
    categoryIds: [],
    variants: [],
    ...overrides,
  }, csrfHeaders());
  expect(res.status).toBe(201);
  const body = (await res.json()) as { data: { id: string } };
  return body.data.id;
}

describe("CloudCart Milestone 1", () => {
  it("initialises the store and authenticates the owner", async () => {
    await ensureSession();
    const me = await request("/api/admin/me");
    expect(me.status).toBe(200);
    const body = (await me.json()) as { admin: { email: string }; csrfToken: string };
    expect(body.admin.email).toBe(OWNER.email);
    expect(body.csrfToken).toBeTruthy();
  });

  it("rejects unauthenticated admin access and missing CSRF tokens", async () => {
    await ensureSession();
    const saved = new Map(jar);
    jar.clear();
    const unauthorised = await request("/api/admin/dashboard");
    expect(unauthorised.status).toBe(401);
    for (const [key, value] of saved) jar.set(key, value);

    const missingCsrf = await json("/api/admin/products", "POST", { name: "No CSRF" });
    expect(missingCsrf.status).toBe(403);
    const error = (await missingCsrf.json()) as { error: { code: string } };
    expect(error.error.code).toBe("csrf_failed");
  });

  it("runs product → cart → checkout → manual payment end to end", async () => {
    await ensureSession();
    const productId = await createProduct();

    const adminProducts = await request("/api/admin/products");
    expect(adminProducts.status).toBe(200);
    const list = (await adminProducts.json()) as { data: { items: Array<{ id: string; slug: string }> } };
    expect(list.data.items.some((item) => item.id === productId)).toBe(true);

    // Storefront SSR must contain crawlable product information.
    const productPage = await request("/products/linen-shirt");
    expect(productPage.status).toBe(200);
    const html = await productPage.text();
    expect(html).toContain("Linen Shirt");
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"Product"');
    expect(html).toContain("A soft linen shirt.");

    // Add to cart through the public API.
    const add = await json("/api/cart/items", "POST", { productId, quantity: 2 });
    expect(add.status).toBe(200);
    const addBody = (await add.json()) as { cart: { itemCount: number; subtotalCents: number } };
    expect(addBody.cart.itemCount).toBe(2);
    expect(addBody.cart.subtotalCents).toBe(5000);

    const cart = await request("/api/cart");
    const cartBody = (await cart.json()) as { cart: { lines: Array<{ itemId: string; quantity: number }> } };
    expect(cartBody.cart.lines[0]?.quantity).toBe(2);

    // Checkout as a guest.
    const form = new URLSearchParams({
      email: "buyer@example.com",
      name: "Buyer One",
      phone: "+1 555 0100",
      line1: "1 Market Street",
      line2: "",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US",
      paymentMethod: "manual",
      customerNote: "Please pack carefully.",
    });
    const checkout = await request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    expect(checkout.status).toBe(303);
    const location = checkout.headers.get("location");
    expect(location).toMatch(/^\/orders\//);

    const confirmation = await request(location!);
    expect(confirmation.status).toBe(200);
    const confirmationHtml = await confirmation.text();
    expect(confirmationHtml).toContain("Thank you");
    expect(confirmationHtml).toContain("Order");

    // Verify persisted state and stock reservation.
    const database = new Database((env as unknown as { DB: D1Database }).DB);
    const order = await database.first<{
      id: string;
      status: string;
      payment_status: string;
      total_cents: number;
      email: string;
    }>("SELECT id, status, payment_status, total_cents, email FROM orders ORDER BY created_at DESC LIMIT 1");
    expect(order).not.toBeNull();
    expect(order!.status).toBe("awaiting_manual_payment");
    expect(order!.payment_status).toBe("pending");
    expect(order!.total_cents).toBe(5000);
    const product = await database.first<{ stock: number }>("SELECT stock FROM products WHERE id = ?", [productId]);
    expect(product?.stock).toBe(8);

    // The cart is emptied after checkout.
    const emptyCart = await request("/api/cart");
    const emptyBody = (await emptyCart.json()) as { cart: { itemCount: number } };
    expect(emptyBody.cart.itemCount).toBe(0);

    // Administrator confirms the manual payment.
    const confirm = await json(`/api/admin/orders/${order!.id}/confirm-payment`, "POST", {
      note: "Bank transfer received.",
    }, csrfHeaders());
    expect(confirm.status).toBe(200);

    const paid = await database.first<{ status: string; payment_status: string; paid_at: string | null }>(
      "SELECT status, payment_status, paid_at FROM orders WHERE id = ?",
      [order!.id],
    );
    expect(paid?.status).toBe("paid");
    expect(paid?.payment_status).toBe("paid");
    expect(paid?.paid_at).toBeTruthy();

    const transaction = await database.first<{ plugin_id: string; amount_cents: number }>(
      "SELECT plugin_id, amount_cents FROM payment_transactions WHERE order_id = ?",
      [order!.id],
    );
    expect(transaction?.plugin_id).toBe("manual");
    expect(transaction?.amount_cents).toBe(5000);

    // Manual fulfilment details and customer visibility.
    const shipment = await json(`/api/admin/orders/${order!.id}/shipping`, "POST", {
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
    }, csrfHeaders());
    expect(shipment.status).toBe(200);
    const shipped = await json(`/api/admin/orders/${order!.id}/status`, "POST", { status: "shipped" }, csrfHeaders());
    expect(shipped.status).toBe(200);
    const trackingPage = await (await request(location!)).text();
    expect(trackingPage).toContain("1Z999AA10123456784");
    const trackingRow = await database.first<{ tracking_number: string; shipping_carrier: string }>(
      "SELECT tracking_number, shipping_carrier FROM orders WHERE id = ?",
      [order!.id],
    );
    expect(trackingRow?.tracking_number).toBe("1Z999AA10123456784");
    expect(trackingRow?.shipping_carrier).toBe("UPS");
  });

  it("lists and switches all eight bundled themes without touching catalog data", async () => {
    await ensureSession();
    const productId = await createProduct({ name: "Theme Test Lamp", slug: "theme-test-lamp" });
    const themesResponse = await request("/api/admin/themes");
    expect(themesResponse.status).toBe(200);
    const themes = (await themesResponse.json()) as { data: Array<{ id: string; bundled: boolean }> };
    expect(themes.data.length).toBeGreaterThanOrEqual(8);
    expect(themes.data.every((theme) => theme.bundled)).toBe(true);

    for (const [themeId, marker] of [
      ["electronics", "#38e1ff"],
      ["sports", "Impact"],
      ["beauty", "#c26b7a"],
      ["default", "cc-product-card"],
    ] as Array<[string, string]>) {
      const activate = await json(`/api/admin/themes/${themeId}/activate`, "POST", {}, csrfHeaders());
      expect(activate.status).toBe(200);
      const home = await request("/");
      const html = await home.text();
      expect(html).toContain(marker);
      expect(html).toContain("Theme Test Lamp");
    }

    const product = await request(`/api/admin/products/${productId}`);
    expect(product.status).toBe(200);
  });

  it("edits, previews and publishes the home page while drafts stay private", async () => {
    await ensureSession();
    const pageResponse = await request("/api/admin/pages/home");
    expect(pageResponse.status).toBe(200);
    const pageData = (await pageResponse.json()) as {
      data: { draft: { version: number; page: string; sections: unknown[] }; versions: unknown[] };
    };
    expect(pageData.data.draft).toBeTruthy();

    const document = {
      version: 1,
      page: "home",
      sections: [
        { id: "announcement-1", type: "announcement-bar", enabled: true, settings: { text: "Editor smoke announcement" } },
        {
          id: "hero-1",
          type: "hero",
          enabled: true,
          settings: {
            title: "Editorial Hero Title",
            subtitle: "Draft only",
            buttonText: "Shop",
            buttonUrl: "/products",
            background: "#f5f0e8",
            align: "center",
            paddingTop: 20,
          },
        },
      ],
    };

    const save = await json("/api/admin/pages/home/draft", "PUT", { document }, csrfHeaders());
    expect(save.status).toBe(200);

    const draftHome = await (await request("/")).text();
    expect(draftHome).not.toContain("Editorial Hero Title");

    const preview = await request("/api/admin/pages/home/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ document }),
    });
    expect(preview.status).toBe(200);
    const previewHtml = await preview.text();
    expect(previewHtml).toContain("Editorial Hero Title");
    expect(previewHtml).toContain("background-color:#f5f0e8");

    const scriptDraft = {
      version: 1,
      page: "home",
      sections: [
        { id: "bad-1", type: "custom-html", enabled: true, settings: { html: "<script>alert(1)</script>" } },
      ],
    };
    const rejected = await json("/api/admin/pages/home/draft", "PUT", { document: scriptDraft }, csrfHeaders());
    expect(rejected.status).toBe(400);

    const publish = await json("/api/admin/pages/home/publish", "POST", {}, csrfHeaders());
    expect(publish.status).toBe(200);
    const published = (await publish.json()) as { data: { version: number } };
    expect(published.data.version).toBeGreaterThan(0);

    const publicHome = await (await request("/")).text();
    expect(publicHome).toContain("Editorial Hero Title");
    expect(publicHome).toContain("Editor smoke announcement");

    const laterDraft = {
      version: 1,
      page: "home",
      sections: [
        { id: "hero-2", type: "hero", enabled: true, settings: { title: "Unpublished Later Draft" } },
      ],
    };
    await json("/api/admin/pages/home/draft", "PUT", { document: laterDraft }, csrfHeaders());
    const stillPublished = await (await request("/")).text();
    expect(stillPublished).toContain("Editorial Hero Title");
    expect(stillPublished).not.toContain("Unpublished Later Draft");
  });

  it("restores an older page version into the draft without changing the live page", async () => {
    await ensureSession();
    const versionA = {
      version: 1,
      page: "home",
      sections: [
        { id: "restore-a", type: "hero", enabled: true, settings: { title: "Restored Version A" } },
      ],
    };
    const versionB = {
      version: 1,
      page: "home",
      sections: [
        { id: "restore-b", type: "hero", enabled: true, settings: { title: "Published Version B" } },
      ],
    };

    await json("/api/admin/pages/home/draft", "PUT", { document: versionA }, csrfHeaders());
    const firstPublish = await json("/api/admin/pages/home/publish", "POST", {}, csrfHeaders());
    expect(firstPublish.status).toBe(200);
    const a = ((await firstPublish.json()) as { data: { version: number } }).data.version;

    await json("/api/admin/pages/home/draft", "PUT", { document: versionB }, csrfHeaders());
    const secondPublish = await json("/api/admin/pages/home/publish", "POST", {}, csrfHeaders());
    expect(secondPublish.status).toBe(200);
    const b = ((await secondPublish.json()) as { data: { version: number } }).data.version;
    expect(b).toBeGreaterThan(a);
    expect(await (await request("/")).text()).toContain("Published Version B");

    const restored = await json(`/api/admin/pages/home/versions/${a}/restore`, "POST", {}, csrfHeaders());
    expect(restored.status).toBe(200);
    const restoredBody = (await restored.json()) as { data: { version: number; document: unknown } };
    expect(restoredBody.data.version).toBe(a);
    expect(JSON.stringify(restoredBody.data.document)).toContain("Restored Version A");

    // Restoring writes the draft only; the published page and version history are untouched.
    const liveAfterRestore = await (await request("/")).text();
    expect(liveAfterRestore).toContain("Published Version B");
    expect(liveAfterRestore).not.toContain("Restored Version A");

    const pageResponse = await request("/api/admin/pages/home");
    const pageData = (await pageResponse.json()) as {
      data: { draft: { sections: Array<{ settings: { title?: string } }> }; versions: Array<{ version: number }> };
    };
    expect(pageData.data.draft.sections[0]?.settings.title).toBe("Restored Version A");
    expect(pageData.data.versions.some((version) => version.version === a)).toBe(true);

    const republish = await json("/api/admin/pages/home/publish", "POST", {}, csrfHeaders());
    expect(republish.status).toBe(200);
    const c = ((await republish.json()) as { data: { version: number } }).data.version;
    expect(c).toBeGreaterThan(b);
    expect(await (await request("/")).text()).toContain("Restored Version A");

    const missing = await json("/api/admin/pages/home/versions/999999/restore", "POST", {}, csrfHeaders());
    expect(missing.status).toBe(404);

    const created = await json("/api/admin/pages", "POST", { slug: "restore-target", title: "Restore Target" }, csrfHeaders());
    expect(created.status).toBe(201);
    const crossPage = await json(`/api/admin/pages/restore-target/versions/${a}/restore`, "POST", {}, csrfHeaders());
    expect(crossPage.status).toBe(404);
    const crossBody = (await crossPage.json()) as { error: { code: string } };
    expect(crossBody.error.code).toBe("page_version_not_found");

    // Old snapshots remain immutable after the restore and republish.
    const original = await request(`/api/admin/pages/home/versions/${a}`);
    expect(original.status).toBe(200);
    expect(await original.text()).toContain("Restored Version A");
  });

  it("exposes an enable/disable admin language pack plugin", async () => {
    await ensureSession();
    const disable = await json("/api/admin/plugins/admin-i18n/disable", "POST", {}, csrfHeaders());
    expect(disable.status).toBe(200);

    const before = (await (await request("/api/i18n")).json()) as {
      enabled: boolean;
      locales: Array<{ code: string }>;
      dictionaries: Record<string, Record<string, string>>;
      defaultLocale: string;
    };
    expect(before.enabled).toBe(false);
    expect(before.locales.map((locale) => locale.code)).toEqual(["en", "zh-CN"]);
    expect(before.dictionaries).toEqual({});

    const enable = await json("/api/admin/plugins/admin-i18n/enable", "POST", {}, csrfHeaders());
    expect(enable.status).toBe(200);
    const configure = await json("/api/admin/plugins/admin-i18n/settings", "PUT", {
      settings: { defaultLocale: "zh-CN", showSwitcher: "1" },
      secretKeys: [],
    }, csrfHeaders());
    expect(configure.status).toBe(200);

    const after = (await (await request("/api/i18n")).json()) as {
      enabled: boolean;
      defaultLocale: string;
      showSwitcher: boolean;
      locales: Array<{ code: string }>;
      dictionaries: Record<string, Record<string, string>>;
    };
    expect(after.enabled).toBe(true);
    expect(after.defaultLocale).toBe("zh-CN");
    expect(after.showSwitcher).toBe(true);
    expect(after.dictionaries["zh-CN"]?.Products).toBe("商品");
    expect(after.dictionaries["zh-CN"]?.Orders).toBe("订单");
    expect(after.dictionaries["zh-CN"]?.["Sign in"]).toBe("登录");

    const plugins = (await (await request("/api/admin/plugins")).json()) as {
      data: Array<{ id: string; type: string; bundled: boolean; enabled: number }>;
    };
    const languagePlugin = plugins.data.find((plugin) => plugin.id === "admin-i18n");
    expect(languagePlugin).toBeTruthy();
    expect(languagePlugin?.type).toBe("admin");
    expect(languagePlugin?.bundled).toBe(true);
    expect(languagePlugin?.enabled).toBe(1);

    const settings = (await (await request("/api/admin/plugins/admin-i18n/settings")).json()) as {
      data: Record<string, string>;
    };
    expect(settings.data.defaultLocale).toBe("zh-CN");

    const turnOff = await json("/api/admin/plugins/admin-i18n/disable", "POST", {}, csrfHeaders());
    expect(turnOff.status).toBe(200);
    const disabled = (await (await request("/api/i18n")).json()) as {
      enabled: boolean;
      dictionaries: Record<string, Record<string, string>>;
    };
    expect(disabled.enabled).toBe(false);
    expect(disabled.dictionaries).toEqual({});
  });

  it("prevents duplicate checkout and rejects invalid admin payment confirmation", async () => {
    await ensureSession();
    const productId = await createProduct({ name: "Wool Scarf", slug: "wool-scarf", stock: 3 });
    await json("/api/cart/items", "POST", { productId, quantity: 1 });

    const form = new URLSearchParams({
      email: "second@example.com",
      name: "Second Buyer",
      line1: "2 Market Street",
      city: "Austin",
      state: "TX",
      postalCode: "73301",
      country: "US",
      paymentMethod: "manual",
    });
    const first = await request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    expect(first.status).toBe(303);

    const second = await request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    expect(second.status).toBe(302);
    expect(second.headers.get("location")).toBe("/cart");

    const database = new Database((env as unknown as { DB: D1Database }).DB);
    const orderId = await database.first<{ id: string }>(
      "SELECT id FROM orders ORDER BY created_at DESC LIMIT 1",
    );
    const revert = await json(`/api/admin/orders/${orderId!.id}/status`, "POST", { status: "refunded" }, csrfHeaders());
    expect(revert.status).toBe(409);
  });

  it("seeds draft policies, previews content blocks and only links published pages", async () => {
    await ensureSession();
    const listResponse = await request("/api/admin/pages");
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      data: Array<{ slug: string; title: string; published_version: number | null }>;
    };
    for (const slug of ["about-us", "contact-us", "faq", "shipping-policy", "returns-refunds", "privacy-policy", "terms-of-service", "payment-policy"]) {
      const page = listed.data.find((item) => item.slug === slug);
      expect(page).toBeTruthy();
    }

    const newPage = await json("/api/admin/pages", "POST", { title: "Gift Guide", slug: "gift-guide" }, csrfHeaders());
    expect([201, 409]).toContain(newPage.status);
    const draft = {
      version: 1,
      page: "gift-guide",
      sections: [
        { id: "gift-hero", type: "hero", enabled: true, settings: { title: "Gifts for Every Day", subtitle: "Choose a favorite." } },
        { id: "gift-text", type: "rich-text", enabled: true, settings: { title: "Curated gifts", text: "<p>Wonderful ideas for every occasion.</p>" } },
      ],
    };
    const saved = await json("/api/admin/pages/gift-guide/draft", "PUT", { document: draft }, csrfHeaders());
    expect(saved.status).toBe(200);
    const preview = await json("/api/admin/pages/gift-guide/preview", "POST", { document: draft }, csrfHeaders());
    expect(preview.status).toBe(200);
    const previewHtml = await preview.text();
    expect(previewHtml).toContain("Gifts for Every Day");
    expect(previewHtml).toContain("Wonderful ideas for every occasion.");

    const before = await request("/pages/gift-guide");
    expect(before.status).toBe(404);
    const sitemapBefore = await (await request("/sitemap.xml")).text();
    expect(sitemapBefore).not.toContain("/pages/gift-guide");

    const publish = await json("/api/admin/pages/gift-guide/publish", "POST", {}, csrfHeaders());
    expect(publish.status).toBe(200);
    const published = await request("/pages/gift-guide");
    expect(published.status).toBe(200);
    const html = await published.text();
    expect(html).toContain("Gifts for Every Day");
    expect(html).toContain("Wonderful ideas for every occasion.");
    expect(html).toContain("Gift Guide");
    const sitemapAfter = await (await request("/sitemap.xml")).text();
    expect(sitemapAfter).toContain("/pages/gift-guide");
  });

});
