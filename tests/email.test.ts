import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Database } from "@cloudcart/database";
import { dispatchEmailOutbox, enqueueOrderEventEmails } from "@cloudcart/core";
import type { EmailTransport, OutgoingEmail } from "@cloudcart/plugin-sdk";
import { createEmailTransport, normalizeEmailConfig } from "@cloudcart/plugin-email-notifications";
import { addToCart, checkoutForm, createClient, createProduct } from "./support";

function database(): Database {
  return new Database((env as unknown as { DB: D1Database }).DB);
}

async function enableEmail(client: ReturnType<typeof createClient>, extra: Record<string, string> = {}): Promise<void> {
  const enabled = await client.json("/api/admin/plugins/email-notifications/enable", "POST", {}, client.csrfHeaders());
  expect(enabled.status).toBe(200);
  await database().run("DELETE FROM email_outbox");
  const saved = await client.json("/api/admin/plugins/email-notifications/settings", "PUT", {
    settings: {
      backend: "resend",
      from: "store@example.com",
      fromName: "Test Store",
      replyTo: "",
      notifyAdmin: "1",
      resendApiKey: "re_test_key",
      ...extra,
    },
    secretKeys: ["resendApiKey"],
  }, client.csrfHeaders());
  expect(saved.status).toBe(200);
}

async function checkoutOrder(client: ReturnType<typeof createClient>, email = "buyer@example.com"): Promise<string> {
  const productId = await createProduct(client, { name: `Email Item ${email}`, slug: `email-item-${email.split("@")[0]}` });
  await addToCart(client, productId, 1);
  const checkout = await client.request("/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: checkoutForm({ email }).toString(),
  });
  expect(checkout.status).toBe(303);
  const order = await database().first<{ id: string }>("SELECT id FROM orders ORDER BY created_at DESC LIMIT 1");
  return order!.id;
}

function fakeTransport(result: (message: OutgoingEmail, index: number) => Awaited<ReturnType<EmailTransport["send"]>> = () => ({ ok: true, providerMessageId: "msg_1" })): {
  transport: EmailTransport;
  sent: OutgoingEmail[];
} {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    transport: {
      name: "fake",
      async send(message) {
        sent.push(message);
        return result(message, sent.length - 1);
      },
    },
  };
}

describe("email notifications", () => {
  it("queues order emails and dispatches them through the configured transport", async () => {
    const client = createClient();
    await client.ensureSession();
    await enableEmail(client);
    const orderId = await checkoutOrder(client);

    const rows = await database().all<{ recipient: string; event: string; status: string; subject: string }>(
      "SELECT recipient, event, status, subject FROM email_outbox WHERE order_id = ? ORDER BY created_at",
      [orderId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipient: "buyer@example.com", event: "order.placed", status: "pending" });
    expect(rows[0]!.subject).toContain("received");

    const { transport, sent } = fakeTransport();
    const summary = await dispatchEmailOutbox(database(), transport, { from: "Test Store <store@example.com>" });
    expect(summary).toMatchObject({ sent: 1, failed: 0 });
    expect(sent[0]).toMatchObject({ to: "buyer@example.com", from: "Test Store <store@example.com>" });
    expect(sent[0]!.html).toContain("Order");

    const sentRow = await database().first<{ status: string; provider: string; sent_at: string | null }>(
      "SELECT status, provider, sent_at FROM email_outbox WHERE order_id = ?",
      [orderId],
    );
    expect(sentRow?.status).toBe("sent");
    expect(sentRow?.provider).toBe("fake");
    expect(sentRow?.sent_at).toBeTruthy();
  });

  it("copies the store when a support email is configured", async () => {
    const client = createClient();
    await client.ensureSession();
    await enableEmail(client);
    await client.json("/api/admin/settings", "PUT", {
      settings: { "store.email": "support@example.com" },
    }, client.csrfHeaders());
    const orderId = await checkoutOrder(client, "copy-buyer@example.com");

    const recipients = await database().all<{ recipient: string; recipient_role: string }>(
      "SELECT recipient, recipient_role FROM email_outbox WHERE order_id = ? ORDER BY recipient_role",
      [orderId],
    );
    expect(recipients.map((row) => row.recipient_role).sort()).toEqual(["customer", "store"]);
    expect(recipients.map((row) => row.recipient).sort()).toEqual(["copy-buyer@example.com", "support@example.com"]);
  });

  it("records provider failures, backs off, and retries", async () => {
    const client = createClient();
    await client.ensureSession();
    await enableEmail(client);
    await client.json("/api/admin/settings", "PUT", { settings: { "store.email": "" } }, client.csrfHeaders());
    await checkoutOrder(client, "retry-buyer@example.com");

    const failing = fakeTransport(() => ({ ok: false, error: "provider unavailable" }));
    const first = await dispatchEmailOutbox(database(), failing.transport, { from: "store@example.com" });
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    const waiting = await database().first<{ status: string; attempts: number; last_error: string; next_attempt_at: string }>(
      "SELECT status, attempts, last_error, next_attempt_at FROM email_outbox ORDER BY created_at DESC LIMIT 1",
    );
    expect(waiting).toMatchObject({ status: "pending", attempts: 1, last_error: "provider unavailable" });
    expect(new Date(waiting!.next_attempt_at).getTime()).toBeGreaterThan(Date.now());

    const retrying = fakeTransport();
    const second = await dispatchEmailOutbox(database(), retrying.transport, {
      from: "store@example.com",
      now: new Date(Date.now() + 2 * 60_000),
    });
    expect(second).toMatchObject({ sent: 1, failed: 0 });
    const sentRow = await database().first<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM email_outbox ORDER BY created_at DESC LIMIT 1",
    );
    expect(sentRow).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("sends no queue rows when the plugin is disabled", async () => {
    const client = createClient();
    await client.ensureSession();
    await database().run("DELETE FROM email_outbox");
    const disabled = await client.json("/api/admin/plugins/email-notifications/disable", "POST", {}, client.csrfHeaders());
    expect(disabled.status).toBe(200);
    const orderId = await checkoutOrder(client, "disabled-buyer@example.com");
    const queued = await enqueueOrderEventEmails(database(), "order.placed", orderId, {
      masterKey: "test-master-key-0123456789abcdef",
      origin: "https://example.com",
    });
    expect(queued).toBe(0);
    const count = await database().first<{ count: number }>("SELECT COUNT(*) AS count FROM email_outbox");
    expect(Number(count?.count ?? 0)).toBe(0);
  });

  it("queues payment and shipment events from admin actions", async () => {
    const client = createClient();
    await client.ensureSession();
    await enableEmail(client);
    await client.json("/api/admin/settings", "PUT", { settings: { "store.email": "" } }, client.csrfHeaders());
    const orderId = await checkoutOrder(client, "lifecycle-buyer@example.com");

    const confirm = await client.json(`/api/admin/orders/${orderId}/confirm-payment`, "POST", { note: "" }, client.csrfHeaders());
    expect(confirm.status).toBe(200);
    const ship = await client.json(`/api/admin/orders/${orderId}/status`, "POST", { status: "shipped" }, client.csrfHeaders());
    expect(ship.status).toBe(200);

    const events = await database().all<{ event: string }>(
      "SELECT event FROM email_outbox WHERE order_id = ? ORDER BY created_at",
      [orderId],
    );
    expect(events.map((row) => row.event)).toEqual(["order.placed", "payment.confirmed", "order.shipped"]);
  });

  it("supports the Cloudflare Email Workers binding", async () => {
    const captured: Array<{ to: string; subject: string }> = [];
    const binding = {
      async send(message: { to: string; subject: string }) {
        captured.push({ to: message.to, subject: message.subject });
      },
    };
    const config = normalizeEmailConfig({
      backend: "cloudflare",
      from: "store@example.com",
      fromName: "Test Store",
    });
    const transport = createEmailTransport(config, { emailBinding: binding });
    const result = await transport.send({
      from: "Test Store <store@example.com>",
      to: "buyer@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
    });
    expect(result.ok).toBe(true);
    expect(captured).toEqual([{ to: "buyer@example.com", subject: "Hello" }]);
  });
});
