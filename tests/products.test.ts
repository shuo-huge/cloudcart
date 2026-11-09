import { describe, expect, it } from "vitest";
import { addToCart, checkoutForm, createClient, createProduct } from "./support";
import { Database } from "@cloudcart/database";
import { env } from "cloudflare:test";

interface ProductImage {
  id: string;
  r2_key: string;
  position: number;
}

interface AdminProduct {
  id: string;
  slug: string;
  images: ProductImage[];
}

async function attachExternalImage(client: ReturnType<typeof createClient>, productId: string, url: string): Promise<void> {
  const media = await client.json("/api/admin/media/external", "POST", { url, alt: "Product image" }, client.csrfHeaders());
  expect(media.status).toBe(201);
  const mediaId = ((await media.json()) as { data: { id: string } }).data.id;
  const attached = await client.json(`/api/admin/products/${productId}/images`, "POST", {
    mediaId,
    alt: "Product image",
  }, client.csrfHeaders());
  expect(attached.status).toBe(201);
}

async function loadProduct(client: ReturnType<typeof createClient>, productId: string): Promise<AdminProduct> {
  const response = await client.request(`/api/admin/products/${productId}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: AdminProduct }).data;
}

describe("product image ordering", () => {
  it("reorders images atomically and updates the primary image", async () => {
    const client = createClient();
    await client.ensureSession();
    const productId = await createProduct(client, { name: "Gallery Tote", slug: "gallery-tote" });
    await attachExternalImage(client, productId, "https://example.com/images/one.jpg");
    await attachExternalImage(client, productId, "https://example.com/images/two.jpg");
    await attachExternalImage(client, productId, "https://example.com/images/three.jpg");

    const before = await loadProduct(client, productId);
    expect(before.images.map((image) => image.position)).toEqual([0, 1, 2]);
    const [first, second, third] = before.images;
    expect(before.images[0]!.r2_key).toBe(first!.r2_key);

    const reversed = [third!.id, second!.id, first!.id];
    const reorder = await client.json(`/api/admin/products/${productId}/images/order`, "PUT", {
      imageIds: reversed,
    }, client.csrfHeaders());
    expect(reorder.status).toBe(200);

    const after = await loadProduct(client, productId);
    expect(after.images.map((image) => image.id)).toEqual(reversed);
    expect(after.images.map((image) => image.position)).toEqual([0, 1, 2]);
    expect(after.images[0]!.r2_key).toBe(third!.r2_key);
  });

  it("rejects duplicate, foreign, and incomplete image lists", async () => {
    const client = createClient();
    await client.ensureSession();
    const productId = await createProduct(client, { name: "Strict Tote", slug: "strict-tote" });
    const otherId = await createProduct(client, { name: "Other Tote", slug: "other-tote" });
    await attachExternalImage(client, productId, "https://example.com/images/a.jpg");
    await attachExternalImage(client, productId, "https://example.com/images/b.jpg");
    await attachExternalImage(client, otherId, "https://example.com/images/c.jpg");

    const product = await loadProduct(client, productId);
    const other = await loadProduct(client, otherId);
    const ids = product.images.map((image) => image.id);

    const duplicate = await client.json(`/api/admin/products/${productId}/images/order`, "PUT", {
      imageIds: [ids[0], ids[0]],
    }, client.csrfHeaders());
    expect(duplicate.status).toBe(400);

    const foreign = await client.json(`/api/admin/products/${productId}/images/order`, "PUT", {
      imageIds: [ids[0], other.images[0]!.id],
    }, client.csrfHeaders());
    expect(foreign.status).toBe(400);

    const incomplete = await client.json(`/api/admin/products/${productId}/images/order`, "PUT", {
      imageIds: [ids[0]],
    }, client.csrfHeaders());
    expect(incomplete.status).toBe(409);

    const unchanged = await loadProduct(client, productId);
    expect(unchanged.images.map((image) => image.id)).toEqual(ids);
  });

  it("compacts positions after removing an image", async () => {
    const client = createClient();
    await client.ensureSession();
    const productId = await createProduct(client, { name: "Compact Tote", slug: "compact-tote" });
    await attachExternalImage(client, productId, "https://example.com/images/x.jpg");
    await attachExternalImage(client, productId, "https://example.com/images/y.jpg");
    await attachExternalImage(client, productId, "https://example.com/images/z.jpg");
    const product = await loadProduct(client, productId);
    const [first, middle, last] = product.images;

    const removed = await client.json(`/api/admin/products/${productId}/images/${middle!.id}`, "DELETE", undefined, client.csrfHeaders());
    expect(removed.status).toBe(200);

    const after = await loadProduct(client, productId);
    expect(after.images.map((image) => image.id)).toEqual([first!.id, last!.id]);
    expect(after.images.map((image) => image.position)).toEqual([0, 1]);
  });

  it("keeps tax and image ordering compatible with checkout", async () => {
    const client = createClient();
    await client.ensureSession();
    const productId = await createProduct(client, { name: "Checkout Tote", slug: "checkout-tote" });
    await attachExternalImage(client, productId, "https://example.com/images/checkout.jpg");
    await addToCart(client, productId, 1);
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email: "images-buyer@example.com" }).toString(),
    });
    expect(checkout.status).toBe(303);
    const db = new Database((env as unknown as { DB: D1Database }).DB);
    const item = await db.first<{ image_key: string | null }>(
      "SELECT image_key FROM order_items ORDER BY created_at DESC LIMIT 1",
    );
    expect(item?.image_key).toBe("https://example.com/images/checkout.jpg");
  });
});
