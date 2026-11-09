import { describe, expect, it } from "vitest";
import {
  RemoteManifestValidationError,
  parseRemotePluginManifest,
  remoteAdminOrigin,
  validateRemoteUrl,
} from "@cloudcart/plugin-sdk";

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  };
}

describe("remote plugin manifest", () => {
  it("parses a valid manifest and normalizes URLs", () => {
    const parsed = parseRemotePluginManifest(manifest());
    expect(parsed.runtime).toBe("remote");
    expect(parsed.service.baseUrl).toBe("https://plugin.example.com/api/cloudcart/v1");
    expect(remoteAdminOrigin(parsed)).toBe("https://plugin.example.com");
    expect(parsed.permissions).toEqual(["orders:read", "products:read"]);
  });

  it("deduplicates permissions", () => {
    const parsed = parseRemotePluginManifest(manifest({ permissions: ["orders:read", "orders:read"] }));
    expect(parsed.permissions).toEqual(["orders:read"]);
  });

  it("requires runtime, service, and admin for remote plugins", () => {
    expect(() => parseRemotePluginManifest(manifest({ runtime: undefined }))).toThrow(RemoteManifestValidationError);
    expect(() => parseRemotePluginManifest(manifest({ service: undefined }))).toThrow(RemoteManifestValidationError);
    expect(() => parseRemotePluginManifest(manifest({ admin: undefined }))).toThrow(RemoteManifestValidationError);
  });

  it("rejects non-HTTPS, private, credentialed, and unusual-port URLs", () => {
    for (const url of [
      "http://plugin.example.com/manifest",
      "https://localhost/manifest",
      "https://127.0.0.1/manifest",
      "https://10.0.0.1/manifest",
      "https://192.168.1.1/manifest",
      "https://169.254.169.254/manifest",
      "https://172.16.0.1/manifest",
      "https://100.64.0.1/manifest",
      "https://[::1]/manifest",
      "https://user:pass@plugin.example.com/manifest",
      "https://plugin.example.com:8443/manifest",
      "https://internal/manifest",
      "ftp://plugin.example.com/manifest",
    ]) {
      expect(() => validateRemoteUrl(url), url).toThrow(RemoteManifestValidationError);
    }
  });

  it("allows localhost only with the explicit test flag", () => {
    expect(validateRemoteUrl("http://127.0.0.1:8788/admin", { allowInsecure: true })).toBe("http://127.0.0.1:8788/admin");
    expect(() => validateRemoteUrl("http://127.0.0.1:8788/admin")).toThrow(RemoteManifestValidationError);
  });

  it("rejects unknown or wildcard permissions", () => {
    expect(() => parseRemotePluginManifest(manifest({ permissions: ["orders:write"] }))).toThrow(RemoteManifestValidationError);
    expect(() => parseRemotePluginManifest(manifest({ permissions: ["*"] }))).toThrow(RemoteManifestValidationError);
  });

  it("rejects incompatible API versions", () => {
    expect(() => parseRemotePluginManifest(manifest({ apiVersion: "2" }))).toThrow(RemoteManifestValidationError);
  });

  it("validates admin pages", () => {
    expect(() => parseRemotePluginManifest(manifest({
      admin: { entryUrl: "https://plugin.example.com/admin", pages: [{ id: "Bad ID", label: "Bad" }] },
    }))).toThrow(RemoteManifestValidationError);
    expect(() => parseRemotePluginManifest(manifest({
      admin: {
        entryUrl: "https://plugin.example.com/admin",
        pages: Array.from({ length: 11 }, (_, index) => ({ id: `page-${index}`, label: "Page" })),
      },
    }))).toThrow(RemoteManifestValidationError);
  });

  it("rejects unknown manifest fields", () => {
    expect(() => parseRemotePluginManifest(manifest({ runtimeCode: "alert(1)" }))).toThrow(RemoteManifestValidationError);
  });
});
