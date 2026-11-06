#!/usr/bin/env node
/**
 * CloudCart deployment CLI.
 *
 * Idempotent: re-running reuses the Worker, D1 database and
 * existing secrets instead of creating new resources or overwriting data.
 *
 * Usage:
 *   node scripts/deploy.mjs
 *   node scripts/deploy.mjs --name cloudcart-fashion
 *   node scripts/deploy.mjs --check          # non-mutating environment check
 *   node scripts/deploy.mjs --skip-build
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONFIG_PATH = path.join(ROOT, "wrangler.jsonc");
const STATE_DIR = path.join(ROOT, ".cloudcart");
const STATE_PATH = path.join(STATE_DIR, "deploy.json");
const args = process.argv.slice(2);

const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const nameArgIndex = args.indexOf("--name");
const nameArg = nameArgIndex !== -1 ? args[nameArgIndex + 1] : null;

function log(message) {
  process.stdout.write(`\n${message}\n`);
}

function step(message) {
  process.stdout.write(`\n▸ ${message}\n`);
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    input: options.input,
    stdio: options.capture ? ["pipe", "pipe", "pipe"] : options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (options.capture) {
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    if (options.allowFailure) return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
    fail(options.errorMessage ?? `Command failed: ${command} ${commandArgs.join(" ")}`);
  }
  return { status: 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function wrangler(wranglerArgs, options = {}) {
  return run("npx", ["wrangler", ...wranglerArgs], options);
}

function stripJsonComments(source) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    output += char;
  }
  return output;
}

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return JSON.parse(stripJsonComments(raw));
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function sanitizeName(value) {
  const cleaned = String(value || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52);
  return cleaned || "cloudcart";
}

function randomSecret(bytes) {
  return crypto.randomBytes(bytes).toString("base64url");
}

async function askStoreName(defaultName) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return defaultName;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Store / Worker name [${defaultName}]: `);
    return answer.trim() || defaultName;
  } finally {
    rl.close();
  }
}

async function main() {
  log("CloudCart → Cloudflare Workers deployment");

  step("Checking Node.js");
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < 20) fail("Node.js 20 or newer is required.");
  console.log(`  Node ${process.versions.node}`);

  step("Checking Wrangler");
  const version = run("npx", ["wrangler", "--version"], { capture: true });
  if (version.status !== 0) fail("Wrangler is not available. Run `pnpm install` first.");
  console.log(`  ${version.stdout.trim().split("\n")[0]}`);

  step("Checking Cloudflare authentication");
  const whoami = wrangler(["whoami"], { capture: true });
  if (whoami.status !== 0 || /not authenticated|not logged in/i.test(whoami.stdout + whoami.stderr)) {
    fail("You are not signed in to Cloudflare. Run `npx wrangler login`, then re-run this script.");
  }
  console.log(whoami.stdout.trim().split("\n").map((line) => `  ${line}`).join("\n"));

  const state = loadState();
  const config = readConfig();
  const defaultName = state.workerName || config.name || "cloudcart";
  const requested = nameArg || process.env.CLOUDCART_NAME || state.workerName;
  const workerName = sanitizeName(requested || (flags.has("--check") ? defaultName : await askStoreName(defaultName)));
  if (workerName !== (config.name || "")) {
    log(`  Worker name: ${config.name} → ${workerName}`);
  } else {
    log(`  Worker name: ${workerName}`);
  }
  const dbName = state.d1Name || workerName;

  if (flags.has("--check")) {
    log("Environment check passed. No resources were changed.");
    return;
  }

  step("Finding or creating the D1 database");
  let dbId = null;
  const d1List = wrangler(["d1", "list", "--json"], { capture: true, allowFailure: true });
  if (d1List.status === 0) {
    try {
      const databases = JSON.parse(d1List.stdout);
      const found = databases.find((database) => database.name === dbName);
      if (found) dbId = found.uuid || found.id || null;
    } catch {
      // fall through to text parsing
    }
  }
  if (!dbId) {
    const text = wrangler(["d1", "list"], { capture: true, allowFailure: true }).stdout;
    const match = text.split("\n").find((line) => line.includes(dbName));
    if (match) {
      const idMatch = match.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (idMatch) dbId = idMatch[0];
    }
  }
  if (dbId) {
    console.log(`  Using existing database ${dbName} (${dbId})`);
  } else {
    console.log(`  Creating database ${dbName}…`);
    wrangler(["d1", "create", dbName]);
    const refreshed = wrangler(["d1", "list", "--json"], { capture: true });
    const databases = JSON.parse(refreshed.stdout);
    const found = databases.find((database) => database.name === dbName);
    dbId = found?.uuid || found?.id;
    if (!dbId) fail("The database was created but its id could not be read. Check `npx wrangler d1 list`.");
    console.log(`  Created ${dbName} (${dbId})`);
  }

  step("Updating wrangler.jsonc");
  config.name = workerName;
  config.d1_databases = [{
    binding: "DB",
    database_name: dbName,
    database_id: dbId,
    migrations_dir: "migrations",
  }];
  delete config.r2_buckets;
  writeConfig(config);
  console.log("  Worker and D1 bindings updated. R2 is optional and was not provisioned.");

  step("Building the storefront and admin UI");
  if (flags.has("--skip-build")) {
    console.log("  Skipped (--skip-build).");
  } else {
    run("pnpm", ["run", "build"]);
  }

  step("Applying database migrations (remote)");
  const migration = wrangler(["d1", "migrations", "apply", dbName, "--remote"], { capture: true, input: "y\n" });
  if (migration.status !== 0) {
    process.stderr.write(migration.stdout);
    process.stderr.write(migration.stderr);
    fail("Database migrations failed. No Worker was deployed.");
  }
  console.log(migration.stdout.trim().split("\n").map((line) => `  ${line}`).join("\n"));

  step("Deploying the Worker");
  const deploy = wrangler(["deploy"], { capture: true });
  if (deploy.status !== 0) {
    process.stderr.write(deploy.stdout);
    process.stderr.write(deploy.stderr);
    fail("Worker deployment failed.");
  }
  console.log(deploy.stdout.trim().split("\n").map((line) => `  ${line}`).join("\n"));
  const urlMatch = deploy.stdout.match(/https:\/\/[^\s"'<>]+\.workers\.dev/);
  const workerUrl = urlMatch ? urlMatch[0] : `https://${workerName}.workers.dev`;

  let installed = false;
  try {
    const statusResponse = await fetch(`${workerUrl}/api/setup/status`, { redirect: "error" });
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      installed = status.installed === true;
    }
  } catch {
    // If the status endpoint is temporarily unavailable, preserve the safe
    // first-install path and print a fresh one-time link.
  }

  step("Configuring Worker secrets");
  const secretList = wrangler(["secret", "list", "--name", workerName], { capture: true, allowFailure: true });
  const existingSecrets = new Set(
    (secretList.stdout.match(/[A-Z][A-Z0-9_]+/g) ?? []),
  );
  let masterKey = state.appMasterKey || null;
  if (existingSecrets.has("APP_MASTER_KEY")) {
    console.log("  APP_MASTER_KEY already exists — keeping it (rotating would invalidate sessions and encrypted payment keys).");
  } else {
    masterKey = masterKey || randomSecret(32);
    wrangler(["secret", "put", "APP_MASTER_KEY", "--name", workerName], { input: `${masterKey}\n` });
    console.log("  APP_MASTER_KEY generated and configured automatically.");
  }

  let setupToken = state.setupToken || null;
  if (installed) {
    setupToken = null;
    console.log("  Store is already installed — no setup token is needed.");
  } else if (setupToken && existingSecrets.has("SETUP_TOKEN")) {
    console.log("  Reusing the existing one-time setup token.");
  } else {
    // Workers Builds uses a fresh checkout for each build, so its local state
    // file is not persistent. Before first installation, refresh the token and
    // print the new private setup link in the build log.
    setupToken = randomSecret(32);
    wrangler(["secret", "put", "SETUP_TOKEN", "--name", workerName], { input: `${setupToken}\n` });
    console.log("  One-time setup token generated and configured automatically.");
  }

  saveState({
    workerName,
    d1Name: dbName,
    d1Id: dbId,
    workerUrl,
    appMasterKey: masterKey,
    setupToken,
    deployedAt: new Date().toISOString(),
  });

  log("─────────────────────────────────────────────");
  console.log(`Store:        ${workerUrl}`);
  console.log(`Admin:        ${workerUrl}/admin`);
  if (setupToken) {
    console.log(`Setup link:   ${workerUrl}/setup?token=${encodeURIComponent(setupToken)}`);
    console.log("Open this private one-time link to create the store owner. No technical secrets need to be entered.");
  } else {
    console.log(`Setup:        already complete — ${workerUrl}/admin`);
  }
  console.log("");
  console.log("The one-time setup link stops working permanently after the first administrator is created.");
  console.log(`Deployment state (including generated secrets) was saved to ${path.relative(ROOT, STATE_PATH)} — keep it private.`);
  log("Done.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
