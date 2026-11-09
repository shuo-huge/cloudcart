import {
  getRemotePluginRow,
  listPlugins,
  uninstallRemotePlugin,
  writeAuditLog,
} from "@cloudcart/core";
import { HttpError } from "@cloudcart/shared";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db, readJson } from "../lib";
import { pluginRegistry } from "../plugin-registry";
import type { AppContext } from "../env";
import {
  healthCheckRemotePlugin,
  insecurePluginsAllowed,
  installRemotePluginFromUrl,
  launchRemotePlugin,
  previewRemotePlugin,
  updateRemotePluginFromUrl,
} from "../remote-plugin-service";

export const remotePluginRoutes = new Hono<AppContext>();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "invalid_input", result.error.issues[0]?.message ?? "Invalid input.");
  }
  return result.data;
}

async function audit(
  c: Context<AppContext>,
  action: string,
  pluginId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await writeAuditLog(db(c), {
    adminId: c.get("adminId"),
    action,
    entityType: "plugin",
    entityId: pluginId,
    details,
    ip: c.req.header("cf-connecting-ip") ?? null,
  });
}

function fail(c: Context<AppContext>, error: unknown): Response {
  if (error instanceof HttpError) {
    return c.json({
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    }, error.status as 400);
  }
  console.error(JSON.stringify({
    level: "error",
    scope: "remote_plugin",
    message: error instanceof Error ? error.message : String(error),
  }));
  return c.json({ ok: false, error: { code: "internal_error", message: "Internal server error." } }, 500);
}

const manifestUrlSchema = z.object({
  manifestUrl: z.string().trim().min(8).max(2048),
});

const installSchema = manifestUrlSchema.extend({
  manifestHash: z.string().trim().max(128).optional(),
  serviceSecret: z.string().trim().min(16).max(256).optional(),
});

remotePluginRoutes.post("/plugins/remote/preview", async (c) => {
  try {
    const body = parse(manifestUrlSchema, await readJson(c));
    return c.json({
      ok: true,
      data: await previewRemotePlugin(body.manifestUrl, { allowInsecure: insecurePluginsAllowed(c.env) }),
    });
  } catch (error) {
    return fail(c, error);
  }
});

remotePluginRoutes.post("/plugins/remote/install", async (c) => {
  try {
    const body = parse(installSchema, await readJson(c));
    const result = await installRemotePluginFromUrl(db(c), c.env, {
      manifestUrl: body.manifestUrl,
      manifestHash: body.manifestHash,
      serviceSecret: body.serviceSecret,
      bundledIds: new Set(pluginRegistry.all().map((manifest) => manifest.id)),
    });
    await audit(c, "plugin.remote_installed", result.id);
    return c.json({ ok: true, data: result }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

remotePluginRoutes.post("/plugins/:id/update/preview", async (c) => {
  try {
    const body = parse(manifestUrlSchema, await readJson(c));
    const preview = await previewRemotePlugin(body.manifestUrl, { allowInsecure: insecurePluginsAllowed(c.env) });
    if (preview.manifest.id !== c.req.param("id")) {
      throw new HttpError(400, "plugin_id_mismatch", "The updated manifest uses a different plugin id.");
    }
    return c.json({ ok: true, data: preview });
  } catch (error) {
    return fail(c, error);
  }
});

remotePluginRoutes.post("/plugins/:id/update", async (c) => {
  try {
    const body = parse(installSchema, await readJson(c));
    const result = await updateRemotePluginFromUrl(db(c), c.env, c.req.param("id"), {
      manifestUrl: body.manifestUrl,
      manifestHash: body.manifestHash,
      serviceSecret: body.serviceSecret,
    });
    await audit(c, "plugin.remote_updated", result.id);
    return c.json({ ok: true, data: result });
  } catch (error) {
    return fail(c, error);
  }
});

remotePluginRoutes.post("/plugins/:id/uninstall", async (c) => {
  try {
    await uninstallRemotePlugin(db(c), c.req.param("id"));
    await audit(c, "plugin.remote_uninstalled", c.req.param("id"));
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

remotePluginRoutes.post("/plugins/:id/health", async (c) => {
  try {
    const plugin = await getRemotePluginRow(db(c), c.req.param("id"));
    if (!plugin) throw new HttpError(404, "plugin_not_found", "Remote plugin not found.");
    const result = await healthCheckRemotePlugin(db(c), c.env, plugin);
    await audit(c, "plugin.remote_health_checked", plugin.id, { ok: result.ok });
    return c.json({ ok: true, data: result });
  } catch (error) {
    return fail(c, error);
  }
});

remotePluginRoutes.post("/plugins/:id/launch", async (c) => {
  try {
    const body = parse(z.object({
      pageId: z.string().trim().max(40).optional(),
    }), await readJson(c).catch(() => ({})));
    const result = await launchRemotePlugin(
      db(c),
      c.env,
      c.req.param("id"),
      c.get("adminId"),
      body.pageId,
    );
    return c.json({ ok: true, data: result });
  } catch (error) {
    return fail(c, error);
  }
});

remotePluginRoutes.get("/plugins/:id", async (c) => {
  try {
    const plugins = await listPlugins(db(c), pluginRegistry);
    const plugin = plugins.find((entry) => entry.id === c.req.param("id"));
    if (!plugin) throw new HttpError(404, "plugin_not_found", "Plugin not found.");
    return c.json({ ok: true, data: plugin });
  } catch (error) {
    return fail(c, error);
  }
});
