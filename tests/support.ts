import { SELF } from "cloudflare:test";

export const BASE = "https://example.com";
export const TEST_SETUP_TOKEN = "test-setup-token-123456";
export const TEST_OWNER = {
  email: "owner@example.com",
  password: "Sup3rSecret!",
  name: "Store Owner",
  storeName: "Test Store",
  currency: "USD",
};

export interface TestClient {
  request(path: string, init?: RequestInit): Promise<Response>;
  json(path: string, method: string, body: unknown, extraHeaders?: Record<string, string>): Promise<Response>;
  csrfHeaders(): Record<string, string>;
  ensureSession(): Promise<void>;
  cookie(name: string): string | undefined;
}

export function createClient(owner = TEST_OWNER): TestClient {
  const jar = new Map<string, string>();

  function cookieHeader(): string {
    return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  function captureCookies(response: Response): void {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0] ?? "";
      const index = pair.indexOf("=");
      if (index === -1) continue;
      const name = pair.slice(0, index);
      const value = decodeURIComponent(pair.slice(index + 1));
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    }
  }

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (jar.size > 0 && !headers.has("Cookie")) headers.set("Cookie", cookieHeader());
    const response = await SELF.fetch(BASE + path, { ...init, headers, redirect: init.redirect ?? "manual" });
    captureCookies(response);
    return response;
  }

  async function json(path: string, method: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
    return request(path, {
      method,
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
  }

  function csrfHeaders(): Record<string, string> {
    return { "X-CSRF-Token": jar.get("cc_csrf") ?? "" };
  }

  async function ensureSession(): Promise<void> {
    const status = (await (await request("/api/setup/status")).json()) as { installed: boolean };
    if (!status.installed) {
      const response = await json("/api/admin/setup", "POST", { setupToken: TEST_SETUP_TOKEN, ...owner });
      if (response.status !== 200) throw new Error(`Setup failed: ${response.status} ${await response.text()}`);
      return;
    }
    const response = await json("/api/admin/login", "POST", { email: owner.email, password: owner.password });
    if (response.status !== 200) throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  return { request, json, csrfHeaders, ensureSession, cookie: (name) => jar.get(name) };
}

export async function createProduct(
  client: TestClient,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await client.json("/api/admin/products", "POST", {
    name: "Linen Shirt",
    description: "A soft linen shirt.",
    status: "active",
    type: "simple",
    price: "25.00",
    stock: 10,
    manageStock: true,
    featured: true,
    tags: ["summer"],
    categoryIds: [],
    variants: [],
    ...overrides,
  }, client.csrfHeaders());
  if (response.status !== 201) throw new Error(`Product create failed: ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

export async function addToCart(client: TestClient, productId: string, quantity = 1): Promise<void> {
  const response = await client.json("/api/cart/items", "POST", { productId, quantity });
  if (response.status !== 200) throw new Error(`Add to cart failed: ${response.status} ${await response.text()}`);
}

export function checkoutForm(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    email: "buyer@example.com",
    name: "Buyer One",
    phone: "+1 555 0100",
    line1: "1 Market Street",
    line2: "",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "US",
    paymentMethod: "manual",
    customerNote: "",
    ...overrides,
  });
}
