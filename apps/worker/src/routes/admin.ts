import {
  addOrderInternalNote,
  cancelOrderAndRestock,
  categoryInputSchema,
  changeAdminPassword,
  confirmManualPayment,
  couponInputSchema,
  createCategory,
  createCoupon,
  createContentPage,
  createProduct,
  createRate,
  createRedirect,
  createZone,
  deleteCategory,
  deleteCoupon,
  deleteMedia,
  deleteProduct,
  deleteRate,
  deleteRedirect,
  deleteZone,
  ensureDefaultContentPages,
  getAdminProduct,
  getCustomer,
  getDashboardStats,
  getOrderDetail,
  getPage,
  getPluginSettings,
  getSettings,
  getThemeSettings,
  listAdminProducts,
  listCategories,
  listCoupons,
  listCustomers,
  listMedia,
  listOrders,
  listPageVersions,
  listPages,
  listPlugins,
  listRedirects,
  listSubscribers,
  listThemes,
  listZones,
  loadStoreConfig,
  loadPaymentRuntimeConfig,
  publishPage,
  redirectInputSchema,
  registerThemes,
  saveDraft,
  setPluginEnabled,
  setPluginSettings,
  setProductStatus,
  setSettings,
  setThemeSettings,
  shippingRateInputSchema,
  shippingZoneInputSchema,
  storeMedia,
  validatePageDocument,
  Storefront,
  renderDocument,
  updateCategory,
  updateCoupon,
  updateCustomerNotes,
  updateOrderStatus,
  updateProduct,
  updateRate,
  updateZone,
  activateTheme,
  attachImageToProduct,
  recordManualRefund,
  removeProductImage,
  listAuditLogs,
  writeAuditLog,
} from "@cloudcart/core";
import { FREE_TIER_LIMITS, ResourceGuard } from "@cloudcart/database";
import { HttpError, normalizeOrderStatus, nowIso, parseMoneyInput } from "@cloudcart/shared";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import { db, jsonError, loadStorefrontRuntime, readJson } from "../lib";
import { STOREFRONT_CSS, STOREFRONT_JS } from "../generated/assets";
import { getPaymentPlugin } from "../plugin-registry";
import { hasTheme, listThemeDefinitions } from "../theme-registry";
import { pluginRegistry } from "../plugin-registry";

export const adminRoutes = new Hono<AppContext>();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "invalid_input", result.error.issues[0]?.message ?? "Invalid input.", result.error.issues);
  }
  return result.data;
}

function paging(c: Context<AppContext>): { page: number; perPage: number } {
  const page = Math.max(1, Math.trunc(Number(c.req.query("page") ?? 1)) || 1);
  const perPage = Math.min(100, Math.max(1, Math.trunc(Number(c.req.query("perPage") ?? 20)) || 20));
  return { page, perPage };
}

async function currency(c: Context<AppContext>): Promise<string> {
  const row = await db(c).first<{ value: string }>("SELECT value FROM store_settings WHERE key = 'store.currency'");
  return (row?.value || c.env.STORE_CURRENCY || "USD").toUpperCase();
}

async function audit(
  c: Context<AppContext>,
  action: string,
  entityType: string,
  entityId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  await writeAuditLog(db(c), {
    adminId: c.get("adminId"),
    action,
    entityType,
    entityId,
    details,
    ip: c.req.header("cf-connecting-ip") ?? null,
  });
}

function fail(c: Context<AppContext>, error: unknown) {
  if (error instanceof HttpError) {
    return jsonError(c, error.status, error.code, error.message, error.details);
  }
  console.error(JSON.stringify({
    level: "error",
    path: c.req.path,
    message: error instanceof Error ? error.message : String(error),
  }));
  return jsonError(c, 500, "internal_error", "Something went wrong.");
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/dashboard", async (c) => {
  try {
    const stats = await getDashboardStats(db(c), await currency(c));
    return c.json({ ok: true, data: stats });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Products                                                                   */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/products", async (c) => {
  try {
    const { page, perPage } = paging(c);
    const result = await listAdminProducts(db(c), {
      page,
      perPage,
      search: c.req.query("q") || undefined,
      status: c.req.query("status") || undefined,
    });
    return c.json({ ok: true, data: { items: result.items, total: result.total, page, perPage } });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/products", async (c) => {
  try {
    const input = parse(productSchema(), await readJson(c));
    const id = await createProduct(db(c), input, await currency(c), c.get("adminId"), c.req.header("cf-connecting-ip") ?? null);
    await audit(c, "product.created", "product", id, { name: input.name });
    return c.json({ ok: true, data: { id } }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/products/:id", async (c) => {
  try {
    const product = await getAdminProduct(db(c), c.req.param("id"));
    if (!product) throw new HttpError(404, "product_not_found", "Product not found.");
    return c.json({ ok: true, data: product });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/products/:id", async (c) => {
  try {
    const input = parse(productSchema(), await readJson(c));
    await updateProduct(db(c), c.req.param("id"), input, await currency(c), c.get("adminId"));
    await audit(c, "product.updated", "product", c.req.param("id"), { name: input.name });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.delete("/products/:id", async (c) => {
  try {
    const database = db(c);
    const id = c.req.param("id");
    const images = await database.all<{ r2_key: string }>("SELECT r2_key FROM product_images WHERE product_id = ?", [id]);
    await deleteProduct(database, id);
    if (c.req.query("deleteMedia") === "true" && images.length > 0) {
      await c.env.MEDIA.delete(images.map((image) => image.r2_key));
      await database.run(
        `DELETE FROM media WHERE r2_key IN (${images.map(() => "?").join(",")})`,
        images.map((image) => image.r2_key),
      );
    }
    await audit(c, "product.deleted", "product", id, { removedMedia: c.req.query("deleteMedia") === "true" ? images.length : 0 });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/products/:id/status", async (c) => {
  try {
    const body = parse(z.object({ status: z.enum(["draft", "active", "archived"]) }), await readJson(c));
    await setProductStatus(db(c), c.req.param("id"), body.status);
    await audit(c, "product.status_changed", "product", c.req.param("id"), { status: body.status });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/products/:id/images", async (c) => {
  try {
    const body = parse(z.object({ mediaId: z.string().min(1), alt: z.string().max(300).default("") }), await readJson(c));
    const imageId = await attachImageToProduct(db(c), c.req.param("id"), body.mediaId, body.alt);
    await audit(c, "product.image_added", "product", c.req.param("id"), { mediaId: body.mediaId });
    return c.json({ ok: true, data: { id: imageId } }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.delete("/products/:id/images/:imageId", async (c) => {
  try {
    await removeProductImage(db(c), c.req.param("id"), c.req.param("imageId"));
    await audit(c, "product.image_removed", "product", c.req.param("id"), { imageId: c.req.param("imageId") });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

function productSchema() {
  return z.object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().max(80).optional(),
    description: z.string().max(200_000).default(""),
    status: z.enum(["draft", "active", "archived"]).default("draft"),
    type: z.enum(["simple", "variable"]).default("simple"),
    price: z.string().trim(),
    compareAtPrice: z.string().trim().nullable().optional(),
    sku: z.string().trim().max(100).nullable().optional(),
    stock: z.coerce.number().int().min(0).max(10_000_000).default(0),
    manageStock: z.boolean().default(true),
    featured: z.boolean().default(false),
    seoTitle: z.string().trim().max(200).nullable().optional(),
    seoDescription: z.string().trim().max(400).nullable().optional(),
    categoryIds: z.array(z.string()).max(50).default([]),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
    variants: z.array(z.object({
      id: z.string().max(120).optional(),
      title: z.string().trim().min(1).max(120),
      sku: z.string().trim().max(100).nullable().optional(),
      price: z.string().trim(),
      compareAtPrice: z.string().trim().nullable().optional(),
      stock: z.coerce.number().int().min(0).default(0),
      options: z.record(z.string(), z.string()).default({}),
      active: z.boolean().default(true),
    })).max(100).default([]),
    imageIds: z.array(z.string()).max(50).optional(),
  });
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/categories", async (c) => {
  try {
    return c.json({ ok: true, data: await listCategories(db(c)) });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/categories", async (c) => {
  try {
    const input = parse(categoryInputSchema, await readJson(c));
    const id = await createCategory(db(c), input);
    await audit(c, "category.created", "category", id, { name: input.name });
    return c.json({ ok: true, data: { id } }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/categories/:id", async (c) => {
  try {
    const input = parse(categoryInputSchema, await readJson(c));
    await updateCategory(db(c), c.req.param("id"), input);
    await audit(c, "category.updated", "category", c.req.param("id"), { name: input.name });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.delete("/categories/:id", async (c) => {
  try {
    await deleteCategory(db(c), c.req.param("id"));
    await audit(c, "category.deleted", "category", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/media", async (c) => {
  try {
    const { page, perPage } = paging(c);
    const result = await listMedia(db(c), page, perPage);
    return c.json({ ok: true, data: { ...result, page, perPage } });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/media", async (c) => {
  try {
    const form = await c.req.raw.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "file_required", "Attach an image file.");
    // Local safety guard: R2 Free allows 10 GB-month. Stop uploads at 80% of
    // that budget instead of silently consuming paid storage.
    const usage = await db(c).first<{ bytes: number }>("SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM media");
    const used = Number(usage?.bytes ?? 0);
    const guard = 8 * 1024 * 1024 * 1024;
    if (used + file.size > guard) {
      throw new HttpError(
        507,
        "storage_guard",
        "The local image-storage safety threshold is reached. Delete unused media or raise the threshold deliberately; CloudCart never upgrades your plan automatically.",
      );
    }
    const alt = String(form.get("alt") ?? "");
    const media = await storeMedia(db(c), c.env.MEDIA, file, c.get("adminId"));
    if (alt) {
      await db(c).run("UPDATE media SET alt = ? WHERE id = ?", [alt.slice(0, 300), media.id]);
      media.alt = alt;
    }
    await new ResourceGuard(db(c)).record({ r2ClassA: 1 });
    await audit(c, "media.uploaded", "media", media.id, { filename: media.filename, size: media.size_bytes });
    return c.json({ ok: true, data: media }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.delete("/media/:id", async (c) => {
  try {
    await deleteMedia(db(c), c.env.MEDIA, c.req.param("id"));
    await audit(c, "media.deleted", "media", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/orders", async (c) => {
  try {
    const { page, perPage } = paging(c);
    const result = await listOrders(db(c), {
      page,
      perPage,
      status: c.req.query("status") || undefined,
      paymentStatus: c.req.query("paymentStatus") || undefined,
      search: c.req.query("q") || undefined,
    });
    return c.json({ ok: true, data: { items: result.items, total: result.total, page, perPage } });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/orders/:id", async (c) => {
  try {
    const detail = await getOrderDetail(db(c), c.req.param("id"));
    if (!detail) throw new HttpError(404, "order_not_found", "Order not found.");
    const logs = await db(c).all<{ action: string; created_at: string; admin_id: string | null; details_json: string }>(
      "SELECT action, created_at, admin_id, details_json FROM audit_logs WHERE entity_type = 'order' AND entity_id = ? ORDER BY created_at DESC LIMIT 50",
      [detail.order.id],
    );
    return c.json({ ok: true, data: { ...detail, logs } });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/orders/:id/status", async (c) => {
  try {
    const body = parse(z.object({ status: z.string().max(40) }), await readJson(c));
    const status = normalizeOrderStatus(body.status);
    if (!status) throw new HttpError(400, "invalid_status", "Unknown order status.");
    const result = await updateOrderStatus(db(c), c.req.param("id"), status);
    if (!result.ok) throw new HttpError(409, "invalid_transition", result.message);
    await audit(c, "order.status_changed", "order", c.req.param("id"), { status });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/orders/:id/confirm-payment", async (c) => {
  try {
    const body = parse(z.object({ note: z.string().max(2000).optional().default("") }), await readJson(c));
    const result = await confirmManualPayment(db(c), c.req.param("id"), c.get("adminId"), body.note || null);
    if (!result.ok) throw new HttpError(409, "cannot_confirm", result.message);
    await audit(c, "order.payment_confirmed", "order", c.req.param("id"), { note: body.note });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/orders/:id/shipping", async (c) => {
  try {
    const body = parse(z.object({
      carrier: z.string().trim().max(120).optional().default(""),
      trackingNumber: z.string().trim().max(120).optional().default(""),
      trackingUrl: z.string().trim().max(500).optional().default(""),
    }), await readJson(c));
    if (body.trackingUrl && !/^https?:\/\//.test(body.trackingUrl)) {
      throw new HttpError(400, "invalid_tracking_url", "The tracking URL must start with http:// or https://.");
    }
    const result = await db(c).run(
      "UPDATE orders SET shipping_carrier = ?, tracking_number = ?, tracking_url = ?, updated_at = ? WHERE id = ?",
      [body.carrier || null, body.trackingNumber || null, body.trackingUrl || null, nowIso(), c.req.param("id")],
    );
    if (!result.meta.changes) throw new HttpError(404, "order_not_found", "Order not found.");
    await audit(c, "order.shipment_updated", "order", c.req.param("id"), {
      carrier: body.carrier,
      trackingNumber: body.trackingNumber,
    });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/orders/:id/notes", async (c) => {
  try {
    const body = parse(z.object({ note: z.string().trim().min(1).max(5000) }), await readJson(c));
    await addOrderInternalNote(db(c), c.req.param("id"), body.note);
    await audit(c, "order.note_added", "order", c.req.param("id"), { note: body.note });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/orders/:id/cancel", async (c) => {
  try {
    const result = await cancelOrderAndRestock(db(c), c.req.param("id"));
    if (!result.ok) throw new HttpError(409, "cannot_cancel", result.message);
    await audit(c, "order.cancelled", "order", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/orders/:id/refund", async (c) => {
  try {
    const body = parse(z.object({ amount: z.string().trim().min(1) }), await readJson(c));
    const order = await db(c).first<{ currency: string }>("SELECT currency FROM orders WHERE id = ?", [c.req.param("id")]);
    if (!order) throw new HttpError(404, "order_not_found", "Order not found.");
    let amountCents: number;
    try {
      amountCents = parseMoneyInput(body.amount, order.currency);
    } catch {
      throw new HttpError(400, "invalid_amount", "Enter a valid refund amount.");
    }
    const detail = await getOrderDetail(db(c), c.req.param("id"));
    if (!detail) throw new HttpError(404, "order_not_found", "Order not found.");
    const method = detail.order.payment_method ?? "";
    if (method !== "manual") {
      const plugin = getPaymentPlugin(method);
      if (!plugin?.refund) throw new HttpError(400, "refund_unsupported", "This payment method does not support refunds.");
      const transaction = detail.transactions.find((entry) => entry.status === "succeeded");
      if (!transaction) throw new HttpError(409, "no_transaction", "No successful payment transaction to refund.");
      const metadata = (() => {
        try {
          return JSON.parse(transaction.metadata_json) as { providerTransactionId?: string | null };
        } catch {
          return {};
        }
      })();
      const config = await loadPaymentRuntimeConfig(db(c), method, c.env.APP_MASTER_KEY);
      const refund = await plugin.refund({
        orderId: detail.order.id,
        providerTransactionId: metadata.providerTransactionId ?? transaction.provider_id ?? "",
        amountCents,
        currency: order.currency,
        config,
      });
      if (!refund.ok) {
        throw new HttpError(502, "refund_failed", refund.message ?? "The payment provider rejected the refund.");
      }
    }
    const result = await recordManualRefund(db(c), c.req.param("id"), amountCents, c.get("adminId"));
    if (!result.ok) throw new HttpError(409, "cannot_refund", result.message);
    await audit(c, "order.refunded", "order", c.req.param("id"), { amountCents });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Customers                                                                  */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/customers", async (c) => {
  try {
    const { page, perPage } = paging(c);
    const result = await listCustomers(db(c), { page, perPage, search: c.req.query("q") || undefined });
    return c.json({ ok: true, data: { ...result, page, perPage } });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/customers/:id", async (c) => {
  try {
    const customer = await getCustomer(db(c), c.req.param("id"));
    if (!customer) throw new HttpError(404, "customer_not_found", "Customer not found.");
    return c.json({ ok: true, data: customer });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/customers/:id/notes", async (c) => {
  try {
    const body = parse(z.object({ notes: z.string().max(10_000) }), await readJson(c));
    await updateCustomerNotes(db(c), c.req.param("id"), body.notes);
    await audit(c, "customer.notes_updated", "customer", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Coupons                                                                    */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/coupons", async (c) => {
  try {
    return c.json({ ok: true, data: await listCoupons(db(c)) });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/coupons", async (c) => {
  try {
    const input = parse(couponInputSchema, await readJson(c));
    const id = await createCoupon(db(c), input, await currency(c));
    await audit(c, "coupon.created", "coupon", id, { code: input.code.toUpperCase() });
    return c.json({ ok: true, data: { id } }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/coupons/:id", async (c) => {
  try {
    const input = parse(couponInputSchema, await readJson(c));
    await updateCoupon(db(c), c.req.param("id"), input, await currency(c));
    await audit(c, "coupon.updated", "coupon", c.req.param("id"), { code: input.code.toUpperCase() });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.delete("/coupons/:id", async (c) => {
  try {
    await deleteCoupon(db(c), c.req.param("id"));
    await audit(c, "coupon.deleted", "coupon", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Shipping                                                                   */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/shipping", async (c) => {
  try {
    return c.json({ ok: true, data: await listZones(db(c)) });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/shipping/zones", async (c) => {
  try {
    const input = parse(shippingZoneInputSchema, await readJson(c));
    const id = await createZone(db(c), input);
    await audit(c, "shipping.zone_created", "shipping_zone", id, { name: input.name });
    return c.json({ ok: true, data: { id } }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/shipping/zones/:id", async (c) => {
  try {
    const input = parse(shippingZoneInputSchema, await readJson(c));
    await updateZone(db(c), c.req.param("id"), input);
    await audit(c, "shipping.zone_updated", "shipping_zone", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.delete("/shipping/zones/:id", async (c) => {
  try {
    await deleteZone(db(c), c.req.param("id"));
    await audit(c, "shipping.zone_deleted", "shipping_zone", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/shipping/rates", async (c) => {
  try {
    const input = parse(shippingRateInputSchema, await readJson(c));
    const id = await createRate(db(c), input);
    await audit(c, "shipping.rate_created", "shipping_rate", id, { name: input.name });
    return c.json({ ok: true, data: { id } }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/shipping/rates/:id", async (c) => {
  try {
    const input = parse(shippingRateInputSchema, await readJson(c));
    await updateRate(db(c), c.req.param("id"), input);
    await audit(c, "shipping.rate_updated", "shipping_rate", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.delete("/shipping/rates/:id", async (c) => {
  try {
    await deleteRate(db(c), c.req.param("id"));
    await audit(c, "shipping.rate_deleted", "shipping_rate", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Themes                                                                     */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/themes", async (c) => {
  try {
    await registerThemes(db(c), listThemeDefinitions().map((theme) => ({
      id: theme.manifest.id,
      name: theme.manifest.name,
      version: theme.manifest.version,
      description: theme.manifest.description,
      previewImage: theme.manifest.previewImage,
    })));
    const rows = await listThemes(db(c));
    return c.json({
      ok: true,
      data: rows.map((row) => ({ ...row, bundled: hasTheme(row.id) })),
    });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/themes/:id/activate", async (c) => {
  try {
    const id = c.req.param("id");
    if (!hasTheme(id)) throw new HttpError(400, "theme_not_bundled", "This theme is not bundled into the current Worker build.");
    await registerThemes(db(c), listThemeDefinitions().map((theme) => ({
      id: theme.manifest.id,
      name: theme.manifest.name,
      version: theme.manifest.version,
      description: theme.manifest.description,
      previewImage: theme.manifest.previewImage,
    })));
    await activateTheme(db(c), id);
    await audit(c, "theme.activated", "theme", id);
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/themes/:id/settings", async (c) => {
  try {
    const theme = listThemeDefinitions().find((definition) => definition.manifest.id === c.req.param("id"));
    if (!theme) throw new HttpError(404, "theme_not_found", "Theme not found.");
    return c.json({
      ok: true,
      data: {
        settings: await getThemeSettings(db(c), c.req.param("id")),
        tokens: theme.manifest.designTokens,
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/themes/:id/settings", async (c) => {
  try {
    const theme = listThemeDefinitions().find((definition) => definition.manifest.id === c.req.param("id"));
    if (!theme) throw new HttpError(404, "theme_not_found", "Theme not found.");
    const body = parse(z.object({ settings: z.record(z.string(), z.string().max(300)) }), await readJson(c));
    const allowed = new Set(theme.manifest.designTokens.map((token) => token.key));
    const filtered = Object.fromEntries(
      Object.entries(body.settings).filter(([key]) => allowed.has(key)),
    );
    await setThemeSettings(db(c), c.req.param("id"), filtered);
    await audit(c, "theme.settings_updated", "theme", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/pages", async (c) => {
  try {
    await ensureDefaultContentPages(db(c));
    return c.json({ ok: true, data: await listPages(db(c)) });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/pages", async (c) => {
  try {
    const input = parse(z.object({
      title: z.string().trim().min(1).max(140),
      slug: z.string().trim().min(1).max(80),
    }), await readJson(c));
    const id = await createContentPage(db(c), input.slug, input.title);
    await audit(c, "page.created", "page", id, { slug: input.slug });
    return c.json({ ok: true, data: { id, slug: input.slug } }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/pages/:slug", async (c) => {
  try {
    const page = await getPage(db(c), c.req.param("slug"));
    if (!page) throw new HttpError(404, "page_not_found", "Page not found.");
    let draft: unknown = null;
    try {
      draft = JSON.parse(page.draft_json);
    } catch {
      draft = null;
    }
    return c.json({
      ok: true,
      data: {
        page: { ...page, draft_json: undefined },
        draft,
        versions: await listPageVersions(db(c), page.slug),
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/pages/:slug/draft", async (c) => {
  try {
    const body = await readJson(c) as { document?: unknown };
    const document = await saveDraft(db(c), c.req.param("slug"), body.document);
    await audit(c, "page.draft_saved", "page", c.req.param("slug"));
    return c.json({ ok: true, data: document });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/pages/:slug/publish", async (c) => {
  try {
    const result = await publishPage(db(c), c.req.param("slug"), c.get("adminId"));
    await audit(c, "page.published", "page", c.req.param("slug"), { version: result.version });
    return c.json({ ok: true, data: result });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/pages/:slug/preview", async (c) => {
  try {
    const body = await readJson(c) as { document?: unknown };
    const document = validatePageDocument(body.document);
    const runtime = await loadStorefrontRuntime(c);
    const storefront = new Storefront({
      db: runtime.db,
      theme: runtime.theme,
      store: runtime.store,
      settings: runtime.settings,
      origin: runtime.origin,
      cartCount: 0,
      path: c.req.param("slug") === "home" ? "/" : "/pages/" + c.req.param("slug"),
    });
    const slug = c.req.param("slug");
    const page = slug === "home" ? await storefront.home(document) : await storefront.content(slug, document);
    const html = renderDocument({
      title: page.title,
      description: page.description,
      canonicalUrl: runtime.origin + page.canonicalPath,
      storeName: runtime.store.name,
      locale: runtime.store.locale,
      themeCss: runtime.theme.css,
      tokens: runtime.theme.manifest.designTokens,
      settings: runtime.settings,
      body: page.body,
      assetJs: STOREFRONT_JS,
      assetCss: STOREFRONT_CSS,
      noIndex: true,
      jsonLd: [],
    });
    c.header("Cache-Control", "no-store");
    return c.html(html);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/pages/:slug/versions", async (c) => {
  try {
    return c.json({ ok: true, data: await listPageVersions(db(c), c.req.param("slug")) });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Plugins                                                                    */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/plugins", async (c) => {
  try {
    return c.json({ ok: true, data: await listPlugins(db(c), pluginRegistry) });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/plugins/:id/enable", async (c) => {
  try {
    await setPluginEnabled(db(c), pluginRegistry, c.req.param("id"), true);
    await audit(c, "plugin.enabled", "plugin", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/plugins/:id/disable", async (c) => {
  try {
    await setPluginEnabled(db(c), pluginRegistry, c.req.param("id"), false);
    await audit(c, "plugin.disabled", "plugin", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/plugins/:id/settings", async (c) => {
  try {
    if (!pluginRegistry.has(c.req.param("id"))) {
      throw new HttpError(404, "plugin_not_found", "Plugin not found in this build.");
    }
    return c.json({ ok: true, data: await getPluginSettings(db(c), c.req.param("id")) });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/plugins/:id/settings", async (c) => {
  try {
    if (!pluginRegistry.has(c.req.param("id"))) {
      throw new HttpError(404, "plugin_not_found", "Plugin not found in this build.");
    }
    const body = parse(z.object({
      settings: z.record(z.string(), z.string().max(10_000)),
      secretKeys: z.array(z.string()).max(50).default([]),
    }), await readJson(c));
    await setPluginSettings(db(c), c.req.param("id"), body.settings, c.env.APP_MASTER_KEY, body.secretKeys);
    await audit(c, "plugin.settings_updated", "plugin", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const ALLOWED_SETTINGS = new Set([
  "store.name", "store.currency", "store.locale", "store.email", "store.phone",
  "store.address", "store.logo", "store.announcement", "store.maintenance_message",
  "seo.title", "seo.description", "seo.og_image", "shipping.currency", "tax.included",
]);

adminRoutes.get("/settings", async (c) => {
  try {
    const database = db(c);
    return c.json({
      ok: true,
      data: {
        settings: await getSettings(database),
        store: await loadStoreConfig(database, c.env),
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.put("/settings", async (c) => {
  try {
    const body = parse(z.object({ settings: z.record(z.string(), z.string().max(4000)) }), await readJson(c));
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(body.settings)) {
      if (ALLOWED_SETTINGS.has(key)) filtered[key] = value;
    }
    await setSettings(db(c), filtered);
    await audit(c, "settings.updated", "store_settings", null, { keys: Object.keys(filtered) });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/settings/password", async (c) => {
  try {
    const body = parse(z.object({
      currentPassword: z.string().min(1).max(1024),
      newPassword: z.string().min(8).max(1024),
    }), await readJson(c));
    const result = await changeAdminPassword(
      db(c),
      c.get("adminId"),
      body.currentPassword,
      body.newPassword,
      c.req.header("cf-connecting-ip") ?? null,
    );
    if (!result.ok) throw new HttpError(400, "password_change_failed", result.message);
    await audit(c, "admin.password_changed", "admin", c.get("adminId"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Redirects, subscribers, audit, usage                                       */
/* -------------------------------------------------------------------------- */

adminRoutes.get("/redirects", async (c) => {
  try {
    return c.json({ ok: true, data: await listRedirects(db(c)) });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.post("/redirects", async (c) => {
  try {
    const input = parse(redirectInputSchema, await readJson(c));
    const id = await createRedirect(db(c), input);
    await audit(c, "redirect.created", "redirect", id, { from: input.fromPath, to: input.toPath });
    return c.json({ ok: true, data: { id } }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.delete("/redirects/:id", async (c) => {
  try {
    await deleteRedirect(db(c), c.req.param("id"));
    await audit(c, "redirect.deleted", "redirect", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/newsletter", async (c) => {
  try {
    const { page, perPage } = paging(c);
    const result = await listSubscribers(db(c), page, perPage);
    return c.json({ ok: true, data: { ...result, page, perPage } });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/audit", async (c) => {
  try {
    const { page, perPage } = paging(c);
    const result = await listAuditLogs(db(c), page, perPage);
    return c.json({ ok: true, data: { ...result, page, perPage } });
  } catch (error) {
    return fail(c, error);
  }
});

adminRoutes.get("/usage", async (c) => {
  try {
    const guard = new ResourceGuard(db(c));
    const [today, storage] = await Promise.all([guard.today(), guard.storageEstimate()]);
    return c.json({
      ok: true,
      data: {
        localEstimate: today ?? {
          day: new Date().toISOString().slice(0, 10),
          api_requests: 0,
          d1_reads: 0,
          d1_writes: 0,
          r2_class_a: 0,
          r2_class_b: 0,
        },
        storage,
        freeTierLimits: FREE_TIER_LIMITS,
        notice: "These counters are CloudCart local estimates. Cloudflare dashboard metrics are authoritative.",
      },
    });
  } catch (error) {
    return fail(c, error);
  }
});
