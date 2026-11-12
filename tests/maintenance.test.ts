import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import { expireStaleOrders } from "@cloudcart/core";
import { runScheduledTasks } from "../apps/worker/src/scheduled";
import { addToCart, checkoutForm, createClient, createProduct } from "./support";

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

describe("scheduled order maintenance", () => {
  it("expires an unpaid online order, restores stock and releases the coupon", async () => {
    const client = createClient();
    await client.ensureSession();
    const suffix = Date.now();
    const slug = `expire-product-${suffix}`;
    const productId = await createProduct(client, { name: "Expiring Tee", slug, stock: 10, price: "25.00" });

    const coupon = await client.json("/api/admin/coupons", "POST", {
      code: `EXPIRE${suffix}`.slice(0, 40),
      type: "percent",
      value: 10,
      maxUses: 1,
      appliesTo: "all",
      status: "active",
      productIds: [],
      categoryIds: [],
    }, client.csrfHeaders());
    expect(coupon.status).toBe(201);
    const couponCode = `EXPIRE${suffix}`.slice(0, 40);

    await addToCart(client, productId, 1);
    const applied = await client.json("/api/cart/coupon", "POST", { code: couponCode });
    expect(applied.status).toBe(200);
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email: `expire-${suffix}@example.com` }).toString(),
    });
    expect(checkout.status).toBe(303);

    const order = await database().first<{ id: string }>(
      "SELECT id FROM orders WHERE email = ? ORDER BY created_at DESC LIMIT 1",
      [`expire-${suffix}@example.com`],
    );
    expect(order).toBeTruthy();
    // Simulate an online order abandoned for two hours.
    await database().run(
      "UPDATE orders SET status = 'pending_payment', payment_status = 'unpaid', created_at = ? WHERE id = ?",
      [new Date(Date.now() - 2 * 60 * 60_000).toISOString(), order!.id],
    );
    const couponBefore = await database().first<{ used_count: number }>(
      "SELECT used_count FROM coupons WHERE code = ?",
      [couponCode],
    );
    expect(couponBefore?.used_count).toBe(1);

    const summary = await expireStaleOrders(database(), { olderThanMinutes: 60 });
    expect(summary.expired).toBeGreaterThanOrEqual(1);

    const cancelled = await database().first<{
      status: string;
      restocked_at: string | null;
    }>("SELECT status, restocked_at FROM orders WHERE id = ?", [order!.id]);
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.restocked_at).toBeTruthy();

    const stock = await database().first<{ stock: number }>(
      "SELECT stock FROM products WHERE id = ?",
      [productId],
    );
    expect(stock?.stock).toBe(10);
    const couponAfter = await database().first<{ used_count: number }>(
      "SELECT used_count FROM coupons WHERE code = ?",
      [couponCode],
    );
    expect(couponAfter?.used_count).toBe(0);
    const redemption = await database().first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE order_id = ?",
      [order!.id],
    );
    expect(redemption?.count).toBe(0);
    const audit = await database().first<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = ? AND action = 'order.expired'",
      [order!.id],
    );
    expect(audit?.action).toBe("order.expired");
  });

  it("runs order expiry and email retry from the scheduled handler", async () => {
    const client = createClient();
    await client.ensureSession();
    const suffix = Date.now();
    const slug = `scheduled-expire-${suffix}`;
    const productId = await createProduct(client, { name: "Scheduled Expire Tee", slug, stock: 5 });
    await addToCart(client, productId, 1);
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email: `scheduled-expire-${suffix}@example.com` }).toString(),
    });
    expect(checkout.status).toBe(303);
    const order = await database().first<{ id: string }>(
      "SELECT id FROM orders WHERE email = ? ORDER BY created_at DESC LIMIT 1",
      [`scheduled-expire-${suffix}@example.com`],
    );
    await database().run(
      "UPDATE orders SET status = 'pending_payment', payment_status = 'unpaid', created_at = ? WHERE id = ?",
      [new Date(Date.now() - 2 * 60 * 60_000).toISOString(), order!.id],
    );

    const summary = await runScheduledTasks(env as unknown as Parameters<typeof runScheduledTasks>[0]);
    expect(summary.orders.expired).toBeGreaterThanOrEqual(1);
    expect(summary.email.skipped).toBe(true);
    const after = await database().first<{ status: string }>("SELECT status FROM orders WHERE id = ?", [order!.id]);
    expect(after?.status).toBe("cancelled");
  });

  it("does not expire a manual payment order", async () => {
    const client = createClient();
    await client.ensureSession();
    const suffix = Date.now();
    const slug = `manual-wait-${suffix}`;
    const productId = await createProduct(client, { name: "Manual Wait Tee", slug, stock: 5 });
    await addToCart(client, productId, 1);
    const checkout = await client.request("/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: checkoutForm({ email: `manual-wait-${suffix}@example.com` }).toString(),
    });
    expect(checkout.status).toBe(303);
    const order = await database().first<{ id: string; status: string }>(
      "SELECT id, status FROM orders WHERE email = ? ORDER BY created_at DESC LIMIT 1",
      [`manual-wait-${suffix}@example.com`],
    );
    expect(order?.status).toBe("awaiting_manual_payment");
    await database().run(
      "UPDATE orders SET created_at = ? WHERE id = ?",
      [new Date(Date.now() - 2 * 60 * 60_000).toISOString(), order!.id],
    );
    await expireStaleOrders(database(), { olderThanMinutes: 60 });
    const after = await database().first<{ status: string }>(
      "SELECT status FROM orders WHERE id = ?",
      [order!.id],
    );
    expect(after?.status).toBe("awaiting_manual_payment");
  });
});
