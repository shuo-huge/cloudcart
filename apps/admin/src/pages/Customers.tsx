import { formatDate } from "@cloudcart/shared";
import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import {
  DataTable,
  ErrorBox,
  Loading,
  Money,
  Pagination,
  StatusBadge,
  toast,
  useAsync,
} from "../components";
import { linkProps } from "../router";
import type { Customer, Order } from "../types";

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(
    () => adminGet<{ items: Customer[]; total: number }>(`/customers?page=${page}&perPage=20&q=${encodeURIComponent(search)}`),
    [page, search],
  );

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Customers</h1>
          <p class="muted">Guest checkout customers are created automatically with each order.</p>
        </div>
      </header>
      <section class="card">
        <div class="toolbar">
          <input type="search" placeholder="Search by name or email" value={search} onInput={(event) => { setSearch((event.target as HTMLInputElement).value); setPage(1); }} />
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? <Loading /> : (
          <>
            <DataTable
              rows={data?.items ?? []}
              empty="No customers yet."
              columns={[
                { key: "name", label: "Customer", render: (customer) => <a class="text-link" {...linkProps(`/customers/${customer.id}`)}>{customer.name || customer.email}</a> },
                { key: "email", label: "Email", render: (customer) => customer.email },
                { key: "orders", label: "Orders", render: (customer) => customer.orders_count },
                { key: "spent", label: "Spent", render: (customer) => <Money cents={customer.total_spent_cents} currency="USD" /> },
                { key: "joined", label: "Joined", render: (customer) => formatDate(customer.created_at) },
              ]}
            />
            <Pagination page={page} perPage={20} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

interface CustomerDetail {
  customer: Customer;
  orders: Order[];
  addresses: Array<{ id: string; line1: string; city: string; postal_code: string; country: string }>;
}

export function CustomerDetailPage({ id }: { id: string }) {
  const { data, loading, error, reload } = useAsync(() => adminGet<CustomerDetail>(`/customers/${id}`), [id]);
  const [notes, setNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  async function saveNotes(event: Event) {
    event.preventDefault();
    if (!data) return;
    setSaving(true);
    try {
      await adminSend(`/customers/${id}/notes`, "PUT", { notes: notes ?? "" });
      toast("Customer notes saved.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <p class="breadcrumb"><a {...linkProps("/customers")}>Customers</a> / {data.customer.name}</p>
          <h1>{data.customer.name || data.customer.email}</h1>
          <p class="muted">{data.customer.email}{data.customer.phone ? ` · ${data.customer.phone}` : ""}</p>
        </div>
      </header>
      <div class="grid-2">
        <section class="card">
          <h2>Order history</h2>
          <DataTable
            rows={data.orders}
            empty="No orders for this customer."
            columns={[
              { key: "order", label: "Order", render: (order) => <a class="text-link" {...linkProps(`/orders/${order.id}`)}>{order.order_number}</a> },
              { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
              { key: "total", label: "Total", render: (order) => <Money cents={order.total_cents} currency={order.currency} /> },
              { key: "date", label: "Date", render: (order) => formatDate(order.created_at) },
            ]}
          />
        </section>
        <div class="stack">
          <section class="card">
            <h2>Stats</h2>
            <p>Orders: {data.customer.orders_count}</p>
            <p>Lifetime spend: <Money cents={data.customer.total_spent_cents} currency={data.orders[0]?.currency ?? "USD"} /></p>
            <p>Joined: {formatDate(data.customer.created_at)}</p>
          </section>
          <section class="card">
            <h2>Addresses</h2>
            {data.addresses.length === 0 ? <p class="muted">No saved addresses.</p> : (
              <ul class="plain-list">
                {data.addresses.map((address) => (
                  <li key={address.id}>{address.line1}, {address.city} {address.postal_code}, {address.country}</li>
                ))}
              </ul>
            )}
          </section>
          <section class="card">
            <h2>Notes</h2>
            <form class="stack" onSubmit={saveNotes}>
              <textarea
                rows={5}
                value={notes ?? data.customer.notes}
                onInput={(event) => setNotes((event.target as HTMLTextAreaElement).value)}
              />
              <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save notes"}</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
