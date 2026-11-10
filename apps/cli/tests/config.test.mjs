import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  configPath,
  emptyConfig,
  maskKey,
  normalizeUrl,
  readConfig,
  resolveProfile,
  saveProfile,
} from "../src/config.mjs";

function tempEnv() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cloudcart-cli-"));
  return {
    directory,
    env: {
      APPDATA: directory,
      XDG_CONFIG_HOME: directory,
      CLOUDCART_CONFIG: path.join(directory, "config.json"),
    },
  };
}

describe("CLI config", () => {
  it("writes and reads profiles atomically", () => {
    const { env } = tempEnv();
    const file = configPath(env);
    expect(readConfig(file)).toEqual(emptyConfig());
    saveProfile("default", { url: "https://example.com", apiKey: "cck_x" }, env);
    const config = readConfig(file);
    expect(config.defaultProfile).toBe("default");
    expect(config.profiles.default.url).toBe("https://example.com");
  });

  it("uses flags over environment over profile", () => {
    const { env } = tempEnv();
    saveProfile("default", { url: "https://profile.example", apiKey: "cck_profile" }, env);
    const config = readConfig(env.CLOUDCART_CONFIG);
    expect(resolveProfile({}, {}, config).url).toBe("https://profile.example");
    expect(resolveProfile({}, { CLOUDCART_URL: "https://env.example" }, config).url).toBe("https://env.example");
    expect(resolveProfile({ url: "https://flag.example" }, { CLOUDCART_URL: "https://env.example" }, config).url).toBe("https://flag.example");
  });

  it("masks keys and normalizes URLs safely", () => {
    expect(maskKey("cck_1234567890abcdef")).not.toContain("abcdef");
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(() => normalizeUrl("http://example.com")).toThrow(/HTTPS/);
  });
});
