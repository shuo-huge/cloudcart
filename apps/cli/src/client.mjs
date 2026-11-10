import { apiError, networkError, usageError } from "./errors.mjs";

const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; CloudCartCLI/0.5.0; +https://github.com/shuo-huge/cloudcart)";

function parseSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    const values = headers.getSetCookie();
    if (values.length > 0) return values;
  }
  const combined = headers.get("set-cookie");
  if (!combined) return [];
  // Fallback for runtimes without getSetCookie(). Expires dates contain a
  // comma, so only split before a `name=` pair.
  return combined.split(/,(?=\s*[^;,=\s]+=)/g);
}

export class ApiClient {
  constructor({
    baseUrl,
    apiKey = null,
    userAgent = process.env.CLOUDCART_USER_AGENT || DEFAULT_USER_AGENT,
    timeout = 30_000,
    dryRun = false,
    verbose = false,
    fetchImpl = globalThis.fetch,
  }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.userAgent = userAgent;
    this.timeout = timeout;
    this.dryRun = dryRun;
    this.verbose = verbose;
    this.fetchImpl = fetchImpl;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  absorbCookies(headers) {
    for (const cookie of parseSetCookies(headers)) {
      const pair = cookie.split(";")[0] || "";
      const equals = pair.indexOf("=");
      if (equals === -1) continue;
      const name = pair.slice(0, equals).trim();
      const value = pair.slice(equals + 1).trim();
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  buildUrl(path, query) {
    if (!path.startsWith("/")) path = `/${path}`;
    const url = new URL(path, `${this.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  async request(method, path, {
    body,
    query,
    headers: extraHeaders,
    formData,
    anonymous = false,
    allowDryRun = true,
  } = {}) {
    const upper = method.toUpperCase();
    const mutating = !["GET", "HEAD"].includes(upper);
    if (mutating && this.dryRun && allowDryRun) {
      return {
        status: 0,
        dryRun: true,
        data: {
          method: upper,
          path,
          ...(body !== undefined ? { body } : {}),
          ...(formData ? { multipart: true } : {}),
        },
        headers: new Headers(),
        text: "",
      };
    }

    const url = this.buildUrl(path, query);
    const headers = new Headers(extraHeaders);
    headers.set("Accept", "application/json, text/html;q=0.9, */*;q=0.8");
    headers.set("User-Agent", this.userAgent);
    if (!anonymous && this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);
    if (this.cookies.size > 0 && !headers.has("Cookie")) headers.set("Cookie", this.cookieHeader());

    let requestBody;
    if (formData) {
      requestBody = formData;
    } else if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      requestBody = JSON.stringify(body);
    }

    if (this.verbose) {
      process.stderr.write(`→ ${upper} ${url.pathname}${url.search}\n`);
    }

    let response;
    try {
      response = await this.fetchImpl(url, {
        method: upper,
        headers,
        body: requestBody,
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (error) {
      throw networkError(error, url.toString());
    }

    this.absorbCookies(response.headers);
    const text = await response.text();
    let data = text;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // Keep text for previews/HTML and non-JSON errors.
      }
    }

    if (this.verbose) {
      process.stderr.write(`← ${response.status} ${upper} ${url.pathname}\n`);
    }
    if (!response.ok) throw apiError(response.status, data, text || `HTTP ${response.status}`);

    return { status: response.status, headers: response.headers, data, text };
  }

  async requestJson(method, path, options) {
    const result = await this.request(method, path, options);
    return result.data;
  }

  async login(email, password) {
    if (!email) throw usageError("An administrator email is required for login.");
    if (!password) throw usageError("A password is required for login.");
    const result = await this.request("POST", "/api/admin/login", {
      body: { email, password },
      anonymous: true,
    });
    this.absorbCookies(result.headers);
    return result.data;
  }

  async sessionRequest(method, path, { body, csrf } = {}) {
    const headers = {
      "X-CSRF-Token": csrf || "",
      ...(this.cookies.size > 0 ? { Cookie: this.cookieHeader() } : {}),
    };
    return this.request(method, path, { body, headers, anonymous: true });
  }

  async createApiKey(name, scopes, csrf, expiresAt) {
    return this.sessionRequest("POST", "/api/admin/api-keys", {
      body: {
        name,
        ...(scopes && scopes.length > 0 ? { scopes } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      },
      csrf,
    });
  }

  async logoutSession(csrf) {
    try {
      await this.sessionRequest("POST", "/api/admin/logout", { body: {}, csrf });
    } catch {
      // Logging out of the temporary bootstrap session is best effort.
    }
  }

  async uploadFile(path, { bytes, filename, contentType, alt, storage }) {
    const form = new FormData();
    const blob = new Blob([bytes], { type: contentType || "application/octet-stream" });
    form.append("file", blob, filename);
    if (alt) form.append("alt", alt);
    if (storage) form.append("storage", storage);
    return this.request("POST", path, { formData: form });
  }
}
