import { Hono, type Context } from "hono";
import { Database } from "@cloudcart/database";
import { isSafeMediaKey, listEnabledRemoteAdminOrigins } from "@cloudcart/core";
import { HttpError } from "@cloudcart/shared";
import { securityHeaders } from "@cloudcart/security";
import type { AppContext } from "./env";
import { CLOUDCART_VERSION } from "./env";
import { adminAuth } from "./middleware";
import { adminRoutes } from "./routes/admin";
import { apiKeyRoutes } from "./routes/api-keys";
import { authRoutes, serverSetupPage, serverSetupSubmit } from "./routes/auth";
import { capabilityRoutes } from "./routes/capabilities";
import { remotePluginRoutes } from "./routes/remote-plugins";
import { pluginApiAuth } from "./plugin-api-auth";
import { pluginApiRoutes } from "./routes/plugin-api";
import { insecurePluginsAllowed } from "./remote-plugin-service";
import { publicRoutes } from "./routes/public";
import { paymentReturnRoutes, webhookRoutes } from "./routes/payments";
import { storefrontRoutes } from "./routes/storefront";
import { jsonError } from "./lib";

const app = new Hono<AppContext>();

app.use("*", async (c, next) => {
  await next();
  const defaults = securityHeaders({
    allowInlineStyles: true,
    allowInlineScripts: false,
  });
  for (const [key, value] of Object.entries(defaults)) {
    // Do not overwrite route-specific policies (e.g. the sandboxed media CSP).
    if (!c.res.headers.has(key)) c.res.headers.set(key, value);
  }
  c.res.headers.set("X-CloudCart-Version", CLOUDCART_VERSION);
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});

app.get("/api/health", async (c) => {
  let database = "unavailable";
  try {
    const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    database = row?.ok === 1 ? "ok" : "unavailable";
  } catch {
    database = "unavailable";
  }
  return c.json({
    status: database === "ok" ? "ok" : "degraded",
    app: "cloudcart",
    version: CLOUDCART_VERSION,
    database,
    time: new Date().toISOString(),
  });
});

app.get("/api/setup/status", async (c) => {
  let installed = false;
  try {
    const row = await c.env.DB.prepare(
      "SELECT installed_at FROM installation_state WHERE id = 1",
    ).first<{ installed_at: string }>();
    installed = Boolean(row);
  } catch {
    installed = false;
  }
  return c.json({
    installed,
    setupRequired: !installed,
    setupTokenConfigured: Boolean(c.env.SETUP_TOKEN),
  });
});

/* One-time server-rendered setup (works without JavaScript). */
app.get("/setup", (c) => serverSetupPage(c));
app.post("/setup", (c) => serverSetupSubmit(c));

/* Admin API (login/setup/status are exempt inside the middleware). */
app.use("/api/admin/*", adminAuth);
app.route("/api/admin", authRoutes);
app.route("/api/admin", apiKeyRoutes);
app.route("/api/admin", capabilityRoutes);
app.route("/api/admin", remotePluginRoutes);
app.route("/api/admin", adminRoutes);

/* Plugin API: bearer-token auth and exact-origin CORS, not admin sessions. */
app.use("/api/plugin/v1/*", pluginApiAuth);
app.route("/api/plugin/v1", pluginApiRoutes);

/* Public storefront API and payment callbacks. */
app.route("/api", publicRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/api/payments", paymentReturnRoutes);

/* Media served from R2, never executed by the browser. */
app.get("/media/*", async (c) => {
  const rawKey = c.req.path.slice("/media/".length);
  let key: string;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    return c.text("Not found", 404);
  }
  if (!isSafeMediaKey(key)) return c.text("Not found", 404);
  if (!c.env.MEDIA) return c.text("Media storage is not configured.", 404);
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.text("Not found", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  return new Response(object.body, { headers });
});

/* Admin single-page app shell for client-side routes. */
async function serveAdminShell(c: Context<AppContext>): Promise<Response> {
  if (!c.env.ASSETS) {
    return new Response("Admin assets are not available.", { status: 503 });
  }
  try {
    const url = new URL("/admin/index.html", c.req.url);
    const asset = await c.env.ASSETS.fetch(new Request(url.toString(), {
      method: "GET",
      headers: c.req.raw.headers,
    }));
    if (asset.status === 404) {
      return new Response(
        "The admin UI has not been built. Run `pnpm build` before starting the Worker.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    let frameOrigins: string[] = [];
    try {
      frameOrigins = await listEnabledRemoteAdminOrigins(new Database(c.env.DB));
    } catch {
      frameOrigins = [];
    }
    const headers = new Headers(asset.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    const security = securityHeaders({
      allowInlineStyles: true,
      allowInlineScripts: false,
      frameOrigins,
      allowInsecureFrameOrigins: insecurePluginsAllowed(c.env),
    });
    headers.set("Content-Security-Policy", security["Content-Security-Policy"]!);
    return new Response(asset.body, { status: 200, headers });
  } catch {
    return new Response("Admin assets are not available.", { status: 503 });
  }
}

app.get("/admin", (c) => serveAdminShell(c));
app.get("/admin/*", (c) => serveAdminShell(c));

/* Storefront SSR + catch-all. Registered last. */
app.route("/", storefrontRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ ok: false, error: { code: "not_found", message: "Not found" } }, 404);
  }
  return c.text("Not found", 404);
});

app.onError((error, c) => {
  if (error instanceof HttpError) {
    if (c.req.path.startsWith("/api/")) {
      return jsonError(c, error.status, error.code, error.message, error.details);
    }
    return c.text(error.message, error.status as 400);
  }
  console.error(JSON.stringify({
    level: "error",
    path: c.req.path,
    message: error.message,
    stack: error.stack,
  }));
  if (c.req.path.startsWith("/api/")) {
    return c.json({
      ok: false,
      error: {
        code: "internal_error",
        message: c.env.APP_ENV === "development" ? error.message : "Internal server error",
      },
    }, 500);
  }
  return c.text("Internal server error", 500);
});

export default app;
