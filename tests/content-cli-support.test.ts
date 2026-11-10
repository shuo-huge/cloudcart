import { describe, expect, it } from "vitest";
import { createClient } from "./support";

describe("CLI support endpoints", () => {
  it("renames and deletes content pages, but protects home", async () => {
    const client = createClient();
    await client.ensureSession();

    const created = await client.json("/api/admin/pages", "POST", {
      title: "CLI Page",
      slug: "cli-page",
    }, client.csrfHeaders());
    expect(created.status, await created.text()).toBe(201);

    const renamed = await client.json("/api/admin/pages/cli-page", "PUT", {
      title: "CLI Page Renamed",
    }, client.csrfHeaders());
    expect(renamed.status, await renamed.text()).toBe(200);

    const page = await client.request("/api/admin/pages/cli-page");
    expect(page.status).toBe(200);
    const pageBody = (await page.json()) as { data: { page: { title: string } } };
    expect(pageBody.data.page.title).toBe("CLI Page Renamed");

    const deleted = await client.json("/api/admin/pages/cli-page", "DELETE", {}, client.csrfHeaders());
    expect(deleted.status, await deleted.text()).toBe(200);
    expect((await client.request("/api/admin/pages/cli-page")).status).toBe(404);

    const home = await client.json("/api/admin/pages/home", "DELETE", {}, client.csrfHeaders());
    expect(home.status).toBe(400);
  });

  it("returns coupon scope ids for safe updates", async () => {
    const client = createClient();
    await client.ensureSession();

    const created = await client.json("/api/admin/coupons", "POST", {
      code: "CLIDETAIL",
      type: "percent",
      value: 10,
      minSubtotal: "0",
      startsAt: null,
      endsAt: null,
      maxUses: null,
      appliesTo: "all",
      status: "active",
      productIds: [],
      categoryIds: [],
    }, client.csrfHeaders());
    const createdText = await created.text();
    expect(created.status, createdText).toBe(201);
    const id = (JSON.parse(createdText) as { data: { id: string } }).data.id;

    const detail = await client.request(`/api/admin/coupons/${id}`);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      data: { coupon: { code: string }; productIds: string[]; categoryIds: string[] };
    };
    expect(body.data.coupon.code).toBe("CLIDETAIL");
    expect(body.data.productIds).toEqual([]);
    expect(body.data.categoryIds).toEqual([]);

    expect((await client.request("/api/admin/coupons/missing")).status).toBe(404);
  });
});
