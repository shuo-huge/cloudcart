import { formatMoney, moneyToInput, parseMoneyInput } from "@cloudcart/shared";
import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Field, Loading, Modal, toast, useAsync } from "../components";
import type { ShippingZone } from "../types";

interface ZoneForm {
  name: string;
  countries: string;
  isDefault: boolean;
}

interface RateForm {
  zoneId: string;
  name: string;
  price: string;
  freeOver: string;
  minOrder: string;
}

export function ShippingPage() {
  const zones = useAsync(() => adminGet<ShippingZone[]>("/shipping"));
  const [zoneForm, setZoneForm] = useState<ZoneForm | null>(null);
  const [rateForm, setRateForm] = useState<RateForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRate, setEditingRate] = useState<string | null>(null);

  if (zones.loading && !zones.data) return <Loading />;
  if (zones.error) return <ErrorBox message={zones.error} onRetry={zones.reload} />;

  async function saveZone(event: Event) {
    event.preventDefault();
    if (!zoneForm) return;
    setSaving(true);
    try {
      await adminSend("/shipping/zones", "POST", {
        name: zoneForm.name,
        countries: zoneForm.countries.split(",").map((code) => code.trim().toUpperCase()).filter(Boolean),
        isDefault: zoneForm.isDefault,
      });
      toast("Shipping zone added.");
      setZoneForm(null);
      zones.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveRate(event: Event) {
    event.preventDefault();
    if (!rateForm) return;
    setSaving(true);
    try {
      const body = {
        zoneId: rateForm.zoneId,
        name: rateForm.name,
        price: rateForm.price,
        minOrder: rateForm.minOrder || "0",
        maxOrder: null,
        freeOver: rateForm.freeOver || null,
        isActive: true,
        position: 0,
      };
      if (editingRate) await adminSend(`/shipping/rates/${editingRate}`, "PUT", body);
      else await adminSend("/shipping/rates", "POST", body);
      toast("Shipping rate saved.");
      setRateForm(null);
      setEditingRate(null);
      zones.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeZone(zone: ShippingZone) {
    if (!window.confirm(`Delete zone “${zone.name}” and its rates?`)) return;
    try {
      await adminSend(`/shipping/zones/${zone.id}`, "DELETE");
      toast("Zone deleted.");
      zones.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  }

  async function removeRate(rateId: string) {
    if (!window.confirm("Delete this shipping rate?")) return;
    try {
      await adminSend(`/shipping/rates/${rateId}`, "DELETE");
      toast("Rate deleted.");
      zones.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Shipping</h1>
          <p class="muted">Zones match destination countries; the default zone catches everything else.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="button" onClick={() => setZoneForm({ name: "", countries: "", isDefault: false })}>New zone</button>
          <button type="button" class="button button--primary" disabled={!zones.data?.length} onClick={() => setRateForm({ zoneId: zones.data?.[0]?.id ?? "", name: "Standard", price: "0.00", freeOver: "", minOrder: "0" })}>New rate</button>
        </div>
      </header>

      {(zones.data ?? []).length === 0 && <section class="card"><div class="empty-state"><h3>No shipping zones</h3><p>Create a zone to offer shipping.</p></div></section>}

      {(zones.data ?? []).map((zone) => (
        <section class="card" key={zone.id}>
          <header class="card-header">
            <h2>{zone.name} {zone.is_default ? <span class="badge badge--neutral">Default</span> : ""}</h2>
            <div class="row-actions">
              <button type="button" class="link-button" onClick={() => setRateForm({ zoneId: zone.id, name: "Standard", price: "0.00", freeOver: "", minOrder: "0" })}>Add rate</button>
              <button type="button" class="link-button link-button--danger" onClick={() => removeZone(zone)}>Delete zone</button>
            </div>
          </header>
          <p class="muted small">Countries: {(() => {
            try {
              const countries = JSON.parse(zone.countries_json) as string[];
              return countries.length > 0 ? countries.join(", ") : "All other countries";
            } catch {
              return "—";
            }
          })()}</p>
          <DataTable
            rows={zone.rates}
            empty="No rates in this zone."
            columns={[
              { key: "name", label: "Rate", render: (rate) => rate.name },
              { key: "price", label: "Price", render: (rate) => formatMoney(rate.price_cents, "USD") },
              { key: "min", label: "Minimum order", render: (rate) => rate.min_order_cents > 0 ? formatMoney(rate.min_order_cents, "USD") : <span class="muted">—</span> },
              { key: "free", label: "Free over", render: (rate) => rate.free_over_cents !== null ? formatMoney(rate.free_over_cents, "USD") : <span class="muted">—</span> },
              {
                key: "actions",
                label: "",
                render: (rate) => (
                  <div class="row-actions">
                    <button type="button" class="link-button" onClick={() => {
                      setEditingRate(rate.id);
                      setRateForm({
                        zoneId: zone.id,
                        name: rate.name,
                        price: moneyToInput(rate.price_cents, "USD"),
                        freeOver: rate.free_over_cents !== null ? moneyToInput(rate.free_over_cents, "USD") : "",
                        minOrder: moneyToInput(rate.min_order_cents, "USD"),
                      });
                    }}>Edit</button>
                    <button type="button" class="link-button link-button--danger" onClick={() => removeRate(rate.id)}>Delete</button>
                  </div>
                ),
              },
            ]}
          />
        </section>
      ))}

      {zoneForm && (
        <Modal title="New shipping zone" onClose={() => setZoneForm(null)}>
          <form class="stack" onSubmit={saveZone}>
            <Field label="Zone name">
              <input required value={zoneForm.name} onInput={(event) => setZoneForm({ ...zoneForm, name: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Countries" hint="Comma-separated ISO codes, e.g. US, CA, GB. Leave empty for the default zone.">
              <input value={zoneForm.countries} onInput={(event) => setZoneForm({ ...zoneForm, countries: (event.target as HTMLInputElement).value })} />
            </Field>
            <label class="checkbox"><input type="checkbox" checked={zoneForm.isDefault} onChange={(event) => setZoneForm({ ...zoneForm, isDefault: (event.target as HTMLInputElement).checked })} /> Default zone (fallback)</label>
            <div class="modal-actions">
              <button type="button" class="button" onClick={() => setZoneForm(null)}>Cancel</button>
              <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Create zone"}</button>
            </div>
          </form>
        </Modal>
      )}

      {rateForm && (
        <Modal title={editingRate ? "Edit shipping rate" : "New shipping rate"} onClose={() => { setRateForm(null); setEditingRate(null); }}>
          <form class="stack" onSubmit={saveRate}>
            <Field label="Zone">
              <select value={rateForm.zoneId} onChange={(event) => setRateForm({ ...rateForm, zoneId: (event.target as HTMLSelectElement).value })}>
                {(zones.data ?? []).map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
            </Field>
            <Field label="Rate name">
              <input required value={rateForm.name} onInput={(event) => setRateForm({ ...rateForm, name: (event.target as HTMLInputElement).value })} />
            </Field>
            <div class="form-grid">
              <Field label="Price">
                <input inputMode="decimal" value={rateForm.price} onInput={(event) => setRateForm({ ...rateForm, price: (event.target as HTMLInputElement).value })} />
              </Field>
              <Field label="Minimum order">
                <input inputMode="decimal" value={rateForm.minOrder} onInput={(event) => setRateForm({ ...rateForm, minOrder: (event.target as HTMLInputElement).value })} />
              </Field>
              <Field label="Free over" hint="Leave blank to disable free shipping.">
                <input inputMode="decimal" value={rateForm.freeOver} onInput={(event) => setRateForm({ ...rateForm, freeOver: (event.target as HTMLInputElement).value })} />
              </Field>
            </div>
            <div class="modal-actions">
              <button type="button" class="button" onClick={() => { setRateForm(null); setEditingRate(null); }}>Cancel</button>
              <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save rate"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
