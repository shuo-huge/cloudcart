import { describe, expect, it } from "vitest";
import { createPluginJwt, verifyPluginJwt } from "@cloudcart/security";

const MASTER = "test-master-key-0123456789abcdef";
const INPUT = {
  pluginId: "example-analytics",
  storeId: "store_0123456789abcdef0123456789abcdef",
  adminId: "adm_test",
  permissions: ["orders:read", "products:read", "orders:read"],
};

describe("plugin JWTs", () => {
  it("signs and verifies a short-lived plugin token", async () => {
    const { token, claims } = await createPluginJwt(MASTER, INPUT);
    expect(claims.permissions).toEqual(["orders:read", "products:read"]);
    expect(claims.exp - claims.iat).toBe(300);
    const result = await verifyPluginJwt(MASTER, token, { pluginId: "example-analytics" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.claims.plugin_id).toBe("example-analytics");
      expect(result.claims.store_id).toBe(INPUT.storeId);
      expect(result.claims.admin_id).toBe("adm_test");
    }
  });

  it("rejects a token signed with a different key", async () => {
    const { token } = await createPluginJwt(MASTER, INPUT);
    const result = await verifyPluginJwt("another-master-key-0123456789", token);
    expect(result).toEqual({ valid: false, reason: "signature" });
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token } = await createPluginJwt(MASTER, { ...INPUT, now, ttlSeconds: 30 });
    const result = await verifyPluginJwt(MASTER, token, { now: now + 31 });
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("rejects the wrong audience", async () => {
    const { token } = await createPluginJwt(MASTER, INPUT);
    const result = await verifyPluginJwt(MASTER, token, { pluginId: "other-plugin" });
    expect(result).toEqual({ valid: false, reason: "audience" });
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyPluginJwt(MASTER, "not-a-jwt")).toEqual({ valid: false, reason: "malformed" });
    const { token } = await createPluginJwt(MASTER, INPUT);
    const parts = token.split(".");
    expect(await verifyPluginJwt(MASTER, `${parts[0]}.${parts[1]}.bad`)).toEqual({ valid: false, reason: "signature" });
  });

  it("rejects tokens issued too far in the future", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token } = await createPluginJwt(MASTER, { ...INPUT, now: now + 120 });
    const result = await verifyPluginJwt(MASTER, token, { now });
    expect(result).toEqual({ valid: false, reason: "not_yet_valid" });
  });
});
