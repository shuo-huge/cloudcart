import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import { addToCart, checkoutForm, createClient, createProduct } from "./support";

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

async function createOrder(client: ReturnType<typeof createClient>, suffix: number, restock = true) {
  const slug = `return-product-${suffix}-${restock}`;
  const productId = await createProduct(client, { name: "Returnable Tee", slug, stock: 10, price: "25.00" });
  await addToCart(client, productId, 1);
  const checkout = await client.request("/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: checkoutForm({ email: `return-${suffix}-${restock}@example.com` }).toString(),
  });
  expect(checkout.status).toBe(303);
  const order = await database().first<{ id: string }>(
    "SELECT id FROM orders WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    [`return-${suffix}-${restock}@example.com`],
  );
  const item = await database().first<{ id: string }>(
    "SELECT id FROM order_items WHERE order_id = ?",
    [order!.id],
  );
  return { orderId: order!.id, itemId: item!.id, productId, slug };
}

describe("order returns", () => {
  it("records a return and restocks the selected quantity", async () => {
    const client = createClient();
    await client.ensureSession();
    const suffix = Date.now();
    const { orderId, itemId, productId } = await createOrder(client, suffix);
    const before = await database().first<{ stock: number }>("SELECT stock FROM products WHERE id = ?", [productId]);
    expect(before?.stock).toBe(9);

    const response = await client.json(`/api/admin/orders/${orderId}/returns`, "POST", {
      items: [{ orderItemId: itemId, quantity: 1 }],
      restock: true,
      reason: "Damaged in transit",
      note: "Returned by customer",
    }, client.csrfHeaders());
    expect(response.status).toBe(201);
    const created = (await response.json()) as { data: { return: { id: string; restock: number }; items: Array<{ quantity: number }> } };
    expect(created.data.return.restock).toBe(1);
    expect(created.data.items[0]?.quantity).toBe(1);

    const stock = await database().first<{ stock: number }>("SELECT stock FROM products WHERE id = ?", [productId]);
    expect(stock?.stock).toBe(10);
    const movement = await database().first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type = 'order_return' AND reference_id = ? AND reason = 'return_restock'",
      [created.data.return.id],
    );
    expect(movement?.count).toBe(1);

    const list = await client.request(`/api/admin/orders/${orderId}/returns`);
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { data: Array<{ items: Array<{ quantity: number }> }> };
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.items[0]?.quantity).toBe(1);
  });

  it("rejects returning more than the ordered quantity", async () => {
    const client = createClient();
    await client.ensureSession();
    const suffix = Date.now() + 1;
    const { orderId, itemId } = await createOrder(client, suffix);
    const response = await client.json(`/api/admin/orders/${orderId}/returns`, "POST", {
      items: [{ orderItemId: itemId, quantity: 2 }],
      restock: false,
    }, client.csrfHeaders());
    expect(response.status).toBe(409);
  });

  it("can record a return without restocking", async () => {
    const client = createClient();
    await client.ensureSession();
    const suffix = Date.now() + 2;
    const { orderId, itemId, productId } = await createOrder(client, suffix);
    const response = await client.json(`/api/admin/orders/${orderId}/returns`, "POST", {
      items: [{ orderItemId: itemId, quantity: 1 }],
      restock: false,
    }, client.csrfHeaders());
    expect(response.status).toBe(201);
    const stock = await database().first<{ stock: number }>("SELECT stock FROM products WHERE id = ?", [productId]);
    expect(stock?.stock).toBe(9);
    const movement = await database().first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM inventory_movements WHERE reference_type = 'order_return' AND product_id = ?",
      [productId],
    );
    expect(movement?.count).toBe(0);
  });
});
