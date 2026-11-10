import {
  apiKeyHasScope,
  authenticateApiKey,
  authenticateSession,
  isApiKeySessionOnly,
  requiredScopesForRequest,
  touchApiKey,
} from "@cloudcart/core";
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

  const authorization = c.req.header("authorization");
  if (authorization) {
    const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
    if (!bearer) return jsonError(c, 401, "api_key_invalid", "Use a Bearer API key.");
    const principal = await authenticateApiKey(db(c), bearer);
    if (!principal) {
      return jsonError(c, 401, "api_key_invalid", "The API key is invalid, expired, or revoked.");
    }
    if (isApiKeySessionOnly(c.req.method, c.req.path)) {
      return jsonError(c, 403, "session_required", "This operation requires an administrator session.");
    }
    const required = requiredScopesForRequest(c.req.method, c.req.path);
    if (required && !apiKeyHasScope(principal.key.scopes, required)) {
      return jsonError(c, 403, "insufficient_scope", `This API key needs the ${required} scope.`);
    }
    c.set("adminId", principal.admin.id);
    c.set("adminEmail", principal.admin.email);
    c.set("adminRole", principal.admin.role);
    c.set("sessionId", "");
    c.set("csrfToken", "");
    c.set("authMethod", "api_key");
    c.set("apiKeyId", principal.key.id);
    c.set("apiKeyScopes", principal.key.scopes);
    await touchApiKey(db(c), principal.key.id);
    await next();
    return;
  }

  const auth = await authenticateSession(db(c), masterKey, sessionTokenFromRequest(c.req.raw));
  if (!auth) return jsonError(c, 401, "unauthorized", "Sign in is required.");
  c.set("adminId", auth.admin.id);
  c.set("adminEmail", auth.admin.email);
  c.set("adminRole", auth.admin.role);
  c.set("sessionId", auth.session.id);
  c.set("csrfToken", auth.session.csrf_token);
  c.set("authMethod", "session");

  if (isMutating(c.req.method)) {
    const headerToken = c.req.header("x-csrf-token") ?? "";
    const cookieToken = csrfCookieFromRequest(c.req.raw) ?? "";
    if (!verifyCsrf(headerToken, auth.session.csrf_token) || !verifyCsrf(cookieToken, auth.session.csrf_token)) {
      return jsonError(c, 403, "csrf_failed", "The CSRF token is missing or invalid. Refresh the page and try again.");
    }
  }
  await next();
};
