import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BASE, createClient, TEST_OWNER } from "./support";

const testEnv = env as unknown as { DB: D1Database };

interface CreatedKey {
  id: string;
  token: string;
  scopes: string[];
}

async function createKey(
  client: ReturnType<typeof createClient>,
  input: Record<string, unknown> = {},
): Promise<CreatedKey> {
  const response = await client.json("/api/admin/api-keys", "POST", {
    name: "Test key",
    ...input,
  }, client.csrfHeaders());
  const text = await response.text();
  expect(response.status, text).toBe(201);
  return (JSON.parse(text) as { data: CreatedKey }).data;
}

function keyRequest(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return SELF.fetch(BASE + path, { ...init, headers, redirect: "manual" });
}

describe("admin API keys", () => {
  it("creates a key once and authenticates bearer requests without CSRF", async () => {
    const client = createClient();
    await client.ensureSession();
    const created = await createKey(client, { scopes: ["products:read", "products:write"] });
    expect(created.token.startsWith("cck_")).toBe(true);
    expect(created.scopes).toEqual(["products:read", "products:write"]);

    const list = await client.request("/api/admin/api-keys");
    expect(list.status).toBe(200);
    const body = (await list.json()) as { data: { items: Array<{ id: string; token?: string }> } };
    expect(body.data.items.some((item) => item.id === created.id)).toBe(true);
    expect(JSON.stringify(body)).not.toContain(created.token);

    const me = await keyRequest(created.token, "/api/admin/me");
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      authMethod: string;
      csrfToken: null;
      keyId: string;
      scopes: string[];
      admin: { email: string };
    };
    expect(meBody.authMethod).toBe("api_key");
    expect(meBody.csrfToken).toBeNull();
    expect(meBody.keyId).toBe(created.id);
    expect(meBody.scopes).toContain("products:write");
    expect(meBody.admin.email).toBe(TEST_OWNER.email);

    const products = await keyRequest(created.token, "/api/admin/products");
    expect(products.status).toBe(200);

    const product = await keyRequest(created.token, "/api/admin/products", {
      method: "POST",
      body: JSON.stringify({
        name: "Key Product",
        description: "Created by an API key.",
        status: "active",
        type: "simple",
        price: "12.50",
        stock: 3,
        manageStock: true,
        featured: false,
        tags: [],
        categoryIds: [],
        variants: [],
      }),
    });
    const productText = await product.text();
    expect(product.status, productText).toBe(201);
    const productBody = JSON.parse(productText) as { data: { id: string } };
    expect(productBody.data.id.startsWith("prd_")).toBe(true);

    const stored = await testEnv.DB.prepare(
      "SELECT token_hash FROM admin_api_keys WHERE id = ?",
    ).bind(created.id).first<{ token_hash: string }>();
    expect(stored?.token_hash).toBeTruthy();
    expect(stored?.token_hash).not.toBe(created.token);
    expect(stored?.token_hash).toHaveLength(64);

    const used = await testEnv.DB.prepare(
      "SELECT last_used_at FROM admin_api_keys WHERE id = ?",
    ).bind(created.id).first<{ last_used_at: string | null }>();
    expect(used?.last_used_at).toBeTruthy();

    const audit = await testEnv.DB.prepare(
      "SELECT details_json FROM audit_logs WHERE action = 'product.created' AND entity_id = ?",
    ).bind(productBody.data.id).first<{ details_json: string }>();
    expect(audit?.details_json).toContain('"via":"api_key"');
    expect(audit?.details_json).toContain(created.id);
  });

  it("enforces resource scopes and keeps session CSRF protection", async () => {
    const client = createClient();
    await client.ensureSession();
    const readOnly = await createKey(client, { scopes: ["products:read"] });

    const list = await keyRequest(readOnly.token, "/api/admin/products");
    expect(list.status).toBe(200);

    const write = await keyRequest(readOnly.token, "/api/admin/products", {
      method: "POST",
      body: JSON.stringify({ name: "Blocked", price: "1.00", status: "draft" }),
    });
    expect(write.status).toBe(403);
    expect(((await write.json()) as { error: { code: string } }).error.code).toBe("insufficient_scope");

    const wrongResource = await keyRequest(readOnly.token, "/api/admin/orders");
    expect(wrongResource.status).toBe(403);

    // Session auth still requires the double-submit CSRF token.
    const noCsrf = await client.request("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No CSRF", price: "1.00", status: "draft" }),
    });
    expect(noCsrf.status).toBe(403);
    expect(((await noCsrf.json()) as { error: { code: string } }).error.code).toBe("csrf_failed");
  });

  it("blocks session-only operations for API keys", async () => {
    const client = createClient();
    await client.ensureSession();
    const created = await createKey(client, { scopes: ["*"] });

    for (const [path, init] of [
      ["/api/admin/api-keys", { method: "POST", body: JSON.stringify({ name: "Nested" }) }],
      ["/api/admin/settings/password", { method: "POST", body: JSON.stringify({ currentPassword: "x", newPassword: "y" }) }],
      ["/api/admin/plugins", { method: "GET" }],
      ["/api/admin/logout", { method: "POST", body: "{}" }],
    ] as const) {
      const response = await keyRequest(created.token, path, init);
      expect(response.status, path).toBe(403);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("session_required");
    }

    // A wildcard key can reach otherwise unwrapped admin endpoints.
    const settings = await keyRequest(created.token, "/api/admin/settings");
    expect(settings.status).toBe(200);

    // A business-scoped key cannot.
    const business = await createKey(client, { scopes: ["products:read"] });
    const blocked = await keyRequest(business.token, "/api/admin/settings");
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("insufficient_scope");
  });

  it("revokes keys and rejects invalid, expired, or revoked tokens", async () => {
    const client = createClient();
    await client.ensureSession();
    const created = await createKey(client);

    const self = await keyRequest(created.token, "/api/admin/api-keys/self", { method: "DELETE" });
    expect(self.status).toBe(200);

    const after = await keyRequest(created.token, "/api/admin/me");
    expect(after.status).toBe(401);
    expect(((await after.json()) as { error: { code: string } }).error.code).toBe("api_key_invalid");

    const invalid = await keyRequest("cck_00000000000000000000000000000000.invalid-secret-value", "/api/admin/me");
    expect(invalid.status).toBe(401);

    const expiring = await createKey(client);
    await testEnv.DB.prepare("UPDATE admin_api_keys SET expires_at = ? WHERE id = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), expiring.id)
      .run();
    const expired = await keyRequest(expiring.token, "/api/admin/me");
    expect(expired.status).toBe(401);

    const future = await client.json("/api/admin/api-keys", "POST", {
      name: "Expiring",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, client.csrfHeaders());
    expect(future.status).toBe(201);

    const revoked = await createKey(client);
    const revoke = await client.json(`/api/admin/api-keys/${revoked.id}`, "DELETE", {}, client.csrfHeaders());
    expect(revoke.status).toBe(200);
    expect((await keyRequest(revoked.token, "/api/admin/me")).status).toBe(401);
  });

  it("reports capabilities and revokes keys when the password changes", async () => {
    const client = createClient();
    await client.ensureSession();
    const created = await createKey(client);

    const capabilities = await keyRequest(created.token, "/api/admin/capabilities");
    expect(capabilities.status).toBe(200);
    const body = (await capabilities.json()) as {
      data: { version: string; authMethod: string; uploads: boolean; scopes: string[] };
    };
    expect(body.data.version).toBe("0.5.0");
    expect(body.data.authMethod).toBe("api_key");
    expect(body.data.uploads).toBe(false);
    expect(body.data.scopes.length).toBeGreaterThan(0);

    const changed = await client.json("/api/admin/settings/password", "POST", {
      currentPassword: TEST_OWNER.password,
      newPassword: "N3wPassword!2026",
    }, client.csrfHeaders());
    const changedText = await changed.text();
    expect(changed.status, changedText).toBe(200);

    const after = await keyRequest(created.token, "/api/admin/me");
    expect(after.status).toBe(401);

    // Restore the deterministic password so other tests in this worker can sign in.
    const restored = await client.json("/api/admin/login", "POST", {
      email: TEST_OWNER.email,
      password: "N3wPassword!2026",
    });
    expect(restored.status).toBe(200);
    const csrf = ((await restored.json()) as { csrfToken: string }).csrfToken;
    const restore = await client.json("/api/admin/settings/password", "POST", {
      currentPassword: "N3wPassword!2026",
      newPassword: TEST_OWNER.password,
    }, { "X-CSRF-Token": csrf });
    const restoreText = await restore.text();
    expect(restore.status, restoreText).toBe(200);
  });
});
