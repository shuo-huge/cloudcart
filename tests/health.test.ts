import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("health endpoints", () => {
  it("reports a healthy Worker and D1 binding", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = (await res.json()) as { status: string; database: string; version: string };
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    expect(body.version).toBe("0.2.0");
  });

  it("reports setup as required on a fresh database", async () => {
    const res = await SELF.fetch("https://example.com/api/setup/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { installed: boolean; setupRequired: boolean };
    expect(body.installed).toBe(false);
    expect(body.setupRequired).toBe(true);
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const res = await SELF.fetch("https://example.com/api/does-not-exist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});
