import { Database } from "@cloudcart/database";
import {
  CART_COOKIE,
  getActiveTheme,
  getThemeSettings,
  loadStoreConfig,
} from "@cloudcart/core";
import type { StoreConfig } from "@cloudcart/core";
import {
  cookieIsSecure,
  parseCookies,
  serializeCookie,
} from "@cloudcart/security";
import type { ThemeDefinition } from "@cloudcart/theme-sdk";
import type { Context } from "hono";
import type { AppContext, Env } from "./env";
import { getThemeDefinition } from "./theme-registry";

export const SESSION_COOKIE = "cc_session";
export const CSRF_COOKIE = "cc_csrf";
export const CART_MAX_AGE = 60 * 60 * 24 * 30;

export function db(c: { env: Env }): Database {
  return new Database(c.env.DB);
}

export function clientIp(request: Request): string | null {
  return request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? null;
}

export function cartTokenFromRequest(request: Request): string | null {
  return parseCookies(request.headers.get("Cookie"))[CART_COOKIE] ?? null;
}

export function sessionTokenFromRequest(request: Request): string | null {
  return parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE] ?? null;
}

export function csrfCookieFromRequest(request: Request): string | null {
  return parseCookies(request.headers.get("Cookie"))[CSRF_COOKIE] ?? null;
}

export function setSessionCookies(
  c: Context<AppContext>,
  sessionToken: string,
  csrfToken: string,
  maxAgeSeconds: number,
): void {
  const secure = cookieIsSecure(c.req.url);
  c.header("Set-Cookie", serializeCookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    maxAge: maxAgeSeconds,
    path: "/",
  }), { append: true });
  c.header("Set-Cookie", serializeCookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "Lax",
    maxAge: maxAgeSeconds,
    path: "/",
  }), { append: true });
}

export function clearSessionCookies(c: Context<AppContext>): void {
  const secure = cookieIsSecure(c.req.url);
  for (const name of [SESSION_COOKIE, CSRF_COOKIE]) {
    c.header("Set-Cookie", serializeCookie(name, "", {
      httpOnly: name === SESSION_COOKIE,
      secure,
      sameSite: "Lax",
      maxAge: 0,
      path: "/",
    }), { append: true });
  }
}

export function setCartCookie(c: Context<AppContext>, token: string): void {
  c.header("Set-Cookie", serializeCookie(CART_COOKIE, token, {
    httpOnly: true,
    secure: cookieIsSecure(c.req.url),
    sameSite: "Lax",
    maxAge: CART_MAX_AGE,
    path: "/",
  }), { append: true });
}

export function clearCartCookie(c: Context<AppContext>): void {
  c.header("Set-Cookie", serializeCookie(CART_COOKIE, "", {
    httpOnly: true,
    secure: cookieIsSecure(c.req.url),
    sameSite: "Lax",
    maxAge: 0,
    path: "/",
  }), { append: true });
}

export function jsonError(c: Context<AppContext>, status: number, code: string, message: string, details?: unknown) {
  return c.json({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, status as 400);
}

export async function readJson(c: Context<AppContext>): Promise<unknown> {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw Object.assign(new Error("Expected an application/json request body."), { status: 415, code: "invalid_content_type" });
  }
  try {
    return await c.req.json();
  } catch {
    throw Object.assign(new Error("The JSON request body is invalid."), { status: 400, code: "invalid_json" });
  }
}

export interface StorefrontRuntime {
  db: Database;
  store: StoreConfig;
  theme: ThemeDefinition;
  themeId: string;
  settings: Record<string, string>;
  origin: string;
  path: string;
}

export async function loadStorefrontRuntime(c: Context<AppContext>): Promise<StorefrontRuntime> {
  const database = db(c);
  const store = await loadStoreConfig(database, c.env);
  const themeRow = await getActiveTheme(database);
  const themeId = themeRow?.id ?? "default";
  const theme = getThemeDefinition(themeId);
  const themeSettings = themeRow ? await getThemeSettings(database, themeRow.id) : {};
  return {
    db: database,
    store,
    theme,
    themeId,
    settings: { ...themeSettings, ...(store.announcement ? { announcement: store.announcement } : {}) },
    origin: new URL(c.req.url).origin,
    path: c.req.path,
  };
}

export function isMutating(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}
