import { formatDate } from "@cloudcart/shared";
import { useEffect, useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import {
  DataTable,
  ErrorBox,
  Field,
  Loading,
  Modal,
  Money,
  Pagination,
  StatusBadge,
  enumLabel,
  toast,
  useAsync,
} from "../components";
import { linkProps, navigate } from "../router";
import type { Order, OrderAddress, OrderItem, OrderReturn, PaymentTransaction } from "../types";

const STATUSES = [
  "draft", "pending_payment", "awaiting_manual_payment", "paid", "processing",
  "shipped", "completed", "cancelled", "refunded", "partially_refunded",
];

function taxLabel(metadataJson: string): string {
  try {
    const parsed = JSON.parse(metadataJson) as { tax?: { name?: string; included?: boolean } };
    const name = parsed.tax?.name || "Tax";
    return parsed.tax?.included ? `${name} (included)` : name;
  } catch {
    return "Tax";
  }
}

export function OrdersPage() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(
    () => adminGet<{ items: Order[]; total: number }>(`/orders?page=${page}&perPage=20&status=${status}&q=${encodeURIComponent(search)}`),
    [page, status, search],
  );

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Orders</h1>
          <p class="muted">Review orders, confirm manual payments and manage fulfilment.</p>
        </div>
      </header>
      <section class="card">
        <div class="toolbar">
          <input
            type="search"
            placeholder="Search order number or email"
            value={search}
            onInput={(event) => { setSearch((event.target as HTMLInputElement).value); setPage(1); }}
          />
          <select value={status} onChange={(event) => { setStatus((event.target as HTMLSelectElement).value); setPage(1); }}>
            <option value="all">All statuses</option>
            {STATUSES.map((value) => <option key={value} value={value}>{enumLabel(value)}</option>)}
          </select>
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? <Loading /> : (
          <>
            <DataTable
              rows={data?.items ?? []}
              empty="No orders match this view."
              columns={[
                {
                  key: "order",
                  label: "Order",
                  render: (order) => <a class="text-link" {...linkProps(`/orders/${order.id}`)}>{order.order_number}</a>,
                },
                {
                  key: "customer",
                  label: "Customer",
                  render: (order) => <div>{order.customer_name ?? <span class="muted">Guest</span>}<div class="muted small">{order.email}</div></div>,
                },
                { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
                { key: "payment", label: "Payment", render: (order) => <StatusBadge status={order.payment_status} /> },
                { key: "total", label: "Total", render: (order) => <Money cents={order.total_cents} currency={order.currency} /> },
                { key: "date", label: "Placed", render: (order) => formatDate(order.created_at) },
              ]}
            />
            <Pagination page={page} perPage={20} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

interface OrderDetailData {
  order: Order;
  items: OrderItem[];
  addresses: OrderAddress[];
  transactions: PaymentTransaction[];
  logs: Array<{ action: string; created_at: string; admin_id: string | null; details_json: string }>;
}

const TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_payment", "awaiting_manual_payment", "cancelled"],
  pending_payment: ["awaiting_manual_payment", "cancelled"],
  awaiting_manual_payment: ["cancelled"],
  paid: ["processing", "shipped", "completed", "cancelled"],
  processing: ["shipped", "completed", "cancelled"],
  shipped: ["completed"],
  completed: [],
  cancelled: [],
  refunded: [],
  partially_refunded: [],
};

export function OrderDetailPage({ id }: { id: string }) {
  const { data, loading, error, reload } = useAsync(() => adminGet<OrderDetailData>(`/orders/${id}`), [id]);
  const returns = useAsync(() => adminGet<OrderReturn[]>(`/orders/${id}/returns`), [id]);
  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnRestock, setReturnRestock] = useState(true);
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  useEffect(() => {
    if (!data) return;
    setCarrier(data.order.shipping_carrier ?? "");
    setTrackingNumber(data.order.tracking_number ?? "");
    setTrackingUrl(data.order.tracking_url ?? "");
  }, [data]);

  async function run(action: () => Promise<unknown>, message: string): Promise<void> {
    setBusy(true);
    try {
      await action();
      toast(message);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const { order, items, addresses, transactions, logs } = data;
  const shipping = addresses.find((address) => address.type === "shipping");
  const activeTransitions = TRANSITIONS[order.status] ?? [];
  const canConfirm = order.payment_method === "manual" &&
    !["paid", "refunded", "partially_refunded"].includes(order.payment_status) &&
    !["cancelled", "refunded", "partially_refunded"].includes(order.status);
  const canRefund = ["paid", "partially_refunded"].includes(order.payment_status) &&
    order.refunded_cents < order.total_cents;
  const onlineRefund = Boolean(order.payment_method && order.payment_method !== "manual");
  const providerName = order.payment_method ? enumLabel(order.payment_method) : "the payment provider";
  const returnedByItem = new Map<string, number>();
  for (const entry of returns.data ?? []) {
    for (const item of entry.items) {
      returnedByItem.set(item.order_item_id, (returnedByItem.get(item.order_item_id) ?? 0) + item.quantity);
    }
  }

  async function recordReturn(): Promise<void> {
    const items = Object.entries(returnQuantities)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity: Number(quantity) }))
      .filter((item) => Number.isSafeInteger(item.quantity) && item.quantity > 0);
    if (items.length === 0) {
      toast("Enter a return quantity for at least one item.", "error");
      return;
    }
    await run(
      () => adminSend(`/orders/${id}/returns`, "POST", {
        items,
        restock: returnRestock,
        reason: returnReason,
        note: returnNote,
      }),
      "Return recorded.",
    );
    setReturnOpen(false);
    setReturnQuantities({});
    setReturnReason("");
    setReturnNote("");
    returns.reload();
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <p class="breadcrumb"><a {...linkProps("/orders")}>Orders</a> / {order.order_number}</p>
          <h1>{order.order_number}</h1>
          <p class="muted">{formatDate(order.created_at)} · {order.email}</p>
        </div>
        <div class="page-actions">
          <StatusBadge status={order.status} />
          <StatusBadge status={order.payment_status} />
        </div>
      </header>

      <div class="editor-grid">
        <div class="editor-main">
          <section class="card">
            <h2>Items</h2>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Total</th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}{item.sku ? <div class="muted small">{item.sku}</div> : null}</td>
                      <td><Money cents={item.unit_price_cents} currency={order.currency} /></td>
                      <td>{item.quantity}</td>
                      <td><Money cents={item.total_cents} currency={order.currency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl class="totals">
              <div><dt>Subtotal</dt><dd><Money cents={order.subtotal_cents} currency={order.currency} /></dd></div>
              {order.discount_cents > 0 && <div><dt>Discount {order.coupon_code ? `(${order.coupon_code})` : ""}</dt><dd>−<Money cents={order.discount_cents} currency={order.currency} /></dd></div>}
              <div><dt>Shipping</dt><dd><Money cents={order.shipping_cents} currency={order.currency} /></dd></div>
              {order.tax_cents > 0 && <div><dt>{taxLabel(order.metadata_json)}</dt><dd><Money cents={order.tax_cents} currency={order.currency} /></dd></div>}
              {order.refunded_cents > 0 && <div><dt>Refunded</dt><dd>−<Money cents={order.refunded_cents} currency={order.currency} /></dd></div>}
              <div class="totals-grand"><dt>Total</dt><dd><Money cents={order.total_cents} currency={order.currency} /></dd></div>
            </dl>
          </section>

          <section class="card">
            <h2>Timeline & notes</h2>
            {order.customer_note && <div class="notice"><strong>Customer note:</strong> {order.customer_note}</div>}
            {order.internal_note && <pre class="internal-note">{order.internal_note}</pre>}
            <form class="inline-form" onSubmit={(event) => {
              event.preventDefault();
              if (!note.trim()) return;
              void run(() => adminSend(`/orders/${id}/notes`, "POST", { note }), "Note added.").then(() => setNote(""));
            }}>
              <input placeholder="Add an internal note" value={note} onInput={(event) => setNote((event.target as HTMLInputElement).value)} />
              <button type="submit" class="button" disabled={busy || !note.trim()}>Add note</button>
            </form>
            <ul class="timeline">
              {logs.map((log, index) => (
                <li key={index}>
                  <strong>{enumLabel(log.action.replace(/\./g, " "))}</strong>
                  <span class="muted small">{formatDate(log.created_at)}</span>
                </li>
              ))}
              {logs.length === 0 && <li class="muted">No admin actions recorded yet.</li>}
            </ul>
          </section>
        </div>

        <aside class="editor-side">
          <section class="card">
            <h2>Fulfilment</h2>
            <Field label="Order status">
              <select value={nextStatus} onChange={(event) => setNextStatus((event.target as HTMLSelectElement).value)}>
                <option value="">Choose next status…</option>
                {activeTransitions.map((value) => <option key={value} value={value}>{enumLabel(value)}</option>)}
              </select>
            </Field>
            <button
              type="button"
              class="button button--primary button--block"
              disabled={!nextStatus || busy}
              onClick={() => run(() => adminSend(`/orders/${id}/status`, "POST", { status: nextStatus }), "Order status updated.")}
            >
              Update status
            </button>
            {order.status !== "cancelled" && order.payment_status !== "refunded" && !["shipped", "completed", "refunded", "partially_refunded"].includes(order.status) && (
              <button
                type="button"
                class="button button--danger button--block"
                style="margin-top:8px"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Cancel this order and restore stock?")) return;
                  void run(() => adminSend(`/orders/${id}/cancel`, "POST", {}), "Order cancelled and stock restored.");
                }}
              >
                Cancel order & restock
              </button>
            )}
          </section>

          {canConfirm && (
            <section class="card">
              <h2>Manual payment</h2>
              <p class="muted small">Confirm only after the money has actually been received. This records your admin account and the time.</p>
              <button
                type="button"
                class="button button--primary button--block"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Confirm that payment has been received?")) return;
                  void run(() => adminSend(`/orders/${id}/confirm-payment`, "POST", { note: "Confirmed in admin" }), "Payment confirmed.");
                }}
              >
                Confirm payment received
              </button>
            </section>
          )}

          <section class="card">
            <h2>Shipment</h2>
            <p class="muted small">Manually record the carrier and tracking details. No logistics SaaS is used.</p>
            <Field label="Carrier">
              <input value={carrier} onInput={(event) => setCarrier((event.target as HTMLInputElement).value)} placeholder="e.g. UPS" />
            </Field>
            <Field label="Tracking number">
              <input value={trackingNumber} onInput={(event) => setTrackingNumber((event.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Tracking URL" hint="Must start with http:// or https://">
              <input value={trackingUrl} onInput={(event) => setTrackingUrl((event.target as HTMLInputElement).value)} />
            </Field>
            <button
              type="button"
              class="button button--block"
              disabled={busy}
              onClick={() => void run(
                () => adminSend(`/orders/${id}/shipping`, "POST", { carrier, trackingNumber, trackingUrl }),
                "Shipment details saved.",
              )}
            >
              Save shipment details
            </button>
          </section>

          <section class="card">
            <h2>Customer</h2>
            <p>{shipping?.name ?? order.email}</p>
            <p class="muted small">{order.email}{order.phone ? <><br />{order.phone}</> : null}</p>
            {shipping && (
              <address class="address">
                {shipping.line1}<br />
                {shipping.line2 ? <>{shipping.line2}<br /></> : null}
                {shipping.city}{shipping.state ? `, ${shipping.state}` : ""} {shipping.postal_code}<br />
                {shipping.country}
              </address>
            )}
          </section>

          <section class="card">
            <h2>Payment</h2>
            <p class="muted small">Method: {enumLabel(order.payment_method ?? "—")}<br />Shipping: {order.shipping_method ?? "—"}</p>
            <ul class="plain-list">
              {transactions.map((transaction) => (
                <li key={transaction.id}>
                  <StatusBadge status={transaction.status} />
                  <span>{transaction.plugin_id}</span>
                  <Money cents={transaction.amount_cents} currency={transaction.currency} />
                  <span class="muted small">{formatDate(transaction.created_at)}</span>
                </li>
              ))}
              {transactions.length === 0 && <li class="muted">No transactions recorded.</li>}
            </ul>
            {canRefund && (
              <button type="button" class="button button--block" style="margin-top:12px" onClick={() => setRefundOpen(true)}>
                {onlineRefund ? "Refund payment" : "Record refund"}
              </button>
            )}
          </section>

          <section class="card">
            <div class="card-header">
              <h2>Returns</h2>
              {items.some((item) => item.quantity > (returnedByItem.get(item.id) ?? 0)) && (
                <button type="button" class="button button--small" onClick={() => setReturnOpen(true)}>Record return</button>
              )}
            </div>
            {returns.error && <p class="error-text">{returns.error}</p>}
            {(returns.data ?? []).length === 0 ? (
              <p class="muted small">No returns recorded.</p>
            ) : (
              <ul class="plain-list">
                {(returns.data ?? []).map((entry) => (
                  <li key={entry.return.id}>
                    <div>
                      <strong>{formatDate(entry.return.created_at)}</strong>
                      <span class="muted small"> · {entry.return.restock ? "Restocked" : "Not restocked"}</span>
                    </div>
                    <div class="muted small">
                      {entry.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}
                    </div>
                    {entry.return.reason && <div class="muted small">{entry.return.reason}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {refundOpen && (
        <Modal title={onlineRefund ? "Refund payment" : "Record a refund"} onClose={() => setRefundOpen(false)}>
          <p class="muted">
            {onlineRefund
              ? <>This sends a refund through <strong>{providerName}</strong>. The payment provider moves the money back to the customer.</>
              : "This records an offline refund in CloudCart. It does not move money at a payment provider."}
          </p>
          <Field label={`Amount (${order.currency})`}>
            <input inputMode="decimal" value={refundAmount} onInput={(event) => setRefundAmount((event.target as HTMLInputElement).value)} />
          </Field>
          <div class="modal-actions">
            <button type="button" class="button" onClick={() => setRefundOpen(false)}>Cancel</button>
            <button
              type="button"
              class="button button--danger"
              disabled={busy || !refundAmount}
              onClick={() => run(
                () => adminSend(`/orders/${id}/refund`, "POST", { amount: refundAmount }),
                onlineRefund ? "Refund sent to the payment provider." : "Refund recorded.",
              ).then(() => setRefundOpen(false))}
            >
              {onlineRefund ? "Refund payment" : "Record refund"}
            </button>
          </div>
        </Modal>
      )}

      {returnOpen && (
        <Modal title="Record return" onClose={() => setReturnOpen(false)}>
          <p class="muted">Enter the quantity received for each item. Restocking is optional.</p>
          <div class="stack">
            {items.map((item) => {
              const remaining = item.quantity - (returnedByItem.get(item.id) ?? 0);
              if (remaining <= 0) return null;
              return (
                <label class="field" key={item.id}>
                  <span class="field-label">{item.name} <span class="muted small">({remaining} available)</span></span>
                  <input
                    type="number"
                    min={0}
                    max={remaining}
                    placeholder="0"
                    value={returnQuantities[item.id] ?? ""}
                    onInput={(event) => {
                      const value = (event.target as HTMLInputElement).value;
                      setReturnQuantities({ ...returnQuantities, [item.id]: value });
                    }}
                  />
                </label>
              );
            })}
          </div>
          <label class="checkbox">
            <input type="checkbox" checked={returnRestock} onChange={(event) => setReturnRestock((event.target as HTMLInputElement).checked)} />
            Restock returned items
          </label>
          <Field label="Return reason">
            <input value={returnReason} maxLength={500} onInput={(event) => setReturnReason((event.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Internal note">
            <textarea rows={3} value={returnNote} maxLength={5000} onInput={(event) => setReturnNote((event.target as HTMLTextAreaElement).value)} />
          </Field>
          <div class="modal-actions">
            <button type="button" class="button" onClick={() => setReturnOpen(false)}>Cancel</button>
            <button type="button" class="button button--primary" disabled={busy} onClick={() => void recordReturn()}>
              Record return
            </button>
          </div>
        </Modal>
      )}
      <button type="button" class="button button--ghost" onClick={() => navigate("/orders")}>← Back to orders</button>
    </div>
  );
}
