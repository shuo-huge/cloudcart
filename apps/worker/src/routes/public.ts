import {
  addCartItem,
  applyCouponToCart,
  getOrCreateCart,
  loadCart,
  removeCartItem,
  subscribeToNewsletter,
  updateCartItem,
} from "@cloudcart/core";
import { HttpError, nowIso } from "@cloudcart/shared";
import { getAdminI18nState } from "@cloudcart/plugin-admin-i18n";
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppContext } from "../env";
import {
  cartTokenFromRequest,
  db,
  jsonError,
  readJson,
  setCartCookie,
} from "../lib";

export const publicRoutes = new Hono<AppContext>();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "invalid_input", result.error.issues[0]?.message ?? "Invalid input.", result.error.issues);
  }
  return result.data;
}

function handleError(c: Context<AppContext>, error: unknown) {
  if (error instanceof HttpError) {
    return jsonError(c, error.status, error.code, error.message, error.details);
  }
  console.error(JSON.stringify({ level: "error", message: error instanceof Error ? error.message : String(error) }));
  return jsonError(c, 500, "internal_error", "Something went wrong. Please try again.");
}

async function storeCurrency(c: Context<AppContext>): Promise<string> {
  const row = await db(c).first<{ value: string }>("SELECT value FROM store_settings WHERE key = 'store.currency'");
  return (row?.value || "USD").toUpperCase();
}

const addItemSchema = z.object({
  productId: z.string().min(1).max(120),
  variantId: z.string().max(120).nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
});

const quantitySchema = z.object({
  quantity: z.coerce.number().int().min(0).max(9999),
});

const couponSchema = z.object({
  code: z.string().trim().max(60),
});

const newsletterSchema = z.object({
  email: z.string().trim().max(254),
});

async function currentCart(c: Context<AppContext>) {
  const currency = await storeCurrency(c);
  const { cart, newToken } = await getOrCreateCart(db(c), cartTokenFromRequest(c.req.raw), currency);
  return { cart, newToken };
}

/**
 * Public, read-only admin language pack. Needed before sign-in so the login
 * and setup screens can be shown in the configured default language. The
 * payload contains UI strings only — never settings or secrets.
 */
publicRoutes.get("/i18n", async (c) => {
  try {
    const state = await getAdminI18nState(db(c));
    c.header("Cache-Control", "no-store");
    return c.json({ ok: true, ...state });
  } catch (error) {
    return handleError(c, error);
  }
});

publicRoutes.get("/cart", async (c) => {
  try {
    const { cart, newToken } = await currentCart(c);
    const view = await loadCart(db(c), cart);
    if (newToken) setCartCookie(c, newToken);
    return c.json({ ok: true, cart: view });
  } catch (error) {
    return handleError(c, error);
  }
});

publicRoutes.post("/cart/items", async (c) => {
  try {
    const body = parse(addItemSchema, await readJson(c));
    const { cart, newToken } = await currentCart(c);
    await addCartItem(db(c), cart, {
      productId: body.productId,
      variantId: body.variantId ?? null,
      quantity: body.quantity,
    });
    const view = await loadCart(db(c), cart);
    if (newToken) setCartCookie(c, newToken);
    return c.json({ ok: true, cart: view });
  } catch (error) {
    return handleError(c, error);
  }
});

publicRoutes.patch("/cart/items/:itemId", async (c) => {
  try {
    const body = parse(quantitySchema, await readJson(c));
    const { cart } = await currentCart(c);
    await updateCartItem(db(c), cart, c.req.param("itemId"), body.quantity);
    const view = await loadCart(db(c), cart);
    return c.json({ ok: true, cart: view });
  } catch (error) {
    return handleError(c, error);
  }
});

publicRoutes.delete("/cart/items/:itemId", async (c) => {
  try {
    const { cart } = await currentCart(c);
    await removeCartItem(db(c), cart, c.req.param("itemId"));
    const view = await loadCart(db(c), cart);
    return c.json({ ok: true, cart: view });
  } catch (error) {
    return handleError(c, error);
  }
});

publicRoutes.post("/cart/coupon", async (c) => {
  try {
    const body = parse(couponSchema, await readJson(c));
    const { cart } = await currentCart(c);
    await applyCouponToCart(db(c), cart, body.code || null);
    const view = await loadCart(db(c), cart);
    return c.json({ ok: true, cart: view });
  } catch (error) {
    return handleError(c, error);
  }
});

publicRoutes.post("/newsletter", async (c) => {
  try {
    const body = parse(newsletterSchema, await readJson(c));
    const result = await subscribeToNewsletter(db(c), body.email, c.req.path);
    return c.json({ ok: true, subscribed: true, created: result.created, time: nowIso() });
  } catch (error) {
    return handleError(c, error);
  }
});
