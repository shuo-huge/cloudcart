import { describe, expect, it } from "vitest";
import { ApiClient } from "../src/client.mjs";
import { CliError } from "../src/errors.mjs";

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("CLI HTTP client", () => {
  it("adds bearer auth, JSON content type and parses the envelope", async () => {
    const calls = [];
    const client = new ApiClient({
      baseUrl: "https://example.com",
      apiKey: "cck_test",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ ok: true, data: { id: "prd_1" } });
      },
    });
    const data = await client.requestJson("POST", "/api/admin/products", { body: { name: "X" } });
    expect(data).toEqual({ ok: true, data: { id: "prd_1" } });
    expect(calls[0].url).toBe("https://example.com/api/admin/products");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.get("Authorization")).toBe("Bearer cck_test");
    expect(calls[0].init.headers.get("Content-Type")).toBe("application/json");
  });

  it("maps API errors to CliError exit codes", async () => {
    const client = new ApiClient({
      baseUrl: "https://example.com",
      apiKey: "cck_test",
      fetchImpl: async () => jsonResponse({
        ok: false,
        error: { code: "insufficient_scope", message: "No write scope." },
      }, 403),
    });
    await expect(client.request("POST", "/api/admin/products", { body: {} })).rejects.toMatchObject({
      code: "insufficient_scope",
      exitCode: 3,
      status: 403,
    });
  });

  it("does not send writes during dry-run", async () => {
    let called = false;
    const client = new ApiClient({
      baseUrl: "https://example.com",
      apiKey: "cck_test",
      dryRun: true,
      fetchImpl: async () => {
        called = true;
        return jsonResponse({ ok: true });
      },
    });
    const result = await client.request("POST", "/api/admin/products", { body: { name: "X" } });
    expect(called).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result.data).toMatchObject({ method: "POST", path: "/api/admin/products" });
  });

  it("keeps cookies from a login response", async () => {
    const client = new ApiClient({
      baseUrl: "https://example.com",
      fetchImpl: async () => jsonResponse(
        { ok: true, csrfToken: "csrf" },
        200,
        { "set-cookie": "cc_session=abc; Path=/; HttpOnly" },
      ),
    });
    await client.login("owner@example.com", "password");
    expect(client.cookies.get("cc_session")).toBe("abc");
  });

  it("rejects non-admin URLs in the generic api command", async () => {
    const { api } = await import("../src/commands/meta.mjs");
    await expect(api({
      args: ["GET", "/api/public"],
      flags: {},
      requireClient: () => { throw new Error("should not be called"); },
    })).rejects.toBeInstanceOf(CliError);
  });
});
