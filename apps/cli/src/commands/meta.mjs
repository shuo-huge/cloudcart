import { CliError, requireConfirmation, usageError } from "../errors.mjs";
import { queryPairs, readJsonInput } from "../io.mjs";
import { SCHEMAS } from "../schemas.mjs";

function unwrap(body) {
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function headerPairs(values) {
  const headers = {};
  for (const entry of values || []) {
    const index = String(entry).indexOf(":");
    if (index === -1) throw usageError(`Invalid --header "${entry}". Use "Key: value".`);
    const name = String(entry).slice(0, index).trim();
    if (/^authorization$/i.test(name)) throw usageError("Use --key for authentication; do not override Authorization.");
    headers[name] = String(entry).slice(index + 1).trim();
  }
  return headers;
}

export async function api(ctx) {
  const method = String(ctx.args[0] || "").toUpperCase();
  const path = ctx.args[1];
  if (!METHODS.has(method)) throw usageError("Usage: cloudcart api <GET|POST|PUT|PATCH|DELETE> /api/admin/...");
  if (!path || !path.startsWith("/api/admin/")) {
    throw usageError(`The api command only accepts /api/admin/ paths (got ${path ?? "(missing)"}).`);
  }
  if (method === "DELETE") requireConfirmation(ctx.flags, "Deleting through the api command");
  const body = ctx.flags.data !== undefined ? await readJsonInput(ctx.flags.data, "request JSON") : undefined;
  const client = ctx.requireClient();
  const result = await client.request(method, path, {
    body,
    query: queryPairs(ctx.flags.query),
    headers: headerPairs(ctx.flags.header),
    allowDryRun: method !== "GET",
  });
  if (!result.dryRun && ctx.flags.raw) return { data: result.text };
  return { data: result.dryRun ? result.data : unwrap(result.data) };
}

function scopesForCommand(command) {
  if (command.scopes) return command.scopes;
  if (["auth", "keys", "capabilities", "schema", "doctor", "version", "help"].includes(command.path.split(" ")[0])) {
    return [];
  }
  if (command.path === "api") return ["*"];
  const resource = command.path.startsWith("blog ")
    ? "pages"
    : command.path.startsWith("shipping ")
      ? "shipping"
      : command.path.startsWith("tax ")
        ? "tax"
        : command.path.split(" ")[0];
  return [`${resource}:${command.mutates ? "write" : "read"}`];
}

export async function capabilities(ctx) {
  const manifest = ctx.manifest.map((command) => ({
    path: command.path,
    summary: command.summary,
    usage: command.usage,
    scopes: scopesForCommand(command),
    mutates: Boolean(command.mutates),
    examples: command.examples || [],
  }));
  const data = { version: "0.5.0", commandCount: manifest.length, commands: manifest };
  if (ctx.flags.probe) {
    const client = ctx.requireClient();
    data.health = unwrap(await client.requestJson("GET", "/api/health", { anonymous: true }));
    data.me = unwrap(await client.requestJson("GET", "/api/admin/me"));
    data.store = unwrap(await client.requestJson("GET", "/api/admin/capabilities"));
    data.mediaStorage = unwrap(await client.requestJson("GET", "/api/admin/media/storage"));
  }
  return { data };
}

export async function schema(ctx) {
  const raw = ctx.args.join(" ") || undefined;
  const aliases = {
    product: "products",
    page: "pages",
    coupon: "coupons",
    taxRate: "tax",
    shippingZone: "shipping zones",
    shippingRate: "shipping rates",
  };
  const filter = raw ? String(raw).replace(/\./g, " ") : null;
  const group = raw && aliases[raw] ? aliases[raw] : filter;
  const commands = group
    ? ctx.manifest.filter((command) =>
      command.path === group ||
      command.path.startsWith(`${group} `) ||
      command.path.startsWith(`${group}.`))
    : ctx.manifest;
  if (raw && commands.length === 0 && !SCHEMAS[raw]) throw usageError(`Unknown command or schema: ${raw}`);
  return {
    data: {
      version: "0.5.0",
      commands: commands.map((command) => ({
        path: command.path,
        summary: command.summary,
        usage: command.usage,
        scopes: scopesForCommand(command),
        mutates: Boolean(command.mutates),
        examples: command.examples || [],
      })),
      schemas: raw && SCHEMAS[raw] ? { [raw]: SCHEMAS[raw] } : SCHEMAS,
    },
    message: `Schema for ${raw || "all commands"}. Use --json for the machine-readable version.`,
  };
}

export async function doctor(ctx) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  try {
    add("config", true, ctx.configPath);
    add("url", Boolean(ctx.url), ctx.url || "missing");
    add("api key", Boolean(ctx.apiKey), ctx.apiKey ? "configured" : "missing");
    const client = ctx.requireClient();
    const health = await client.requestJson("GET", "/api/health", { anonymous: true });
    add("health", health?.status === "ok", `${health?.status ?? "unknown"} / ${health?.version ?? "?"}`);
    const me = unwrap(await client.requestJson("GET", "/api/admin/me"));
    add("auth", Boolean(me?.admin), me?.admin?.email || "unknown");
    const capability = unwrap(await client.requestJson("GET", "/api/admin/capabilities"));
    add("capabilities", true, `uploads=${capability.uploads} email=${capability.email} currency=${capability.currency}`);
  } catch (error) {
    add("request", false, error.message);
  }
  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    throw new CliError(`Doctor found ${failed.length} problem(s).`, {
      code: "doctor_failed",
      exitCode: 1,
      details: { checks },
    });
  }
  return { data: { checks, ok: true }, message: checks.map((check) => `✓ ${check.name}: ${check.detail}`).join("\n") };
}

export async function version() {
  return { data: { version: "0.5.0" }, message: "CloudCart CLI 0.5.0" };
}

export async function help(ctx) {
  const lines = [
    "CloudCart CLI",
    "",
    "Usage: cloudcart <resource> <action> [options]",
    "",
    ...ctx.manifest.map((command) => `  ${command.path.padEnd(28)} ${command.summary}`),
    "",
    "Global options: --url --key --profile --json --yes --dry-run --help --version",
    "Run `cloudcart schema <command>` for payloads and `cloudcart capabilities --json` for the full manifest.",
  ];
  return { data: { commands: ctx.manifest.map((command) => command.path) }, message: lines.join("\n") };
}
