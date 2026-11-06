import { formatDate } from "@cloudcart/shared";
import { useEffect, useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Field, Loading, toast, useAsync } from "../components";
import { FREE_TIER_NOTE } from "../constants";

interface SettingsData {
  settings: Record<string, string>;
  store: { name: string; currency: string; locale: string; email: string; phone: string; address: string; logo: string | null };
}

interface UsageData {
  localEstimate: { day: string; api_requests: number; d1_reads: number; d1_writes: number; r2_class_a: number; r2_class_b: number };
  storage: { mediaBytes: number; mediaCount: number; productCount: number; orderCount: number };
  notice: string;
}

interface AuditData {
  items: Array<{ id: string; action: string; entity_type: string | null; entity_id: string | null; created_at: string; admin_email: string | null }>;
  total: number;
}

interface SubscriberData {
  items: Array<{ id: string; email: string; source: string | null; created_at: string }>;
  total: number;
}

const FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: "store.name", label: "Store name" },
  { key: "store.currency", label: "Currency", hint: "ISO 4217 code, e.g. USD." },
  { key: "store.locale", label: "Locale", hint: "e.g. en-US" },
  { key: "store.email", label: "Support email" },
  { key: "store.phone", label: "Support phone" },
  { key: "store.address", label: "Business address" },
  { key: "store.logo", label: "Logo URL", hint: "Use a media URL such as /media/media/2026/..." },
  { key: "store.announcement", label: "Announcement bar" },
];

export function SettingsPage() {
  const settings = useAsync(() => adminGet<SettingsData>("/settings"));
  const usage = useAsync(() => adminGet<UsageData>("/usage"));
  const audit = useAsync(() => adminGet<AuditData>("/audit?page=1&perPage=20"));
  const subscribers = useAsync(() => adminGet<SubscriberData>("/newsletter?page=1&perPage=10"));
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (settings.data) {
      const initial: Record<string, string> = {};
      for (const field of FIELDS) initial[field.key] = settings.data.settings[field.key] ?? "";
      setValues(initial);
    }
  }, [settings.data]);

  async function save(event: Event) {
    event.preventDefault();
    setSaving(true);
    try {
      await adminSend("/settings", "PUT", { settings: values });
      toast("Store settings saved.");
      settings.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: Event) {
    event.preventDefault();
    setChangingPassword(true);
    try {
      await adminSend("/settings/password", "POST", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast("Password changed. Other sessions were signed out.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Password change failed.", "error");
    } finally {
      setChangingPassword(false);
    }
  }

  if (settings.loading && !settings.data) return <Loading />;
  if (settings.error) return <ErrorBox message={settings.error} onRetry={settings.reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Settings</h1>
          <p class="muted">Store identity, security and resource usage.</p>
        </div>
      </header>

      <section class="card">
        <h2>Store details</h2>
        <form class="stack" onSubmit={save}>
          <div class="form-grid">
            {FIELDS.map((field) => (
              <Field key={field.key} label={field.label} hint={field.hint}>
                <input
                  value={values[field.key] ?? ""}
                  onInput={(event) => setValues({ ...values, [field.key]: (event.target as HTMLInputElement).value })}
                />
              </Field>
            ))}
          </div>
          <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
        </form>
      </section>

      <div class="grid-2">
        <section class="card">
          <h2>Change password</h2>
          <form class="stack" onSubmit={changePassword}>
            <Field label="Current password">
              <input type="password" required value={currentPassword} onInput={(event) => setCurrentPassword((event.target as HTMLInputElement).value)} />
            </Field>
            <Field label="New password" hint="At least 8 characters, with a letter and a number.">
              <input type="password" required minLength={8} value={newPassword} onInput={(event) => setNewPassword((event.target as HTMLInputElement).value)} />
            </Field>
            <button type="submit" class="button" disabled={changingPassword}>{changingPassword ? "Changing…" : "Change password"}</button>
          </form>
        </section>

        <section class="card">
          <h2>Resource usage</h2>
          {usage.data ? (
            <>
              <dl class="totals">
                <div><dt>Media storage</dt><dd>{Math.round(usage.data.storage.mediaBytes / 1024)} KB</dd></div>
                <div><dt>Files</dt><dd>{usage.data.storage.mediaCount}</dd></div>
                <div><dt>Products / orders</dt><dd>{usage.data.storage.productCount} / {usage.data.storage.orderCount}</dd></div>
                <div><dt>Requests today (estimate)</dt><dd>{usage.data.localEstimate.api_requests}</dd></div>
                <div><dt>Image operations today</dt><dd>{usage.data.localEstimate.r2_class_a}</dd></div>
              </dl>
              <p class="muted small">{usage.data.notice}</p>
              {usage.data.storage.mediaBytes > 8 * 1024 * 1024 * 1024 && (
                <div class="notice notice--warning">
                  Image storage is above the local 80% safety threshold (8 GB of the 10 GB R2 free tier). Uploads are blocked.
                </div>
              )}
              {usage.data.localEstimate.api_requests > 80_000 && (
                <div class="notice notice--warning">
                  Estimated requests today exceed 80% of the 100,000/day Workers free tier. Cloudflare dashboard metrics are authoritative.
                </div>
              )}
              {usage.data.localEstimate.d1_writes > 80_000 && (
                <div class="notice notice--warning">
                  Estimated D1 writes approach the 100,000/day free tier limit.
                </div>
              )}
            </>
          ) : usage.error ? <ErrorBox message={usage.error} onRetry={usage.reload} /> : <Loading />}
          <p class="muted small">{FREE_TIER_NOTE}</p>
        </section>
      </div>

      <section class="card">
        <h2>Newsletter subscribers</h2>
        <DataTable
          rows={subscribers.data?.items ?? []}
          empty="No subscribers yet."
          columns={[
            { key: "email", label: "Email", render: (row) => row.email },
            { key: "source", label: "Source", render: (row) => row.source ?? "—" },
            { key: "date", label: "Joined", render: (row) => formatDate(row.created_at) },
          ]}
        />
      </section>

      <section class="card">
        <h2>Audit log</h2>
        <DataTable
          rows={audit.data?.items ?? []}
          empty="No administrative actions recorded."
          columns={[
            { key: "action", label: "Action", render: (row) => row.action },
            { key: "entity", label: "Entity", render: (row) => `${row.entity_type ?? "—"}${row.entity_id ? ` · ${row.entity_id}` : ""}` },
            { key: "admin", label: "Admin", render: (row) => row.admin_email ?? "—" },
            { key: "date", label: "When", render: (row) => formatDate(row.created_at) },
          ]}
        />
      </section>

      {usage.data && (
        <p class="muted small">
          Cloudflare-free limits are shared across your whole account. CloudCart never upgrades your plan automatically.
          Local estimate for {usage.data.localEstimate.day}: {usage.data.localEstimate.api_requests} requests,
          {" "}{usage.data.localEstimate.d1_writes} estimated D1 writes.
        </p>
      )}
    </div>
  );
}
