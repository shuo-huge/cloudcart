export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : "";
}

function authExpired(): void {
  window.dispatchEvent(new CustomEvent("cloudcart:auth-expired"));
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as { error?: { message?: string; code?: string } } | null)?.error;
    if (response.status === 401) authExpired();
    throw new ApiError(error?.message ?? `Request failed (${response.status})`, response.status, error?.code ?? "request_failed");
  }
  const body = payload as { ok?: boolean; data?: T } | null;
  return (body?.data ?? (payload as T)) as T;
}

export async function adminGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  return parseResponse<T>(response);
}

export async function adminSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-CSRF-Token": getCookie("cc_csrf"),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`/api/admin${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function adminUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "X-CSRF-Token": getCookie("cc_csrf") },
    credentials: "same-origin",
    body: form,
  });
  return parseResponse<T>(response);
}

export async function publicGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" }, credentials: "same-origin" });
  return parseResponse<T>(response);
}

export async function publicSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse<T>(response);
}
