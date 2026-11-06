import { Database } from "@cloudcart/database";
import {
  getInstallation,
  isInstalled,
  loginAdmin,
  logoutAdmin,
  SESSION_TTL_SECONDS,
  setupStore,
} from "@cloudcart/core";
import { escapeHtml } from "@cloudcart/shared";
import { Hono, type Context } from "hono";
import type { AppContext } from "../env";
import {
  clearSessionCookies,
  clientIp,
  db,
  jsonError,
  readJson,
  setSessionCookies,
} from "../lib";

export const authRoutes = new Hono<AppContext>();

authRoutes.post("/login", async (c) => {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await readJson(c)) as { email?: unknown; password?: unknown };
  } catch (error) {
    return jsonError(c, 415, "invalid_content_type", error instanceof Error ? error.message : "Invalid request.");
  }
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return jsonError(c, 400, "invalid_input", "Email and password are required.");
  }
  const result = await loginAdmin(db(c), c.env.APP_MASTER_KEY, {
    email: body.email,
    password: body.password,
    ip: clientIp(c.req.raw),
    userAgent: c.req.header("user-agent") ?? null,
  });
  if (!result.ok) {
    return jsonError(c, result.code === "rate_limited" ? 429 : 401, result.code, result.message);
  }
  setSessionCookies(c, result.sessionToken, result.csrfToken, SESSION_TTL_SECONDS);
  return c.json({
    ok: true,
    admin: { id: result.admin.id, email: result.admin.email, name: result.admin.name, role: result.admin.role },
    csrfToken: result.csrfToken,
  });
});

authRoutes.post("/logout", async (c) => {
  const sessionId = c.get("sessionId");
  const adminId = c.get("adminId");
  if (sessionId && adminId) {
    await logoutAdmin(db(c), sessionId, adminId, clientIp(c.req.raw));
  }
  clearSessionCookies(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const admin = await db(c).first<{ id: string; email: string; name: string; role: string }>(
    "SELECT id, email, name, role FROM admins WHERE id = ?",
    [c.get("adminId")],
  );
  if (!admin) return jsonError(c, 401, "unauthorized", "Sign in is required.");
  return c.json({ ok: true, admin, csrfToken: c.get("csrfToken") });
});

authRoutes.post("/setup", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await readJson(c)) as Record<string, unknown>;
  } catch (error) {
    return jsonError(c, 415, "invalid_content_type", error instanceof Error ? error.message : "Invalid request.");
  }
  const result = await setupStore(
    db(c),
    c.env.APP_MASTER_KEY,
    c.env.SETUP_TOKEN,
    {
      setupToken: String(body.setupToken ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      name: String(body.name ?? ""),
      storeName: String(body.storeName ?? c.env.STORE_NAME ?? "My Store"),
      currency: String(body.currency ?? c.env.STORE_CURRENCY ?? "USD"),
    },
    clientIp(c.req.raw),
  );
  if (!result.ok) {
    const status = result.error.code === "already_installed" ? 409 : result.error.code === "invalid_token" ? 403 : 400;
    return jsonError(c, status, result.error.code, result.error.message);
  }
  const login = await loginAdmin(db(c), c.env.APP_MASTER_KEY, {
    email: String(body.email ?? ""),
    password: String(body.password ?? ""),
    ip: clientIp(c.req.raw),
    userAgent: c.req.header("user-agent") ?? null,
  });
  if (login.ok) {
    setSessionCookies(c, login.sessionToken, login.csrfToken, SESSION_TTL_SECONDS);
    return c.json({
      ok: true,
      admin: { id: login.admin.id, email: login.admin.email, name: login.admin.name },
      csrfToken: login.csrfToken,
    });
  }
  return c.json({ ok: true, admin: { id: result.adminId }, csrfToken: null });
});

authRoutes.get("/setup/status", async (c) => {
  const database = db(c);
  const installed = await isInstalled(database);
  return c.json({
    ok: true,
    installed,
    setupRequired: !installed,
    setupTokenConfigured: Boolean(c.env.SETUP_TOKEN),
    installation: installed ? await getInstallation(database) : null,
  });
});

export async function serverSetupPage(c: Context<AppContext>): Promise<Response> {
  const database = new Database(c.env.DB);
  if (await isInstalled(database)) return c.redirect("/admin", 302);

  const tokenConfigured = Boolean(c.env.SETUP_TOKEN);
  const setupToken = tokenConfigured ? (c.req.query("token") ?? "") : "";
  const warning = !tokenConfigured
    ? "The installation token has not been generated yet. Re-run the CloudCart deployment."
    : !setupToken
      ? "Open the one-time setup link printed in the CloudCart deployment log. You do not need to enter a token."
      : null;

  // The one-time token is carried in the setup URL. Never cache this page or
  // send the token as a referrer to another origin.
  c.header("Cache-Control", "no-store, max-age=0");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Robots-Tag", "noindex, nofollow");

  return c.html(
    renderSetupHtml("", warning, setupToken),
    tokenConfigured ? 200 : 503,
  );
}

export async function serverSetupSubmit(c: Context<AppContext>): Promise<Response> {
  const form = await c.req.raw.formData();
  const values = {
    setupToken: String(form.get("setupToken") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    name: String(form.get("name") ?? ""),
    storeName: c.env.STORE_NAME ?? "My Store",
    currency: c.env.STORE_CURRENCY ?? "USD",
  };
  const database = new Database(c.env.DB);
  const result = await setupStore(
    database,
    c.env.APP_MASTER_KEY,
    c.env.SETUP_TOKEN,
    values,
    clientIp(c.req.raw),
  );
  if (!result.ok) {
    return c.html(renderSetupHtml(result.error.message, null, values.setupToken), 400);
  }
  const login = await loginAdmin(database, c.env.APP_MASTER_KEY, {
    email: values.email,
    password: values.password,
    ip: clientIp(c.req.raw),
    userAgent: c.req.header("user-agent") ?? null,
  });
  if (login.ok) {
    setSessionCookies(c, login.sessionToken, login.csrfToken, SESSION_TTL_SECONDS);
  }
  return c.redirect("/admin", 303);
}

export function renderSetupHtml(error: string, warning: string | null, setupToken = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Set up CloudCart</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f2ee; color: #1e1e1c; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px; }
  main { width: min(520px, 100%); background: #fff; border: 1px solid #e2ded5; border-radius: 10px; padding: 36px; }
  h1 { margin: 0 0 6px; font-size: 1.8rem; letter-spacing: -0.02em; }
  p.lead { margin: 0 0 26px; color: #6d6a63; font-size: .95rem; }
  label { display: block; font-size: .8rem; font-weight: 600; margin: 16px 0 6px; }
  input, select { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid #d8d4cb; border-radius: 6px; font: inherit; background: #fff; }
  button { margin-top: 26px; width: 100%; min-height: 46px; border: 0; border-radius: 6px; background: #1f2937; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  .error { background: #fdf1ef; color: #8a2f20; border: 1px solid #e7b8b0; padding: 12px 14px; border-radius: 6px; font-size: .9rem; }
  .warning { background: #fdf8e8; color: #6d5410; border: 1px solid #e5d49a; padding: 12px 14px; border-radius: 6px; font-size: .9rem; }
  small { display: block; margin-top: 6px; color: #8a857c; font-size: .78rem; }
</style>
</head>
<body>
<main>
  <h1>Set up CloudCart</h1>
  <p class="lead">Create the store owner account. This screen closes permanently once setup is complete.</p>
  ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
  ${warning ? `<div class="warning">${escapeHtml(warning)}</div>` : ""}
  <form method="post" action="/setup">
    <input type="hidden" name="setupToken" value="${escapeHtml(setupToken)}">
    <label for="name">Your name</label>
    <input id="name" name="name" required maxlength="120">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" required autocomplete="username">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password">
    <small>At least 8 characters and must include a letter and a number.</small>
    <button type="submit"${setupToken ? "" : " disabled"}>Create administrator</button>
  </form>
</main>
</body>
</html>`;
}
