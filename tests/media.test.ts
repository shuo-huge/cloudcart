import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import { prepareImageUpload, storeR2Media } from "@cloudcart/core";
import { createClient } from "./support";

const testEnv = env as unknown as { DB: D1Database; APP_MASTER_KEY: string };
const PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7xkAAAAASUVORK5CYII=",
  "base64",
));

function imageFile(name = "tiny.png"): File {
  return new File([PNG], name, { type: "image/png" });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function upload(
  client: ReturnType<typeof createClient>,
  storage?: string,
  alt = "Tiny image",
): Promise<Response> {
  const form = new FormData();
  form.append("file", imageFile());
  form.append("alt", alt);
  if (storage) form.append("storage", storage);
  return client.request("/api/admin/media", {
    method: "POST",
    headers: { "X-CSRF-Token": client.csrfHeaders()["X-CSRF-Token"] ?? "" },
    body: form,
  });
}

async function createKey(
  client: ReturnType<typeof createClient>,
  scopes: string[],
): Promise<string> {
  const response = await client.json("/api/admin/api-keys", "POST", { name: "Media test", scopes }, client.csrfHeaders());
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { token: string } }).data.token;
}

function keyRequest(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return SELF.fetch(`https://example.com${path}`, { ...init, headers });
}

describe("media storage providers", () => {
  it("requires a configured provider before accepting uploads", async () => {
    const client = createClient();
    await client.ensureSession();
    const response = await upload(client, "r2");
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("storage_unavailable");
  });

  it("uploads to jsDelivr through GitHub and hides the token", async () => {
    const client = createClient();
    await client.ensureSession();
    const saved = await client.json("/api/admin/media/storage", "PUT", {
      defaultProvider: "jsdelivr",
      jsdelivr: {
        owner: "acme",
        repo: "media",
        branch: "main",
        path: "products",
        token: "github_pat_test_value",
      },
    }, client.csrfHeaders());
    const savedText = await saved.text();
    expect(saved.status, savedText).toBe(200);
    const savedBody = JSON.parse(savedText) as {
      data: { providers: { jsdelivr: { configured: boolean; tokenConfigured: boolean } } };
    };
    expect(savedBody.data.providers.jsdelivr.configured).toBe(true);
    expect(JSON.stringify(savedBody)).not.toContain("github_pat_test_value");

    const encrypted = await testEnv.DB.prepare(
      "SELECT jsdelivr_token_encrypted FROM media_storage_config WHERE id = 1",
    ).first<{ jsdelivr_token_encrypted: string }>();
    expect(encrypted?.jsdelivr_token_encrypted?.startsWith("v1.")).toBe(true);

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        content: { path: "products/tiny-abc123.png" },
        commit: { sha: "abc123" },
      }, 201);
    }) as typeof fetch;
    try {
      const response = await upload(client, "jsdelivr");
      const text = await response.text();
      expect(response.status, text).toBe(201);
      const body = JSON.parse(text) as {
        data: { r2_key: string; storage: string; content_type: string };
      };
      expect(body.data.storage).toBe("jsdelivr");
      expect(body.data.content_type).toBe("image/png");
      expect(body.data.r2_key).toBe(
        "https://cdn.jsdelivr.net/gh/acme/media@abc123/products/tiny-abc123.png",
      );
      const githubCall = calls.find((call) => call.url.includes("/contents/"));
      expect(githubCall?.url).toContain("https://api.github.com/repos/acme/media/contents/products/");
      expect(new Headers(githubCall?.init?.headers).get("Authorization")).toBe("Bearer github_pat_test_value");
    } finally {
      globalThis.fetch = original;
    }

    const status = await client.request("/api/admin/media/storage");
    expect(status.status).toBe(200);
    const statusText = await status.text();
    expect(statusText).not.toContain("github_pat_test_value");
    expect(statusText).toContain('"tokenConfigured":true');
  });

  it("stores external URLs as external and supports a fake R2 bucket", async () => {
    const client = createClient();
    await client.ensureSession();
    const external = await client.json("/api/admin/media/external", "POST", {
      url: "https://example.com/remote.jpg",
      alt: "remote",
    }, client.csrfHeaders());
    expect(external.status).toBe(201);
    const media = (await external.json()) as { data: { storage: string } };
    expect(media.data.storage).toBe("external");

    const db = new Database(testEnv.DB);
    const image = await prepareImageUpload(imageFile());
    const puts: Array<{ key: string; bytes: Uint8Array; options: unknown }> = [];
    const bucket = {
      put: async (key: string, bytes: Uint8Array, options: unknown) => {
        puts.push({ key, bytes, options });
        return {};
      },
    } as unknown as R2Bucket;
    const row = await storeR2Media(db, bucket, image, null, "cover");
    expect(row.storage).toBe("r2");
    expect(row.alt).toBe("cover");
    expect(row.r2_key).toMatch(/^media\/\d{4}\/\d{2}\/med_[a-f0-9]+\.png$/);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toBe(row.r2_key);
    expect(puts[0]!.bytes.length).toBe(PNG.length);
  });

  it("requires wildcard scope to change storage settings", async () => {
    const client = createClient();
    await client.ensureSession();
    const businessKey = await createKey(client, ["media:read", "media:write"]);
    const denied = await keyRequest(businessKey, "/api/admin/media/storage", {
      method: "PUT",
      body: JSON.stringify({ defaultProvider: "jsdelivr" }),
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { error: { code: string } }).error.code).toBe("insufficient_scope");

    const adminKey = await createKey(client, ["*"]);
    const allowed = await keyRequest(adminKey, "/api/admin/media/storage", {
      method: "PUT",
      body: JSON.stringify({
        defaultProvider: "jsdelivr",
        jsdelivr: { owner: "acme", repo: "media", branch: "main", path: "products" },
      }),
    });
    expect(allowed.status, await allowed.text()).toBe(200);
  });
});
