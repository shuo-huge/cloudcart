import { expect, test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH = path.resolve("e2e/.auth/admin.json");
const FIXTURES = path.resolve("e2e/.auth/fixtures.json");
const TOKEN_FILE = path.resolve("e2e/.auth/setup-token.txt");
const OWNER = {
  email: "e2e-owner@example.com",
  password: "E2ePassword123!",
  name: "E2E Owner",
  storeName: "E2E Store",
  currency: "USD",
};

setup("seeds a deterministic store", async ({ request }) => {
  fs.mkdirSync(path.dirname(AUTH), { recursive: true });
  const setupToken = fs.readFileSync(TOKEN_FILE, "utf8").trim();

  const status = await (await request.get("/api/setup/status")).json() as { installed: boolean };
  if (!status.installed) {
    const install = await request.post("/api/admin/setup", {
      data: { setupToken, ...OWNER },
    });
    expect(install.ok(), await install.text()).toBeTruthy();
  } else {
    const login = await request.post("/api/admin/login", {
      data: { email: OWNER.email, password: OWNER.password },
    });
    expect(login.ok(), await login.text()).toBeTruthy();
  }

  const state = await request.storageState();
  fs.writeFileSync(AUTH, JSON.stringify(state, null, 2));
  const csrf = state.cookies.find((cookie) => cookie.name === "cc_csrf")?.value ?? "";
  const csrfHeaders = { "X-CSRF-Token": csrf };

  async function put(pathName: string, data: unknown): Promise<void> {
    const response = await request.put(pathName, { data, headers: csrfHeaders });
    expect(response.ok(), `${pathName}: ${await response.text()}`).toBeTruthy();
  }
  async function post(pathName: string, data: unknown = {}): Promise<{ id?: string }> {
    const response = await request.post(pathName, { data, headers: csrfHeaders });
    expect(response.ok(), `${pathName}: ${await response.text()}`).toBeTruthy();
    const body = await response.json() as { data?: { id?: string } };
    return body.data ?? {};
  }

  await put("/api/admin/settings", {
    settings: {
      "store.name": "E2E Store",
      "store.currency": "USD",
      "store.email": "",
      "seo.title": "E2E Store",
      "seo.description": "E2E storefront",
      "tax.default_rate_bps": "825",
      "tax.default_name": "Sales tax",
      "tax.included": "0",
    },
  });

  const shipping = await (await request.get("/api/admin/shipping")).json() as {
    data: Array<{ id: string; countries_json: string }>;
  };
  const hasUsZone = shipping.data.some((zone) => zone.countries_json.includes('"US"'));
  if (!hasUsZone) {
    const zone = await post("/api/admin/shipping/zones", {
      name: "United States",
      countries: ["US"],
      isDefault: false,
    });
    expect(zone.id).toBeTruthy();
    await post("/api/admin/shipping/rates", {
      zoneId: zone.id,
      name: "Standard shipping",
      price: "5.00",
      minOrder: "0",
      maxOrder: null,
      freeOver: null,
      isActive: true,
      position: 0,
    });
  }

  const imageUrls = [
    "https://picsum.photos/seed/e2e-one/600/600",
    "https://picsum.photos/seed/e2e-two/600/600",
    "https://picsum.photos/seed/e2e-three/600/600",
  ];
  const product = await post("/api/admin/products", {
    name: "E2E Canvas Tote",
    slug: "e2e-canvas-tote",
    description: "A canvas tote used by the browser test suite.",
    status: "active",
    type: "simple",
    price: "25.00",
    stock: 20,
    manageStock: true,
    featured: true,
    tags: ["e2e"],
    categoryIds: [],
    variants: [],
  });
  expect(product.id).toBeTruthy();
  for (const url of imageUrls) {
    const media = await post("/api/admin/media/external", { url, alt: "E2E product image" });
    await post(`/api/admin/products/${product.id}/images`, { mediaId: media.id, alt: "E2E product image" });
  }

  await put("/api/admin/pages/home/draft", {
    document: {
      version: 1,
      page: "home",
      sections: [
        { id: "e2e-announcement", type: "announcement-bar", enabled: true, settings: { text: "E2E announcement" } },
        {
          id: "e2e-hero",
          type: "hero",
          enabled: true,
          settings: {
            title: "E2E Home Hero",
            subtitle: "Browser test storefront",
            buttonText: "Shop",
            buttonUrl: "/products",
          },
        },
        { id: "e2e-products", type: "product-grid", enabled: true, settings: { title: "Featured products", limit: 8, source: "featured" } },
      ],
    },
  });
  const publish = await request.post("/api/admin/pages/home/publish", { data: {}, headers: csrfHeaders });
  expect(publish.ok(), await publish.text()).toBeTruthy();
  const published = await publish.json() as { data: { version: number } };

  const theme = await request.post("/api/admin/themes/default/activate", { data: {}, headers: csrfHeaders });
  expect(theme.ok(), await theme.text()).toBeTruthy();

  fs.writeFileSync(FIXTURES, JSON.stringify({
    productId: product.id,
    productSlug: "e2e-canvas-tote",
    imageUrls,
    homeVersion: published.data.version,
  }, null, 2));
});
