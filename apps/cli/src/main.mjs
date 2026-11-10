import { parseArgs } from "./args.mjs";
import { ApiClient } from "./client.mjs";
import {
  configPath,
  normalizeUrl,
  readConfig,
  resolveProfile,
} from "./config.mjs";
import { authError, CliError, usageError } from "./errors.mjs";
import { COMMANDS, resolveCommand } from "./manifest.mjs";
import { emitError, emitSuccess } from "./output.mjs";

const AUTH_COMMANDS = new Set(["auth login", "auth setup", "auth logout", "keys create", "keys revoke"]);

function buildContext({ flags, args, env, definition }) {
  const file = configPath(env);
  const config = readConfig(file);
  const resolved = resolveProfile(flags, env, config);
  const timeout = flags.timeout === undefined ? 30_000 : Number(flags.timeout);
  if (!Number.isFinite(timeout) || timeout <= 0) throw usageError("--timeout must be a positive number of milliseconds.");

  let client = null;
  let currency = null;
  const context = {
    flags,
    args,
    env,
    config,
    configPath: file,
    profileName: resolved.name,
    profile: resolved.profile,
    url: resolved.url,
    apiKey: resolved.apiKey,
    manifest: COMMANDS,
    requireClient() {
      if (client) return client;
      if (!resolved.url) throw usageError("A store URL is required. Use --url or CLOUDCART_URL.");
      if (!resolved.apiKey) throw authError();
      client = new ApiClient({
        baseUrl: normalizeUrl(resolved.url, { allowInsecure: Boolean(flags.insecure) }),
        apiKey: resolved.apiKey,
        userAgent: flags["user-agent"] || env.CLOUDCART_USER_AGENT,
        timeout,
        dryRun: Boolean(flags["dry-run"]),
        verbose: Boolean(flags.verbose),
      });
      return client;
    },
    async getCurrency() {
      if (currency) return currency;
      const current = context.requireClient();
      const data = await current.requestJson("GET", "/api/admin/capabilities");
      currency = data?.data?.currency || "USD";
      return currency;
    },
  };
  if (!definition) throw usageError("No command selected.");
  return context;
}

export async function main(argv, env = process.env) {
  const started = Date.now();
  let flags;
  let positionals;
  try {
    ({ flags, positionals } = parseArgs(argv));
  } catch (error) {
    const failure = error instanceof CliError ? error : new CliError(String(error));
    emitError("(parse)", failure, { json: false });
    process.exitCode = failure.exitCode;
    return;
  }
  if (flags.output === "json") flags.json = true;
  if (flags.output && flags.output !== "json" && flags.output !== "text") {
    const failure = usageError("--output must be json or text.");
    emitError("(parse)", failure, flags);
    process.exitCode = failure.exitCode;
    return;
  }

  if (flags.version && positionals.length === 0) {
    emitSuccess("version", { data: { version: "0.5.0" }, message: "CloudCart CLI 0.5.0" }, flags, {});
    return;
  }
  if (positionals.length === 0) {
    positionals = ["help"];
  }

  let definition;
  let args;
  try {
    ({ definition, args } = resolveCommand(positionals));
  } catch (error) {
    const failure = error instanceof CliError ? error : new CliError(String(error));
    emitError("(resolve)", failure, flags);
    process.exitCode = failure.exitCode;
    return;
  }

  if (flags.help && definition.path !== "help") {
    const message = [
      `Usage: ${definition.usage}`,
      "",
      definition.summary,
      "",
      "Global options: --url --key --profile --json --yes --dry-run --help --version",
    ].join("\n");
    emitSuccess(definition.path, { data: { command: definition.path, usage: definition.usage }, message }, flags, {});
    return;
  }
  if (AUTH_COMMANDS.has(definition.path) && flags["dry-run"]) {
    const failure = usageError("--dry-run is not supported for authentication commands.");
    emitError(definition.path, failure, flags);
    process.exitCode = failure.exitCode;
    return;
  }

  let context;
  try {
    context = buildContext({ flags, args, env, definition });
  } catch (error) {
    const failure = error instanceof CliError ? error : new CliError(String(error));
    emitError(definition.path, failure, flags);
    process.exitCode = failure.exitCode;
    return;
  }

  try {
    const result = await definition.run(context);
    const meta = {
      site: context.url || null,
      profile: context.profileName,
      durationMs: Date.now() - started,
    };
    emitSuccess(definition.path, result, flags, meta);
    if (result && typeof result === "object" && Number.isInteger(result.exitCode) && result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    const failure = error instanceof CliError
      ? error
      : new CliError(error instanceof Error ? error.message : String(error), {
        code: "internal_error",
        exitCode: 1,
      });
    emitError(definition.path, failure, flags);
    process.exitCode = failure.exitCode;
  }
}
