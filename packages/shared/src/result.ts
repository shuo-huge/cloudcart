export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface AppError {
  code: string;
  message: string;
  status: number;
  details?: unknown;
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail(code: string, message: string, status = 400, details?: unknown): Result<never, AppError> {
  return { ok: false, error: { code, message, status, details } };
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null &&
    typeof (value as AppError).code === "string" &&
    typeof (value as AppError).status === "number";
}
