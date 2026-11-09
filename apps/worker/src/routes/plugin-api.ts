import {
  getAdminProduct,
  getOrderDetail,
  getOrCreateStoreId,
  getPluginSettings,
  listAdminProducts,
  listOrders,
  loadStoreConfig,
  setPluginSettings,
  writeAuditLog,
} from "@cloudcart/core";
import { HttpError } from "@cloudcart/shared";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { CLOUDCART_VERSION } from "../env";
import { requirePluginPermission } from "../plugin-api-auth";
import { db, jsonError, readJson } from "../lib";
import type { AppContext } from "../env";

export const pluginApiRoutes = new Hono<AppContext>();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "invalid_input", result.error.issues[0]?.message ?? "Invalid input.");
  }
  return result.data;
}

function paging(c: Context<AppContext>): { page: number; perPage: number } {
  const page = Math.max(1, Math.trunc(Number(c.req.query("page") ?? 1)) || 1);
  const perPage = Math.min(50, Math.max(1, Math.trunc(Number(c.req.query("perPage") ?? 20)) || 20));
  return { page, perPage };
}

function currentPluginId(c: Context<AppContext>): string {
  const pluginId = c.get("pluginId");
  if (!pluginId) throw new HttpError(401, "token_invalid", "The plugin token is missing a plugin id.");
  return pluginId;
}

function ensurePermission(c: Context<AppContext>, permission: string): void {
  if (!requirePluginPermission(c, permission)) {
    throw new HttpError(403, "permission_denied", `The plugin does not have the "${permission}" permission.`);
  }
}

function fail(c: Context<AppContext>, error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonError(c, error.status, error.code, error.message, error.details);
  }
  console.error(JSON.stringify({
    level: "error",
    scope: "plugin_api",
    plugin: c.get("pluginId"),
    message: error instanceof Error ? error.message : String(error),
  }));
  return jsonError(c, 500, "internal_error", "Internal server error.");
}

pluginApiRoutes.get("/health", (c) => c.json({
  ok: true,
  data: {
    ok: true,
    pluginId: c.get("pluginId"),
    storeId: c.get("pluginStoreId"),
    version: CLOUDCART_VERSION,
  },
}));

pluginApiRoutes.get("/store", async (c) => {
  try {
    ensurePermission(c, "store:read");
    const store = await loadStoreConfig(db(c), c.env);
    const storeId = await getOrCreateStoreId(db(c));
    return c.json({
      ok: true,
      data: {
        id: storeId,
        name: store.name,
        currency: store.currency,
        locale: store.locale,
        timezone: c.env.STORE_TIMEZONE ?? "UTC",
        version: CLOUDCART_VERSION,
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});

pluginApiRoutes.get("/products", async (c) => {
  try {
    ensurePermission(c, "products:read");
    const { page, perPage } = paging(c);
    const search = (c.req.query("search") ?? "").slice(0, 120);
    const status = c.req.query("status") ?? "all";
    const result = await listAdminProducts(db(c), { page, perPage, search, status });
    return c.json({
      ok: true,
      data: {
        items: result.items.map((product) => ({
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
          type: product.type,
          sku: product.sku,
          price_cents: product.price_cents,
          compare_at_price_cents: product.compare_at_price_cents,
          currency: product.currency,
          stock: product.stock,
          manage_stock: product.manage_stock,
          featured: product.featured,
          image_key: product.image_key,
          image_alt: product.image_alt,
          category_names: product.category_names,
          created_at: product.created_at,
          updated_at: product.updated_at,
        })),
        total: result.total,
        page,
        perPage,
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});

pluginApiRoutes.get("/products/:id", async (c) => {
  try {
    ensurePermission(c, "products:read");
    const product = await getAdminProduct(db(c), c.req.param("id"));
    if (!product) throw new HttpError(404, "product_not_found", "Product not found.");
    return c.json({
      ok: true,
      data: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        status: product.status,
        type: product.type,
        sku: product.sku,
        price_cents: product.price_cents,
        compare_at_price_cents: product.compare_at_price_cents,
        currency: product.currency,
        stock: product.stock,
        manage_stock: product.manage_stock,
        featured: product.featured,
        seo_title: product.seo_title,
        seo_description: product.seo_description,
        images: product.images,
        variants: product.variants,
        category_ids: product.category_ids,
        tags: product.tags,
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});

pluginApiRoutes.get("/orders", async (c) => {
  try {
    ensurePermission(c, "orders:read");
    const { page, perPage } = paging(c);
    const status = c.req.query("status") ?? "all";
    const result = await listOrders(db(c), { page, perPage, status });
    return c.json({
      ok: true,
      data: {
        items: result.items.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          status: order.status,
          payment_status: order.payment_status,
          email: order.email,
          currency: order.currency,
          subtotal_cents: order.subtotal_cents,
          discount_cents: order.discount_cents,
          shipping_cents: order.shipping_cents,
          tax_cents: order.tax_cents,
          total_cents: order.total_cents,
          refunded_cents: order.refunded_cents,
          created_at: order.created_at,
          paid_at: order.paid_at,
        })),
        total: result.total,
        page,
        perPage,
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});

pluginApiRoutes.get("/orders/:id", async (c) => {
  try {
    ensurePermission(c, "orders:read");
    const detail = await getOrderDetail(db(c), c.req.param("id"));
    if (!detail) throw new HttpError(404, "order_not_found", "Order not found.");
    const { internal_note, ip, user_agent, metadata_json, ...order } = detail.order;
    return c.json({
      ok: true,
      data: {
        order: {
          ...order,
          metadata: (() => {
            try { return JSON.parse(metadata_json); } catch { return {}; }
          })(),
        },
        items: detail.items,
        addresses: detail.addresses,
        transactions: detail.transactions.map((transaction) => ({
          id: transaction.id,
          plugin_id: transaction.plugin_id,
          status: transaction.status,
          amount_cents: transaction.amount_cents,
          currency: transaction.currency,
          created_at: transaction.created_at,
          paid_at: transaction.paid_at,
        })),
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});

pluginApiRoutes.get("/settings", async (c) => {
  try {
    ensurePermission(c, "settings:read");
    const settings = await getPluginSettings(db(c), currentPluginId(c));
    return c.json({ ok: true, data: settings });
  } catch (error) {
    return fail(c, error);
  }
});

pluginApiRoutes.put("/settings", async (c) => {
  try {
    ensurePermission(c, "settings:write");
    const body = parse(z.object({
      settings: z.record(z.string(), z.string().max(4000)),
    }), await readJson(c));
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(body.settings)) {
      if (key.startsWith("_") || key === "serviceSecret") {
        throw new HttpError(400, "invalid_setting", "Reserved setting keys cannot be changed by the plugin.");
      }
      filtered[key] = value;
    }
    await setPluginSettings(db(c), currentPluginId(c), filtered, c.env.APP_MASTER_KEY, []);
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

pluginApiRoutes.post("/events", async (c) => {
  try {
    ensurePermission(c, "events:write");
    const body = parse(z.object({
      type: z.string().trim().regex(/^[a-z0-9_.-]{1,80}$/),
      payload: z.unknown().optional(),
    }), await readJson(c));
    const details = JSON.stringify(body.payload ?? {}).slice(0, 8000);
    await writeAuditLog(db(c), {
      adminId: c.get("pluginAdminId") ?? null,
      action: "plugin.event",
      entityType: "plugin",
      entityId: currentPluginId(c),
      details: { type: body.type, payload: details },
      ip: c.req.header("cf-connecting-ip") ?? null,
    });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});
