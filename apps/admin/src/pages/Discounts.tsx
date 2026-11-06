import { currencyDivisor, formatMoney, parseMoneyInput } from "@cloudcart/shared";
import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Field, Loading, Modal, StatusBadge, toast, useAsync } from "../components";
import type { Coupon } from "../types";

interface DiscountForm {
  id?: string;
  code: string;
  type: "fixed" | "percent";
  value: string;
  minSubtotal: string;
  maxUses: string;
  startsAt: string;
  endsAt: string;
  appliesTo: "all" | "products" | "categories";
  status: "active" | "disabled";
}

const EMPTY: DiscountForm = {
  code: "", type: "percent", value: "10", minSubtotal: "0",
  maxUses: "", startsAt: "", endsAt: "", appliesTo: "all", status: "active",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DiscountsPage() {
  const coupons = useAsync(() => adminGet<Coupon[]>("/coupons"));
  const settings = useAsync(() => adminGet<{ settings: Record<string, string> }>("/settings"));
  const [form, setForm] = useState<DiscountForm | null>(null);
  const [saving, setSaving] = useState(false);
  const currency = settings.data?.settings["store.currency"] ?? "USD";
  const divisor = currencyDivisor(currency);

  function edit(coupon: Coupon) {
    setForm({
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.type === "fixed" ? String(coupon.value / divisor) : String(coupon.value),
      minSubtotal: String(coupon.min_subtotal_cents / divisor),
      maxUses: coupon.max_uses ? String(coupon.max_uses) : "",
      startsAt: toLocalInput(coupon.starts_at),
      endsAt: toLocalInput(coupon.ends_at),
      appliesTo: coupon.applies_to as DiscountForm["appliesTo"],
      status: coupon.status as DiscountForm["status"],
    });
  }

  async function save(event: Event) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      let value: number;
      if (form.type === "percent") {
        value = Math.trunc(Number(form.value));
        if (!Number.isFinite(value) || value < 1 || value > 100) throw new Error("Percentage must be between 1 and 100.");
      } else {
        value = parseMoneyInput(form.value, currency);
        if (value <= 0) throw new Error("Discount amount must be greater than zero.");
      }
      const body = {
        code: form.code,
        type: form.type,
        value,
        minSubtotal: form.minSubtotal || "0",
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        appliesTo: form.appliesTo,
        status: form.status,
        productIds: [],
        categoryIds: [],
      };
      if (form.id) await adminSend(`/coupons/${form.id}`, "PUT", body);
      else await adminSend("/coupons", "POST", body);
      toast("Discount saved.");
      setForm(null);
      coupons.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(coupon: Coupon) {
    if (!window.confirm(`Delete discount ${coupon.code}?`)) return;
    try {
      await adminSend(`/coupons/${coupon.id}`, "DELETE");
      toast("Discount deleted.");
      coupons.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  }

  if (coupons.loading && !coupons.data) return <Loading />;
  if (coupons.error) return <ErrorBox message={coupons.error} onRetry={coupons.reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Discounts</h1>
          <p class="muted">Percentage or fixed-amount coupons, validated on the server at checkout.</p>
        </div>
        <button type="button" class="button button--primary" onClick={() => setForm({ ...EMPTY })}>New discount</button>
      </header>
      <section class="card">
        <DataTable
          rows={coupons.data ?? []}
          empty="No discounts yet."
          columns={[
            { key: "code", label: "Code", render: (coupon) => <button type="button" class="link-button" onClick={() => edit(coupon)}>{coupon.code}</button> },
            {
              key: "value",
              label: "Discount",
              render: (coupon) => coupon.type === "percent"
                ? `${coupon.value}%`
                : formatMoney(coupon.value, currency),
            },
            { key: "min", label: "Minimum", render: (coupon) => coupon.min_subtotal_cents > 0 ? formatMoney(coupon.min_subtotal_cents, currency) : <span class="muted">None</span> },
            { key: "uses", label: "Uses", render: (coupon) => coupon.max_uses ? `${coupon.used_count} / ${coupon.max_uses}` : `${coupon.used_count}` },
            { key: "scope", label: "Scope", render: (coupon) => coupon.applies_to },
            { key: "status", label: "Status", render: (coupon) => <StatusBadge status={coupon.status} /> },
            { key: "actions", label: "", render: (coupon) => <button type="button" class="link-button link-button--danger" onClick={() => remove(coupon)}>Delete</button> },
          ]}
        />
      </section>

      {form && (
        <Modal title={form.id ? "Edit discount" : "New discount"} onClose={() => setForm(null)}>
          <form class="stack" onSubmit={save}>
            <Field label="Code">
              <input required value={form.code} maxLength={60} onInput={(event) => setForm({ ...form, code: (event.target as HTMLInputElement).value.toUpperCase() })} />
            </Field>
            <div class="form-grid">
              <Field label="Type">
                <select value={form.type} onChange={(event) => setForm({ ...form, type: (event.target as HTMLSelectElement).value as DiscountForm["type"] })}>
                  <option value="percent">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </Field>
              <Field label={form.type === "percent" ? "Percent off" : `Amount off (${currency})`}>
                <input required inputMode="decimal" value={form.value} onInput={(event) => setForm({ ...form, value: (event.target as HTMLInputElement).value })} />
              </Field>
              <Field label={`Minimum subtotal (${currency})`}>
                <input inputMode="decimal" value={form.minSubtotal} onInput={(event) => setForm({ ...form, minSubtotal: (event.target as HTMLInputElement).value })} />
              </Field>
              <Field label="Maximum uses" hint="Leave blank for unlimited.">
                <input type="number" min={1} value={form.maxUses} onInput={(event) => setForm({ ...form, maxUses: (event.target as HTMLInputElement).value })} />
              </Field>
              <Field label="Starts at">
                <input type="datetime-local" value={form.startsAt} onInput={(event) => setForm({ ...form, startsAt: (event.target as HTMLInputElement).value })} />
              </Field>
              <Field label="Ends at">
                <input type="datetime-local" value={form.endsAt} onInput={(event) => setForm({ ...form, endsAt: (event.target as HTMLInputElement).value })} />
              </Field>
              <Field label="Applies to">
                <select value={form.appliesTo} onChange={(event) => setForm({ ...form, appliesTo: (event.target as HTMLSelectElement).value as DiscountForm["appliesTo"] })}>
                  <option value="all">All products</option>
                  <option value="products">Selected products</option>
                  <option value="categories">Selected categories</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => setForm({ ...form, status: (event.target as HTMLSelectElement).value as DiscountForm["status"] })}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
            </div>
            <div class="modal-actions">
              <button type="button" class="button" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save discount"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
