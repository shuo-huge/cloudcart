import { formatDate } from "@cloudcart/shared";
import { adminGet } from "../api";
import { DataTable, ErrorBox, Loading, Money, StatusBadge, useAsync } from "../components";
import { linkProps } from "../router";
import type { Order } from "../types";

interface DashboardData {
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
  salesTotalCents: number;
  currency: string;
  productCount: number;
  customerCount: number;
  recentOrders: Array<Order & { customer_name: string | null }>;
  topProducts: Array<{ product_id: string; name: string; quantity: number; revenue_cents: number }>;
}

export function DashboardPage() {
  const { data, loading, error, reload } = useAsync(() => adminGet<DashboardData>("/dashboard"));

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p class="muted">A live view of orders, revenue and inventory.</p>
        </div>
        <a class="button button--primary" {...linkProps("/products/new")}>Add product</a>
      </header>

      <section class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">Total orders</span>
          <strong class="stat-value">{data.totalOrders}</strong>
          <span class="stat-foot">{data.pendingOrders} need attention</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Paid orders</span>
          <strong class="stat-value">{data.paidOrders}</strong>
          <span class="stat-foot">Confirmed payments</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Sales</span>
          <strong class="stat-value"><Money cents={data.salesTotalCents} currency={data.currency} /></strong>
          <span class="stat-foot">Paid orders, net of refunds</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Catalog</span>
          <strong class="stat-value">{data.productCount}</strong>
          <span class="stat-foot">{data.customerCount} customers</span>
        </div>
      </section>

      <div class="grid-2">
        <section class="card">
          <header class="card-header">
            <h2>Recent orders</h2>
            <a class="text-link" {...linkProps("/orders")}>View all</a>
          </header>
          <DataTable
            rows={data.recentOrders}
            empty="No orders yet. Share your store to get the first one."
            columns={[
              {
                key: "order",
                label: "Order",
                render: (order) => <a class="text-link" {...linkProps(`/orders/${order.id}`)}>{order.order_number}</a>,
              },
              { key: "customer", label: "Customer", render: (order) => order.customer_name ?? order.email },
              { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
              { key: "total", label: "Total", render: (order) => <Money cents={order.total_cents} currency={order.currency} /> },
              { key: "date", label: "Date", render: (order) => formatDate(order.created_at) },
            ]}
          />
        </section>
        <section class="card">
          <header class="card-header">
            <h2>Top products</h2>
          </header>
          {data.topProducts.length === 0 ? (
            <div class="empty-state"><h3>No sales yet</h3><p>Top sellers appear after paid orders.</p></div>
          ) : (
            <ul class="ranked-list">
              {data.topProducts.map((product, index) => (
                <li key={`${product.product_id}-${index}`} class="ranked-row">
                  <span class="rank">{index + 1}</span>
                  <span class="ranked-name">{product.name}</span>
                  <span class="muted">{product.quantity} sold</span>
                  <strong><Money cents={product.revenue_cents} currency={data.currency} /></strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
