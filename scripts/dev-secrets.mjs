#!/usr/bin/env node
/**
 * Create local-only Worker secrets for Wrangler development.
 * Existing values are preserved so local sessions and encrypted plugin settings
 * remain readable across restarts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const file = path.resolve(import.meta.dirname, "..", ".dev.vars");
const values = new Map();

if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values.set(match[1], match[2].replace(/^["']|["']$/g, ""));
  }
}

const randomSecret = (bytes) => crypto.randomBytes(bytes).toString("base64url");
if (!values.get("APP_MASTER_KEY")) values.set("APP_MASTER_KEY", randomSecret(48));
if (!values.get("SETUP_TOKEN")) values.set("SETUP_TOKEN", randomSecret(32));

const output = [
  "# Generated automatically by pnpm run dev:setup. Do not commit this file.",
  ...[...values.entries()].map(([key, value]) => `${key}=${value}`),
  "",
].join("\n");

fs.writeFileSync(file, output, { encoding: "utf8", mode: 0o600 });
console.log("Local Worker secrets are ready in .dev.vars (existing values were preserved).");
console.log(`One-time local setup link: http://localhost:8787/setup?token=${encodeURIComponent(values.get("SETUP_TOKEN"))}`);
