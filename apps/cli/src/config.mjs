import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliError, usageError } from "./errors.mjs";

export const CONFIG_VERSION = 1;

export function configPath(env = process.env) {
  if (env.CLOUDCART_CONFIG) return path.resolve(env.CLOUDCART_CONFIG);
  if (process.platform === "win32") {
    return path.join(env.APPDATA || os.homedir(), "cloudcart", "config.json");
  }
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "cloudcart", "config.json");
}

export function emptyConfig() {
  return { version: CONFIG_VERSION, defaultProfile: "default", profiles: {} };
}

export function readConfig(file = configPath()) {
  if (!fs.existsSync(file)) return emptyConfig();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new CliError(`The config file is not valid JSON: ${file}`, {
      code: "invalid_config",
      exitCode: 2,
    });
  }
  if (!parsed || typeof parsed !== "object" || !parsed.profiles || typeof parsed.profiles !== "object") {
    throw new CliError(`The config file has an unsupported shape: ${file}`, {
      code: "invalid_config",
      exitCode: 2,
    });
  }
  return {
    version: CONFIG_VERSION,
    defaultProfile: typeof parsed.defaultProfile === "string" ? parsed.defaultProfile : "default",
    profiles: parsed.profiles,
  };
}

export function writeConfig(config, file = configPath()) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(temporary, 0o600);
  } catch {
    // Windows may not support POSIX modes; the file still lives in the user profile.
  }
  fs.renameSync(temporary, file);
  return file;
}

export function resolveProfile(flags = {}, env = process.env, config = readConfig(env.CLOUDCART_CONFIG)) {
  if (flags.url === true) throw usageError("--url needs a store URL.");
  if (flags.key === true || flags.token === true) throw usageError("--key needs an API key value.");
  if (flags.profile === true) throw usageError("--profile needs a profile name.");
  const name = String(flags.profile || env.CLOUDCART_PROFILE || config.defaultProfile || "default");
  const profile = config.profiles[name] && typeof config.profiles[name] === "object"
    ? config.profiles[name]
    : {};
  return {
    name,
    profile,
    url: flags.url || env.CLOUDCART_URL || profile.url || null,
    apiKey: flags.key || flags.token || env.CLOUDCART_API_KEY || env.CLOUDCART_TOKEN || profile.apiKey || null,
    keyId: profile.keyId || null,
  };
}

export function saveProfile(name, profile, env = process.env) {
  const file = configPath(env);
  const config = readConfig(file);
  config.profiles[name] = profile;
  config.defaultProfile = name;
  writeConfig(config, file);
  return file;
}

export function removeProfile(name, env = process.env) {
  const file = configPath(env);
  const config = readConfig(file);
  delete config.profiles[name];
  if (config.defaultProfile === name) {
    const remaining = Object.keys(config.profiles);
    config.defaultProfile = remaining[0] || "default";
  }
  writeConfig(config, file);
  return file;
}

export function maskKey(key) {
  if (!key) return "(none)";
  if (key.length <= 14) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

export function normalizeUrl(input, { allowInsecure = false } = {}) {
  if (!input) throw usageError("A store URL is required. Use --url or CLOUDCART_URL.");
  let raw = String(input).trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw usageError(`Invalid store URL: ${input}`);
  }
  if (url.username || url.password) throw usageError("Store URLs must not contain credentials.");
  if (url.protocol === "http:") {
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
    if (!local && !allowInsecure) {
      throw usageError("Use HTTPS for a public store. Pass --insecure only for deliberate local testing.");
    }
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
