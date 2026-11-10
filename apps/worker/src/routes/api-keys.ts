import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  writeAuditLog,
} from "@cloudcart/core";
import { HttpError } from "@cloudcart/shared";
import { Hono } from "hono";
import type { AppContext } from "../env";
import { db, jsonError, readJson } from "../lib";

export const apiKeyRoutes = new Hono<AppContext>();

function fail(c: Parameters<typeof jsonError>[0], error: unknown) {
  if (error instanceof HttpError) {
    return jsonError(c, error.status, error.code, error.message, error.details);
  }
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: number }).status) || 400
    : 500;
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: string }).code ?? "internal_error")
    : "internal_error";
  if (status >= 500) {
    console.error(JSON.stringify({
      level: "error",
      path: c.req.path,
      message: error instanceof Error ? error.message : String(error),
    }));
  }
  return jsonError(c, status, code, error instanceof Error ? error.message : "Request failed.");
}

apiKeyRoutes.get("/api-keys", async (c) => {
  try {
    const items = await listApiKeys(db(c), c.get("adminId"));
    const current = c.get("apiKeyId");
    return c.json({
      ok: true,
      data: { items: items.map((item) => ({ ...item, current: item.id === current })) },
    });
  } catch (error) {
    return fail(c, error);
  }
});

apiKeyRoutes.post("/api-keys", async (c) => {
  try {
    if (c.get("authMethod") !== "session" || c.get("adminRole") !== "owner") {
      return jsonError(c, 403, "session_required", "Creating API keys requires the store owner's browser session.");
    }
    let body: Record<string, unknown>;
    try {
      body = (await readJson(c)) as Record<string, unknown>;
    } catch (error) {
      const status = Number((error as { status?: number }).status) || 400;
      const code = String((error as { code?: string }).code ?? "invalid_json");
      return jsonError(c, status, code, error instanceof Error ? error.message : "Invalid JSON body.");
    }
    if (body.name !== undefined && typeof body.name !== "string") {
      return jsonError(c, 400, "invalid_name", "name must be a string.");
    }
    if (body.scopes !== undefined && (!Array.isArray(body.scopes) || body.scopes.some((scope) => typeof scope !== "string"))) {
      return jsonError(c, 400, "invalid_scope", "scopes must be an array of strings.");
    }
    if (body.expiresAt !== undefined && body.expiresAt !== null && typeof body.expiresAt !== "string") {
      return jsonError(c, 400, "invalid_expiry", "expiresAt must be an ISO-8601 string.");
    }

    const created = await createApiKey(db(c), c.get("adminId"), {
      name: typeof body.name === "string" ? body.name : undefined,
      scopes: Array.isArray(body.scopes) ? body.scopes as string[] : undefined,
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
    });
    await writeAuditLog(db(c), {
      adminId: c.get("adminId"),
      action: "api_key.created",
      entityType: "api_key",
      entityId: created.id,
      details: { name: created.name, scopes: created.scopes },
      ip: c.req.header("cf-connecting-ip") ?? null,
    });
    return c.json({ ok: true, data: created }, 201);
  } catch (error) {
    return fail(c, error);
  }
});

apiKeyRoutes.delete("/api-keys/self", async (c) => {
  try {
    if (c.get("authMethod") !== "api_key" || !c.get("apiKeyId")) {
      return jsonError(c, 403, "api_key_required", "This endpoint can only be used by an API key.");
    }
    const keyId = c.get("apiKeyId")!;
    const revoked = await revokeApiKey(db(c), c.get("adminId"), keyId);
    if (!revoked) return jsonError(c, 404, "api_key_not_found", "API key not found.");
    await writeAuditLog(db(c), {
      adminId: c.get("adminId"),
      action: "api_key.revoked",
      entityType: "api_key",
      entityId: keyId,
      details: { self: true },
      ip: c.req.header("cf-connecting-ip") ?? null,
    });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});

apiKeyRoutes.delete("/api-keys/:id", async (c) => {
  try {
    const keyId = c.req.param("id");
    const revoked = await revokeApiKey(db(c), c.get("adminId"), keyId);
    if (!revoked) return jsonError(c, 404, "api_key_not_found", "API key not found.");
    await writeAuditLog(db(c), {
      adminId: c.get("adminId"),
      action: "api_key.revoked",
      entityType: "api_key",
      entityId: keyId,
      ip: c.req.header("cf-connecting-ip") ?? null,
    });
    return c.json({ ok: true });
  } catch (error) {
    return fail(c, error);
  }
});
