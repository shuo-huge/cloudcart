import { authenticateSession } from "@cloudcart/core";
import { verifyCsrf } from "@cloudcart/security";
import type { MiddlewareHandler } from "hono";
import type { AppContext } from "./env";
import {
  csrfCookieFromRequest,
  db,
  isMutating,
  jsonError,
  sessionTokenFromRequest,
} from "./lib";

const PUBLIC_ADMIN_PATHS = new Set([
  "/api/admin/login",
  "/api/admin/setup",
  "/api/admin/setup/status",
]);

export const adminAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  if (PUBLIC_ADMIN_PATHS.has(c.req.path)) {
    await next();
    return;
  }
  const masterKey = c.env.APP_MASTER_KEY;
  if (!masterKey) return jsonError(c, 500, "not_configured", "APP_MASTER_KEY is not configured.");
  const auth = await authenticateSession(db(c), masterKey, sessionTokenFromRequest(c.req.raw));
  if (!auth) return jsonError(c, 401, "unauthorized", "Sign in is required.");
  c.set("adminId", auth.admin.id);
  c.set("adminEmail", auth.admin.email);
  c.set("sessionId", auth.session.id);
  c.set("csrfToken", auth.session.csrf_token);

  if (isMutating(c.req.method)) {
    const headerToken = c.req.header("x-csrf-token") ?? "";
    const cookieToken = csrfCookieFromRequest(c.req.raw) ?? "";
    if (!verifyCsrf(headerToken, auth.session.csrf_token) || !verifyCsrf(cookieToken, auth.session.csrf_token)) {
      return jsonError(c, 403, "csrf_failed", "The CSRF token is missing or invalid. Refresh the page and try again.");
    }
  }
  await next();
};
