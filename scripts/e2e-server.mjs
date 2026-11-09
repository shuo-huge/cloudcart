#!/usr/bin/env node
/**
 * Boots an isolated local store for Playwright:
 * - reuses APP_MASTER_KEY / SETUP_TOKEN from .dev.vars when present,
 * - creates missing secrets without disturbing existing values,
 * - resets a dedicated D1 persistence directory,
 * - applies migrations and serves Wrangler on a fixed port.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.E2E_PORT || 8787);
const host = "127.0.0.1";
const persistTo = path.join(root, ".wrangler", "e2e");
const authDir = path.join(root, "e2e", ".auth");
const devVarsPath = path.join(root, ".dev.vars");
const portMarker = path.join(authDir, "setup-token.txt");

function fail(message) {
  console.error(`[e2e] ${message}`);
  process.exit(1);
}

function parseEnvFile(file) {
  const values = new Map();
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values.set(match[1], match[2].replace(/^["']|["']$/g, ""));
  }
  return values;
}

function ensureSecrets() {
  const values = parseEnvFile(devVarsPath);
  let changed = !fs.existsSync(devVarsPath);
  if (!values.get("APP_MASTER_KEY")) {
    values.set("APP_MASTER_KEY", crypto.randomBytes(48).toString("base64url"));
    changed = true;
  }
  if (!values.get("SETUP_TOKEN")) {
    values.set("SETUP_TOKEN", "e2e-setup-token-123456");
    changed = true;
  }
  if (changed) {
    const output = [
      "# Generated automatically for the CloudCart E2E server.",
      ...[...values.entries()].map(([key, value]) => `${key}=${value}`),
      "",
    ].join("\n");
    fs.writeFileSync(devVarsPath, output, { encoding: "utf8", mode: 0o600 });
  }
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(portMarker, values.get("SETUP_TOKEN"), "utf8");
}

function assertBuilt() {
  for (const required of ["dist/admin/index.html", "dist/static/admin-ui", "dist/static/assets"]) {
    if (!fs.existsSync(path.join(root, required))) {
      fail(`Missing ${required}. Run "pnpm build" before the E2E server.`);
    }
  }
}

function assertPortFree() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      reject(new Error(`Port ${port} is already in use. Stop the other process or set E2E_PORT.`));
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(true);
    });
  });
}

function wrangler(args) {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

async function main() {
  assertBuilt();
  await assertPortFree();
  ensureSecrets();

  fs.rmSync(persistTo, { recursive: true, force: true });

  const migration = spawnSync(
    wrangler(),
    ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", persistTo],
    { cwd: root, stdio: "inherit", env: { ...process.env, CI: "1" }, shell: process.platform === "win32" },
  );
  if (migration.status !== 0) fail("Local D1 migrations failed.");

  const child = spawn(
    wrangler(),
    [
      "exec", "wrangler", "dev",
      "--port", String(port),
      "--ip", host,
      "--inspector-port", String(port + 346),
      "--persist-to", persistTo,
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, CI: "1" }, shell: process.platform === "win32" },
  );

  const stop = () => {
    if (!child.killed) child.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
