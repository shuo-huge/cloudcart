import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import { getRemotePluginRow, getRemoteServiceSecret } from "@cloudcart/core";
import { verifyHmacSha256Raw, sha256Hex } from "@cloudcart/security";
import {
  fetchRemoteManifest,
  installRemotePluginFromUrl as installFromUrl,
  launchRemotePlugin as launch,
  previewRemotePlugin,
} from "../apps/worker/src/remote-plugin-service";
import { remotePluginRequest } from "../apps/worker/src/remote-plugin-client";
import type { Env } from "../apps/worker/src/env";

const MASTER = "test-master-key-0123456789abcdef";
const ENV = { APP_MASTER_KEY: MASTER, APP_ENV: "test", PLUGIN_ALLOW_INSECURE_ORIGINS: "1" } as unknown as Env;

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

function remoteManifest(overrides: Record<string, unknown> = {}) {
  return {
    id: "service-analytics",
    name: "Service Analytics",
    version: "1.0.0",
    apiVersion: "1",
    type: "analytics",
    runtime: "remote",
    description: "Analytics integration",
    author: "Example",
    capabilities: ["analytics.read"],
    permissions: ["store:read", "products:read"],
    service: { baseUrl: "https://service.example.com/api/v1", auth: "hmac-sha256" },
    admin: {
      entryUrl: "https://service.example.com/admin",
      pages: [{ id: "overview", label: "Overview" }],
    },
    ...overrides,
  };
}

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

function mockFetch(handler: (request: CapturedRequest) => Response | Promise<Response>): {
  calls: CapturedRequest[];
  restore: () => void;
} {
  const original = globalThis.fetch;
  const calls: CapturedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const request = { url, init: init ?? {} };
    calls.push(request);
    return handler(request);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("remote manifest fetching", () => {
  it("fetches, validates, and hashes a manifest", async () => {
    const mock = mockFetch(() => jsonResponse(remoteManifest()));
    try {
      const result = await fetchRemoteManifest("https://service.example.com/cloudcart-plugin.json");
      expect(result.manifest.id).toBe("service-analytics");
      expect(result.manifestHash).toMatch(/^[a-f0-9]{64}$/);
      expect(mock.calls).toHaveLength(1);
    } finally {
      mock.restore();
    }
  });

  it("rejects non-HTTPS URLs before making a request", async () => {
    const mock = mockFetch(() => jsonResponse({}));
    try {
      await expect(fetchRemoteManifest("http://service.example.com/plugin.json"))
        .rejects.toMatchObject({ code: "manifest_invalid" });
      expect(mock.calls).toHaveLength(0);
    } finally {
      mock.restore();
    }
  });

  it("follows validated HTTPS redirects", async () => {
    let call = 0;
    const mock = mockFetch(() => {
      call += 1;
      if (call === 1) {
        return new Response(null, { status: 302, headers: { location: "https://service.example.com/manifest.json" } });
      }
      return jsonResponse(remoteManifest());
    });
    try {
      const result = await fetchRemoteManifest("https://service.example.com/cloudcart-plugin.json");
      expect(result.manifestUrl).toBe("https://service.example.com/manifest.json");
      expect(mock.calls).toHaveLength(2);
    } finally {
      mock.restore();
    }
  });

  it("rejects oversized and non-JSON manifests", async () => {
    const oversized = mockFetch(() => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json", "content-length": String(100_000) },
    }));
    try {
      await expect(fetchRemoteManifest("https://service.example.com/plugin.json"))
        .rejects.toMatchObject({ code: "manifest_too_large" });
    } finally {
      oversized.restore();
    }
    const nonJson = mockFetch(() => new Response("hello", { status: 200, headers: { "content-type": "text/plain" } }));
    try {
      await expect(fetchRemoteManifest("https://service.example.com/plugin.json"))
        .rejects.toMatchObject({ code: "manifest_invalid" });
    } finally {
      nonJson.restore();
    }
  });

  it("returns preview warnings and permission metadata", async () => {
    const mock = mockFetch(() => jsonResponse(remoteManifest({ admin: { entryUrl: "https://service.example.com/admin", pages: [] } })));
    try {
      const preview = await previewRemotePlugin("https://service.example.com/plugin.json");
      expect(preview.adminOrigin).toBe("https://service.example.com");
      expect(preview.permissions).toEqual(["store:read", "products:read"]);
      expect(preview.warnings.length).toBeGreaterThan(0);
    } finally {
      mock.restore();
    }
  });
});

describe("remote service client and launch", () => {
  it("installs from a manifest URL with a generated secret", async () => {
    const mock = mockFetch(() => jsonResponse(remoteManifest()));
    try {
      const installed = await installFromUrl(database(), ENV, {
        manifestUrl: "https://service.example.com/cloudcart-plugin.json",
        bundledIds: new Set(),
      });
      expect(installed.id).toBe("service-analytics");
      expect(installed.serviceSecret).toBeTruthy();
    } finally {
      mock.restore();
    }
  });

  it("signs remote requests with the exact HMAC canonical string", async () => {
    const db = database();
    const plugin = await getRemotePluginRow(db, "service-analytics");
    expect(plugin).not.toBeNull();
    const secret = await getRemoteServiceSecret(db, "service-analytics", MASTER);
    expect(secret).toBeTruthy();
    const mock = mockFetch(async (request) => {
      expect(request.init.method).toBe("POST");
      expect(request.init.body).toBe('{"hello":"world"}');
      const headers = new Headers(request.init.headers);
      const timestamp = headers.get("x-cloudcart-timestamp")!;
      const nonce = headers.get("x-cloudcart-nonce")!;
      const signature = headers.get("x-cloudcart-signature")!;
      const hash = await sha256Hex('{"hello":"world"}');
      const canonical = `${timestamp}\n${nonce}\nPOST\n/api/v1/echo\n${hash}`;
      expect(await verifyHmacSha256Raw(secret!, canonical, signature)).toBe(true);
      return jsonResponse({ ok: true, echoed: true });
    });
    try {
      const result = await remotePluginRequest(db, MASTER, plugin!, "/echo", {
        method: "POST",
        body: { hello: "world" },
      });
      expect(result.data).toEqual({ ok: true, echoed: true });
      const updated = await getRemotePluginRow(db, "service-analytics");
      expect(updated?.health_status).toBe("ok");
    } finally {
      mock.restore();
    }
  });

  it("maps timeouts to service_timeout and records health errors", async () => {
    const db = database();
    const plugin = await getRemotePluginRow(db, "service-analytics");
    const mock = mockFetch(() => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    try {
      await expect(remotePluginRequest(db, MASTER, plugin!, "/slow"))
        .rejects.toMatchObject({ code: "service_timeout" });
      const updated = await getRemotePluginRow(db, "service-analytics");
      expect(updated?.health_status).toBe("error");
      expect(updated?.last_error).toContain("timed out");
    } finally {
      mock.restore();
    }
  });

  it("issues a scoped launch token for an enabled plugin", async () => {
    const db = database();
    await db.run("UPDATE plugins SET enabled = 1 WHERE id = ?", ["service-analytics"]);
    const result = await launch(db, ENV, "service-analytics", "adm_test", "overview");
    expect(result.token.split(".")).toHaveLength(3);
    expect(result.permissions).toEqual(["store:read", "products:read"]);
    expect(result.storeId).toMatch(/^store_/);
  });

  it("refuses launch for a disabled plugin or unknown page", async () => {
    const db = database();
    await db.run("UPDATE plugins SET enabled = 0 WHERE id = ?", ["service-analytics"]);
    await expect(launch(db, ENV, "service-analytics", "adm_test", "overview"))
      .rejects.toMatchObject({ code: "plugin_disabled" });
    await db.run("UPDATE plugins SET enabled = 1 WHERE id = ?", ["service-analytics"]);
    await expect(launch(db, ENV, "service-analytics", "adm_test", "missing"))
      .rejects.toMatchObject({ code: "invalid_page" });
  });
});
