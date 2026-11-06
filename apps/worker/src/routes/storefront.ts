import {
  checkoutSchema,
  countCartItemsByToken,
  createOrderFromCart,
  getOrderByAccessToken,
  getOrderDetail,
  getOrCreateCart,
  isPaymentMethodEnabled,
  loadPaymentRuntimeConfig,
  parseOrderAccessToken,
  resolveRedirect,
  Storefront,
  type OrderDetail,
  type StorefrontPage,
} from "@cloudcart/core";
import { renderDocument } from "@cloudcart/core";
import { loadManualSettings, renderManualInstructions } from "@cloudcart/plugin-manual-payment";
import { escapeHtml, formatDate, formatMoney, HttpError, newId, nowIso } from "@cloudcart/shared";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppContext } from "../env";
import { STOREFRONT_CSS, STOREFRONT_JS } from "../generated/assets";
import {
  cartTokenFromRequest,
  clearCartCookie,
  db,
  loadStorefrontRuntime,
  setCartCookie,
  type StorefrontRuntime,
} from "../lib";
import { getPaymentPlugin } from "../plugin-registry";
import { orderSnapshot, retryPayment } from "./payments";

export const storefrontRoutes = new Hono<AppContext>();

function cacheControl(page: StorefrontPage): string {
  if (page.noIndex || page.status >= 400) return "no-store";
  return "private, max-age=0, must-revalidate";
}

async function sendPage(
  c: Context<AppContext>,
  page: StorefrontPage,
  runtime: StorefrontRuntime,
): Promise<Response> {
  if (page.redirect) {
    return c.redirect(page.redirect, 302);
  }
  const html = renderDocument({
    title: page.title,
    description: page.description,
    canonicalUrl: `${runtime.origin}${page.canonicalPath}`,
    storeName: runtime.store.name,
    locale: runtime.store.locale,
    ogType: page.canonicalPath.startsWith("/products/") ? "product" : "website",
    ogImage: page.ogImage,
    noIndex: page.noIndex,
    themeCss: runtime.theme.css,
    tokens: runtime.theme.manifest.designTokens,
    settings: runtime.settings,
    body: page.body,
    assetJs: STOREFRONT_JS,
    assetCss: STOREFRONT_CSS,
    jsonLd: page.jsonLd,
  });
  c.header("Cache-Control", cacheControl(page));
  c.header("Vary", "Cookie");
  return c.html(html, page.status as 200);
}

async function storefrontFor(c: Context<AppContext>) {
  const runtime = await loadStorefrontRuntime(c);
  const token = cartTokenFromRequest(c.req.raw);
  const cartCount = await countCartItemsByToken(runtime.db, token);
  const storefront = new Storefront({
    db: runtime.db,
    theme: runtime.theme,
    store: runtime.store,
    settings: runtime.settings,
    origin: runtime.origin,
    cartCount,
    path: c.req.path,
  });
  return { storefront, runtime, token };
}

storefrontRoutes.get("/", async (c) => {
  const { storefront, runtime } = await storefrontFor(c);
  return sendPage(c, await storefront.home(), runtime);
});

storefrontRoutes.get("/products", async (c) => {
  const { storefront, runtime } = await storefrontFor(c);
  const page = Number(c.req.query("page") ?? "1");
  return sendPage(c, await storefront.collection({
    page: Number.isFinite(page) ? page : 1,
    sort: c.req.query("sort"),
    q: c.req.query("q"),
  }), runtime);
});

storefrontRoutes.get("/products/:slug", async (c) => {
  const { storefront, runtime } = await storefrontFor(c);
  return sendPage(c, await storefront.product(c.req.param("slug")), runtime);
});

storefrontRoutes.get("/collections/:slug", async (c) => {
  const { storefront, runtime } = await storefrontFor(c);
  const page = Number(c.req.query("page") ?? "1");
  return sendPage(c, await storefront.collection({
    categorySlug: c.req.param("slug"),
    page: Number.isFinite(page) ? page : 1,
    sort: c.req.query("sort"),
    q: c.req.query("q"),
  }), runtime);
});

storefrontRoutes.get("/search", async (c) => {
  const { storefront, runtime } = await storefrontFor(c);
  const page = Number(c.req.query("page") ?? "1");
  const query = c.req.query("q") ?? "";
  if (!query.trim()) {
    return sendPage(c, await storefront.collection({ page: 1 }), runtime);
  }
  return sendPage(c, await storefront.search(query, Number.isFinite(page) ? page : 1, c.req.query("sort")), runtime);
});

storefrontRoutes.get("/cart", async (c) => {
  const { storefront, runtime, token } = await storefrontFor(c);
  const result = await storefront.cartView(token);
  if (result.newToken) setCartCookie(c, result.newToken);
  return sendPage(c, result.page, runtime);
});

storefrontRoutes.get("/checkout", async (c) => {
  const { storefront, runtime, token } = await storefrontFor(c);
  const result = await storefront.checkoutView(token);
  if (result.newToken) setCartCookie(c, result.newToken);
  return sendPage(c, result.page, runtime);
});

storefrontRoutes.post("/checkout", async (c) => {
  const runtime = await loadStorefrontRuntime(c);
  const form = await c.req.raw.formData();
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  const token = cartTokenFromRequest(c.req.raw);
  const parsed = checkoutSchema.safeParse(values);
  const { storefront } = await storefrontFor(c);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Please check the checkout form.";
    const result = await storefront.checkoutView(token, values, message);
    if (result.newToken) setCartCookie(c, result.newToken);
    return sendPage(c, { ...result.page, status: 400 }, runtime);
  }
  if (!(await isPaymentMethodEnabled(runtime.db, parsed.data.paymentMethod))) {
    const result = await storefront.checkoutView(token, values, "The selected payment method is not available.");
    return sendPage(c, { ...result.page, status: 400 }, runtime);
  }

  const paymentMethod = parsed.data.paymentMethod;
  const paymentPlugin = paymentMethod === "manual" ? null : getPaymentPlugin(paymentMethod);
  let paymentConfig: Record<string, string> = {};
  if (paymentMethod !== "manual") {
    if (!paymentPlugin) {
      const result = await storefront.checkoutView(token, values, "The selected payment provider is not bundled in this build.");
      return sendPage(c, { ...result.page, status: 400 }, runtime);
    }
    paymentConfig = await loadPaymentRuntimeConfig(runtime.db, paymentMethod, c.env.APP_MASTER_KEY);
    const validation = await paymentPlugin.validateConfig(paymentConfig);
    if (!validation.ok) {
      const result = await storefront.checkoutView(
        token,
        values,
        `Payment is not configured correctly: ${validation.errors?.join(" ") ?? "check the provider settings."}`,
      );
      return sendPage(c, { ...result.page, status: 400 }, runtime);
    }
  }

  try {
    const { cart, newToken } = await getOrCreateCart(runtime.db, token, runtime.store.currency);
    if (newToken) setCartCookie(c, newToken);
    const created = await createOrderFromCart({
      db: runtime.db,
      cart,
      input: parsed.data,
      masterKey: c.env.APP_MASTER_KEY,
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });
    clearCartCookie(c);

    let redirectUrl = created.redirectUrl;
    if (paymentPlugin) {
      try {
        const detail = await getOrderDetail(runtime.db, created.order.id);
        const snapshot = orderSnapshot(detail);
        if (!snapshot) throw new Error("Order detail is unavailable.");
        const successUrl = paymentMethod === "paypal"
          ? `${runtime.origin}/api/payments/paypal/return?access=${encodeURIComponent(created.accessToken)}`
          : `${runtime.origin}/orders/${created.accessToken}`;
        const result = await paymentPlugin.createCheckout({
          order: snapshot,
          baseUrl: runtime.origin,
          successUrl,
          cancelUrl: `${runtime.origin}/orders/${created.accessToken}`,
          config: paymentConfig,
          request: c.req.raw,
        });
        if (result.type === "redirect") {
          const now = nowIso();
          await runtime.db.run(
            `INSERT INTO payment_transactions (id, order_id, plugin_id, provider_id, status, amount_cents, currency,
               provider_status, metadata_json, created_at, updated_at, paid_at)
             VALUES (?, ?, ?, ?, 'pending', ?, ?, 'checkout_created', '{}', ?, ?, NULL)`,
            [
              newId("txn"), created.order.id, paymentMethod, result.providerTransactionId ?? null,
              created.order.total_cents, created.order.currency, now, now,
            ],
          );
          redirectUrl = result.url;
        } else {
          redirectUrl = `${created.redirectUrl}?payment=pending`;
        }
      } catch (providerError) {
        console.error(JSON.stringify({
          level: "error",
          scope: "payment_checkout",
          plugin: paymentMethod,
          message: providerError instanceof Error ? providerError.message : String(providerError),
        }));
        redirectUrl = `${created.redirectUrl}?payment=error`;
      }
    }
    return c.redirect(redirectUrl, 303);
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "The order could not be created. Please try again.";
    if (!(error instanceof HttpError)) {
      console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : String(error) }));
    }
    const result = await storefront.checkoutView(token, values, message);
    if (result.newToken) setCartCookie(c, result.newToken);
    return sendPage(c, { ...result.page, status: 400 }, runtime);
  }
});

storefrontRoutes.get("/orders/:token", async (c) => {
  const runtime = await loadStorefrontRuntime(c);
  const detail = await getOrderByAccessToken(runtime.db, c.env.APP_MASTER_KEY, c.req.param("token"));
  if (!detail) {
    const { storefront } = await storefrontFor(c);
    return sendPage(c, storefront.notFound(), runtime);
  }
  const manualSettings = detail.order.payment_method === "manual"
    ? await loadManualSettings(runtime.db)
    : null;
  const body = await orderConfirmationBody(detail, runtime, manualSettings, c.req.query("payment") ?? null);
  const html = renderDocument({
    title: `Order ${detail.order.order_number}`,
    description: "Order confirmation",
    canonicalUrl: `${runtime.origin}${c.req.path}`,
    storeName: runtime.store.name,
    locale: runtime.store.locale,
    noIndex: true,
    themeCss: runtime.theme.css,
    tokens: runtime.theme.manifest.designTokens,
    settings: runtime.settings,
    body,
    assetJs: STOREFRONT_JS,
    assetCss: STOREFRONT_CSS,
    jsonLd: [],
  });
  c.header("Cache-Control", "no-store");
  return c.html(html, 200);
});

storefrontRoutes.post("/orders/:token/pay", async (c) => {
  const orderId = await parseOrderAccessToken(c.env.APP_MASTER_KEY, c.req.param("token"));
  if (!orderId) return c.redirect("/", 302);
  return retryPayment(c, orderId);
});

storefrontRoutes.get("/pages/:slug", async (c) => {
  const { storefront, runtime } = await storefrontFor(c);
  return sendPage(c, await storefront.content(c.req.param("slug")), runtime);
});

storefrontRoutes.get("/robots.txt", (c) => {
  const origin = new URL(c.req.url).origin;
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /orders/",
    "Disallow: /setup",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  c.header("Content-Type", "text/plain; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(body);
});

storefrontRoutes.get("/sitemap.xml", async (c) => {
  const origin = new URL(c.req.url).origin;
  const database = db(c);
  const [products, categories, pages] = await database.batch([
    database.prepare("SELECT slug, updated_at FROM products WHERE status = 'active' ORDER BY updated_at DESC LIMIT 2000"),
    database.prepare("SELECT slug, updated_at FROM categories ORDER BY position LIMIT 500"),
    database.prepare("SELECT slug, updated_at FROM pages WHERE type = 'content' AND published_version IS NOT NULL LIMIT 200"),
  ]);
  const entries: string[] = [];
  const push = (path: string, lastmod: string | null, priority: string) => {
    entries.push(`<url><loc>${xmlEscape(origin + path)}</loc>${lastmod ? `<lastmod>${xmlEscape(lastmod.slice(0, 10))}</lastmod>` : ""}<priority>${priority}</priority></url>`);
  };
  push("/", null, "1.0");
  push("/products", null, "0.9");
  for (const category of (categories?.results ?? []) as Array<{ slug: string; updated_at: string }>) {
    push(`/collections/${category.slug}`, category.updated_at, "0.8");
  }
  for (const product of (products?.results ?? []) as Array<{ slug: string; updated_at: string }>) {
    push(`/products/${product.slug}`, product.updated_at, "0.7");
  }
  for (const page of (pages?.results ?? []) as Array<{ slug: string; updated_at: string }>) {
    push(`/pages/${page.slug}`, page.updated_at, "0.5");
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</urlset>`;
  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(xml);
});

storefrontRoutes.get("*", async (c) => {
  const path = c.req.path;
  if (path.startsWith("/admin") || path.startsWith("/api/") || path.startsWith("/media/") ||
      path.startsWith("/static/") || path === "/setup") {
    return c.notFound();
  }
  const database = db(c);
  const redirect = await resolveRedirect(database, path);
  if (redirect) return c.redirect(redirect.toPath, redirect.statusCode as 301);
  const { storefront, runtime } = await storefrontFor(c);
  return sendPage(c, storefront.notFound(), runtime);
});

async function orderConfirmationBody(
  detail: OrderDetail,
  runtime: StorefrontRuntime,
  manualSettings: Awaited<ReturnType<typeof loadManualSettings>> | null,
  paymentQuery: string | null,
): Promise<string> {
  const order = detail.order;
  const address = detail.addresses.find((item) => item.type === "shipping");
  const items = detail.items.map((item) => `
    <div class="cc-order-line">
      <span>${escapeHtml(item.name)} × ${item.quantity}</span>
      <span>${formatMoney(item.total_cents, order.currency)}</span>
    </div>`).join("");
  const manual = manualSettings && order.payment_method === "manual" && order.payment_status === "pending"
    ? renderManualInstructions(manualSettings, order.currency, order.total_cents)
    : "";
  const paymentNotice = paymentQuery === "success"
    ? `<div class="cc-notice cc-notice--success">Payment received. Thank you!</div>`
    : paymentQuery === "failed" || paymentQuery === "error"
      ? `<div class="cc-notice cc-notice--error">The payment could not be completed. Your order is saved — you can try again below.</div>`
      : paymentQuery === "pending"
        ? `<div class="cc-notice">Payment is pending confirmation from the provider.</div>`
        : "";
  const retryForm = order.payment_method !== "manual" && order.payment_status !== "paid"
    ? `<form method="post" action="${escapeHtml(runtime.path)}/pay" style="margin-top:14px">
         <button class="cc-button cc-button--block" type="submit">Retry payment</button>
       </form>`
    : "";
  const tracking = order.tracking_number
    ? `<div class="cc-notice">
         <strong>Shipment:</strong> ${escapeHtml(order.shipping_carrier ?? "Carrier")} ·
         ${order.tracking_url
           ? `<a href="${escapeHtml(order.tracking_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(order.tracking_number)}</a>`
           : escapeHtml(order.tracking_number)}
       </div>`
    : "";
  return `<header class="cc-header"><div class="cc-container cc-header-inner">
    <a class="cc-brand" href="/"><span>${escapeHtml(runtime.store.name)}</span></a>
    <nav class="cc-nav"><a href="/products">Shop</a><a href="/cart">Cart</a></nav>
  </div></header>
  <main class="cc-section"><div class="cc-container" style="max-width:820px">
    <p class="cc-muted" style="font-size:.8rem;letter-spacing:.12em;text-transform:uppercase">Order confirmed</p>
    <h1 style="font-size:clamp(2rem,5vw,3rem)">Thank you${address ? `, ${escapeHtml(address.name.split(" ")[0]!)}` : ""}.</h1>
    <p class="cc-muted">Order ${escapeHtml(order.order_number)} was placed on ${escapeHtml(formatDate(order.created_at))}.</p>
    <div class="cc-notice">
      <strong>Status:</strong> ${escapeHtml(order.status.replace(/_/g, " "))} ·
      <strong>Payment:</strong> ${escapeHtml(order.payment_status.replace(/_/g, " "))}
    </div>
    ${paymentNotice}
    ${tracking}
    ${manual}
    ${retryForm}
    <div class="cc-cart-layout" style="margin-top:36px">
      <div>
        <h2 style="font-size:1.3rem">Items</h2>
        <div class="cc-order-lines">${items}</div>
        <div class="cc-summary-row" style="margin-top:16px"><span>Subtotal</span><span>${formatMoney(order.subtotal_cents, order.currency)}</span></div>
        ${order.discount_cents > 0 ? `<div class="cc-summary-row"><span>Discount</span><span>−${formatMoney(order.discount_cents, order.currency)}</span></div>` : ""}
        <div class="cc-summary-row"><span>Shipping</span><span>${formatMoney(order.shipping_cents, order.currency)}</span></div>
        <div class="cc-summary-row cc-summary-row--total"><span>Total</span><span>${formatMoney(order.total_cents, order.currency)}</span></div>
      </div>
      <aside class="cc-summary">
        <h2 style="font-size:1.1rem">Shipping address</h2>
        ${address ? `<p style="font-size:.9rem;line-height:1.7">${escapeHtml(address.name)}<br>${escapeHtml(address.line1)}${address.line2 ? `<br>${escapeHtml(address.line2)}` : ""}<br>${escapeHtml(address.city)}${address.state ? `, ${escapeHtml(address.state)}` : ""} ${escapeHtml(address.postal_code)}<br>${escapeHtml(address.country)}</p>` : ""}
        <p class="cc-muted" style="font-size:.85rem">We sent a confirmation to ${escapeHtml(order.email)}.</p>
        <a class="cc-button cc-button--block" href="/products">Continue shopping</a>
      </aside>
    </div>
  </div></main>`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
