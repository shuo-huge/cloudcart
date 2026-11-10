export class CliError extends Error {
  constructor(message, { code = "cli_error", exitCode = 1, status = null, details = undefined } = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.status = status;
    this.details = details;
  }
}

export function usageError(message) {
  return new CliError(message, { code: "usage", exitCode: 2 });
}

export function authError(message = "Run `cloudcart auth login` first.") {
  return new CliError(message, { code: "not_authenticated", exitCode: 3 });
}

export function exitCodeForStatus(status) {
  if (status === 401 || status === 403) return 3;
  if (status === 404) return 4;
  if (status === 409) return 5;
  if (status === 429) return 6;
  if (status >= 500) return 7;
  if (status === 400 || status === 422) return 2;
  return 1;
}

export function apiError(status, body, fallback = "The request failed.") {
  const error = body && typeof body === "object" ? body.error : null;
  return new CliError(
    typeof error?.message === "string" ? error.message : fallback,
    {
      code: typeof error?.code === "string" ? error.code : `http_${status}`,
      exitCode: exitCodeForStatus(status),
      status,
      details: error?.details,
    },
  );
}

export function networkError(error, url) {
  const message = error instanceof Error ? error.message : String(error);
  return new CliError(`Could not reach ${url}: ${message}`, {
    code: "network_error",
    exitCode: 8,
  });
}

export function requireConfirmation(flags, action) {
  if (flags.yes) return;
  throw new CliError(
    `${action} is destructive. Re-run with --yes to confirm, or add --dry-run to inspect the request.`,
    { code: "confirmation_required", exitCode: 2 },
  );
}
