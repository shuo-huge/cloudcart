import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import {
  getOrCreateStoreId,
  getRemoteServiceSecret,
  installRemotePlugin,
  listPlugins,
  PluginRegistry,
  setPluginEnabled,
  uninstallRemotePlugin,
  updateRemotePlugin,
} from "@cloudcart/core";
import { parseRemotePluginManifest } from "@cloudcart/plugin-sdk";

const MASTER = "test-master-key-0123456789abcdef";

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

function manifest(overrides: Record<string, unknown> = {}) {
  return parseRemotePluginManifest({
    id: "example-analytics",
    name: "Analytics Plugin",
    version: "1.0.0",
    apiVersion: "1",
    type: "analytics",
    runtime: "remote",
    description: "Analytics integration",
    author: "Example Developer",
    capabilities: ["analytics.read"],
    permissions: ["orders:read", "products:read"],
    service: { baseUrl: "https://plugin.example.com/api/cloudcart/v1", auth: "hmac-sha256" },
    admin: {
      entryUrl: "https://plugin.example.com/admin",
      pages: [{ id: "overview", label: "Overview", icon: "chart" }],
    },
    ...overrides,
  });
}

describe("remote plugin lifecycle", () => {
  it("creates and reuses a stable store id", async () => {
    const db = database();
    const first = await getOrCreateStoreId(db);
    const second = await getOrCreateStoreId(db);
    expect(first).toMatch(/^store_[a-f0-9]{32}$/);
    expect(second).toBe(first);
  });

  it("installs a remote plugin disabled, with an encrypted service secret", async () => {
    const db = database();
    const installed = await installRemotePlugin(db, {
      manifest: manifest(),
      manifestUrl: "https://plugin.example.com/cloudcart-plugin.json",
      manifestHash: "hash-1",
      masterKey: MASTER,
      bundledIds: new Set(),
    });
    expect(installed.id).toBe("example-analytics");
    expect(installed.serviceSecret).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    const row = await db.first<{ runtime: string; enabled: number; built_in: number; manifest_hash: string }>(
      "SELECT runtime, enabled, built_in, manifest_hash FROM plugins WHERE id = ?",
      ["example-analytics"],
    );
    expect(row).toMatchObject({ runtime: "remote", enabled: 0, built_in: 0, manifest_hash: "hash-1" });
    expect(await getRemoteServiceSecret(db, "example-analytics", MASTER)).toBe(installed.serviceSecret);

    const encrypted = await db.first<{ encrypted: number; value: string }>(
      "SELECT encrypted, value FROM plugin_settings WHERE plugin_id = ? AND key = '_serviceSecret'",
      ["example-analytics"],
    );
    expect(encrypted?.encrypted).toBe(1);
    expect(encrypted?.value.startsWith("v1.")).toBe(true);
  });

  it("lists remote plugins without marking them unavailable and enables them immediately", async () => {
    const db = database();
    const registry = new PluginRegistry([]);
    const before = await listPlugins(db, registry);
    expect(before.find((plugin) => plugin.id === "example-analytics")).toMatchObject({
      runtime: "remote",
      bundled: false,
      adminOrigin: "https://plugin.example.com",
      adminPages: [{ id: "overview", label: "Overview", icon: "chart" }],
    });

    await setPluginEnabled(db, registry, "example-analytics", true);
    const after = await listPlugins(db, registry);
    expect(after.find((plugin) => plugin.id === "example-analytics")?.enabled).toBe(1);
  });

  it("updates a remote plugin without losing enabled state and rotates the secret when the origin changes", async () => {
    const db = database();
    const updated = await updateRemotePlugin(db, "example-analytics", {
      manifest: manifest({ version: "1.1.0" }),
      manifestUrl: "https://plugin.example.com/cloudcart-plugin.json",
      manifestHash: "hash-2",
      masterKey: MASTER,
    });
    expect(updated.serviceSecret).toBeUndefined();
    const row = await db.first<{ enabled: number; version: string; manifest_hash: string }>(
      "SELECT enabled, version, manifest_hash FROM plugins WHERE id = ?",
      ["example-analytics"],
    );
    expect(row).toMatchObject({ enabled: 1, version: "1.1.0", manifest_hash: "hash-2" });

    const moved = await updateRemotePlugin(db, "example-analytics", {
      manifest: manifest({
        version: "1.2.0",
        service: { baseUrl: "https://plugin-v2.example.com/api/cloudcart/v1", auth: "hmac-sha256" },
        admin: { entryUrl: "https://plugin-v2.example.com/admin", pages: [] },
      }),
      manifestUrl: "https://plugin.example.com/cloudcart-plugin.json",
      manifestHash: "hash-3",
      masterKey: MASTER,
    });
    expect(moved.serviceSecret).toBeTruthy();
    expect(await getRemoteServiceSecret(db, "example-analytics", MASTER)).toBe(moved.serviceSecret);
  });

  it("soft-deletes on uninstall and keeps the business data row", async () => {
    const db = database();
    await uninstallRemotePlugin(db, "example-analytics");
    const row = await db.first<{ enabled: number; uninstalled_at: string | null }>(
      "SELECT enabled, uninstalled_at FROM plugins WHERE id = ?",
      ["example-analytics"],
    );
    expect(row?.enabled).toBe(0);
    expect(row?.uninstalled_at).toBeTruthy();

    const registry = new PluginRegistry([]);
    const views = await listPlugins(db, registry);
    expect(views.some((plugin) => plugin.id === "example-analytics")).toBe(false);
  });

  it("rejects a remote id that conflicts with a bundled plugin", async () => {
    const db = database();
    await expect(installRemotePlugin(db, {
      manifest: manifest({ id: "stripe" }),
      manifestUrl: "https://plugin.example.com/cloudcart-plugin.json",
      manifestHash: "hash-x",
      masterKey: MASTER,
      bundledIds: new Set(["stripe"]),
    })).rejects.toMatchObject({ code: "plugin_id_conflict" });
  });
});
