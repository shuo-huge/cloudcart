import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import {
  createProduct,
  getOrCreateStoreId,
  installRemotePlugin,
} from "@cloudcart/core";
import { parseRemotePluginManifest } from "@cloudcart/plugin-sdk";
import { createPluginJwt } from "@cloudcart/security";

const MASTER = "test-master-key-0123456789abcdef";
const ORIGIN = "https://plugin.example.com";
const PLUGIN_ID = "api-analytics";
const PLUGIN_ORIGIN = ORIGIN;

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

let storeId = "";
let token = "";

const manifest = parseRemotePluginManifest({
  id: PLUGIN_ID,
  name: "API Analytics",
  version: "1.0.0",
  apiVersion: "1",
  type: "analytics",
  runtime: "remote",
  description: "API test plugin",
  author: "Tester",
  capabilities: ["analytics.read"],
  permissions: ["store:read", "products:read", "orders:read", "settings:read", "settings:write", "events:write"],
  service: { baseUrl: "https://plugin.example.com/api", auth: "hmac-sha256" },
  admin: {
    entryUrl: "https://plugin.example.com/admin",
    pages: [{ id: "overview", label: "Overview" }],
  },
});

beforeAll(async () => {
  const db = database();
  await installRemotePlugin(db, {
    manifest,
    manifestUrl: "https://plugin.example.com/cloudcart-plugin.json",
    manifestHash: "hash-api",
    serviceSecret: "test-service-secret-0123456789",
    masterKey: MASTER,
    bundledIds: new Set(),
  });
  storeId = await getOrCreateStoreId(db);
  const created = await createPluginJwt(MASTER, {
    pluginId: PLUGIN_ID,
    storeId,
    adminId: "adm_plugin_test",
    permissions: manifest.permissions,
  });
  token = created.token;
  await createProduct(db, {
    name: "Plugin Product",
    slug: "plugin-product",
    description: "Visible to plugins",
    status: "active",
    type: "simple",
    price: "19.99",
    compareAtPrice: null,
    sku: null,
    stock: 5,
    manageStock: true,
    featured: false,
    seoTitle: null,
    seoDescription: null,
    categoryIds: [],
    tags: [],
    variants: [],
  }, "USD", "adm_plugin_test", null);
});

beforeEach(async () => {
  await database().run("UPDATE plugins SET enabled = 1 WHERE id = ?", [PLUGIN_ID]);
});

async function api(
  path: string,
  options: { token?: string | null; origin?: string | null; method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  const bearer = options.token === undefined ? token : options.token;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const origin = options.origin === undefined ? PLUGIN_ORIGIN : options.origin;
  if (origin) headers.Origin = origin;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return SELF.fetch(`https://example.com${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

describe("plugin API authentication", () => {
  it("requires a bearer token", async () => {
    const response = await api("/api/plugin/v1/store", { token: null });
    expect(response.status).toBe(401);
  });

  it("rejects a wrong origin", async () => {
    const response = await api("/api/plugin/v1/store", { origin: "https://evil.example.com" });
    expect(response.status).toBe(403);
  });

  it("rejects a disabled plugin", async () => {
    await database().run("UPDATE plugins SET enabled = 0 WHERE id = ?", [PLUGIN_ID]);
    const response = await api("/api/plugin/v1/store");
    expect(response.status).toBe(403);
  });

  it("rejects expired tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await createPluginJwt(MASTER, {
      pluginId: PLUGIN_ID, storeId, adminId: "adm", permissions: manifest.permissions, now: now - 100, ttlSeconds: 30,
    });
    const response = await api("/api/plugin/v1/store", { token: expired.token, origin: null });
    expect(response.status).toBe(401);
  });

  it("returns store metadata for a valid token", async () => {
    const response = await api("/api/plugin/v1/store");
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { id: string; name: string; version: string } };
    expect(body.data.id).toBe(storeId);
    expect(body.data.version).toBeTruthy();
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("handles exact-origin CORS preflight", async () => {
    const allowed = await SELF.fetch("https://example.com/api/plugin/v1/store", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN, "Access-Control-Request-Method": "GET" },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);

    const denied = await SELF.fetch("https://example.com/api/plugin/v1/store", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
    });
    expect(denied.status).toBe(403);
  });

  it("enforces permissions independently of the manifest", async () => {
    const limited = await createPluginJwt(MASTER, {
      pluginId: PLUGIN_ID,
      storeId,
      adminId: "adm",
      permissions: ["store:read"],
    });
    const products = await api("/api/plugin/v1/products", { token: limited.token });
    expect(products.status).toBe(403);
    const store = await api("/api/plugin/v1/store", { token: limited.token });
    expect(store.status).toBe(200);
  });
});

describe("plugin API data access", () => {
  it("lists products with the authorized fields", async () => {
    const response = await api("/api/plugin/v1/products");
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { items: Array<{ id: string; name: string; price_cents: number }> } };
    expect(body.data.items.some((item) => item.name === "Plugin Product" && item.price_cents === 1999)).toBe(true);
  });

  it("returns an empty order list when there are no orders", async () => {
    const response = await api("/api/plugin/v1/orders");
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { items: unknown[] } };
    expect(body.data.items).toEqual([]);
  });

  it("reads and writes non-secret plugin settings", async () => {
    const write = await api("/api/plugin/v1/settings", {
      method: "PUT",
      body: { settings: { dashboardPeriod: "30d" } },
    });
    expect(write.status).toBe(200);
    const read = await api("/api/plugin/v1/settings");
    expect(read.status).toBe(200);
    const body = await read.json() as { data: Record<string, string> };
    expect(body.data.dashboardPeriod).toBe("30d");

    const reserved = await api("/api/plugin/v1/settings", {
      method: "PUT",
      body: { settings: { _serviceSecret: "replace" } },
    });
    expect(reserved.status).toBe(400);
  });

  it("records plugin events with the events:write permission", async () => {
    const response = await api("/api/plugin/v1/events", {
      method: "POST",
      body: { type: "dashboard.viewed", payload: { page: "overview" } },
    });
    expect(response.status).toBe(200);
    const log = await database().first<{ action: string; entity_id: string }>(
      "SELECT action, entity_id FROM audit_logs WHERE action = 'plugin.event' ORDER BY created_at DESC LIMIT 1",
    );
    expect(log).toMatchObject({ action: "plugin.event", entity_id: PLUGIN_ID });
  });
});
