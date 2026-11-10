const HIDDEN_KEYS = new Set(["token", "apiKey", "password", "token_hash", "tokenHash", "secret"]);

function isJson(flags) {
  return Boolean(flags.json || flags.output === "json");
}

function printable(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function visibleKeys(rows) {
  const keys = new Set();
  for (const row of rows.slice(0, 20)) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      for (const key of Object.keys(row)) {
        if (!HIDDEN_KEYS.has(key)) keys.add(key);
      }
    }
  }
  return [...keys].slice(0, 8);
}

function table(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "(empty)";
  if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    return rows.map((row) => printable(row)).join("\n");
  }
  const keys = visibleKeys(rows);
  const values = rows.map((row) => keys.map((key) => printable(row[key]).replace(/\s+/g, " ").slice(0, 56)));
  const widths = keys.map((key, index) =>
    Math.min(56, Math.max(key.length, ...values.map((row) => row[index].length))));
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join("  ").trimEnd();
  return [
    line(keys),
    line(widths.map((width) => "-".repeat(width))),
    ...values.map(line),
  ].join("\n");
}

function objectLines(value, prefix = "") {
  const lines = [];
  for (const [key, entry] of Object.entries(value)) {
    if (HIDDEN_KEYS.has(key)) continue;
    const name = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      lines.push(...objectLines(entry, name));
    } else if (Array.isArray(entry)) {
      lines.push(`${name}: ${entry.length ? printable(entry) : "(empty)"}`);
    } else {
      lines.push(`${name}: ${printable(entry)}`);
    }
  }
  return lines;
}

function humanize(data) {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return table(data);
  if (typeof data !== "object") return printable(data);
  if (Array.isArray(data.items)) return table(data.items);
  if (data.rates && Array.isArray(data.rates)) return table(data.rates);
  const lines = objectLines(data);
  return lines.length > 0 ? lines.join("\n") : printable(data);
}

export function emitSuccess(command, result, flags, meta = {}) {
  const data = result && typeof result === "object" && "data" in result ? result.data : result;
  const message = result && typeof result === "object" && typeof result.message === "string"
    ? result.message
    : null;

  if (isJson(flags)) {
    process.stdout.write(`${JSON.stringify({ ok: true, command, data: data ?? null, meta }, null, 2)}\n`);
    return;
  }
  if (flags.quiet) return;
  if (message) process.stdout.write(`${message}\n`);
  if (data !== undefined && data !== null && (flags.verbose || !message)) {
    const human = humanize(data);
    if (human) process.stdout.write(`${human}\n`);
  }
}

export function emitError(command, error, flags) {
  if (isJson(flags)) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      command,
      status: error.status ?? null,
      exitCode: error.exitCode ?? 1,
      error: {
        code: error.code ?? "cli_error",
        message: error.message ?? String(error),
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    }, null, 2)}\n`);
    return;
  }
  process.stderr.write(`error: ${error.message ?? String(error)}\n`);
}

export function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export { isJson, table, humanize };
