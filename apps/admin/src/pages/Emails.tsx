import { formatDate } from "@cloudcart/shared";
import { useEffect, useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Field, Loading, StatusBadge, toast, useAsync } from "../components";

const PLUGIN_ID = "email-notifications";

interface PluginRow {
  id: string;
  name: string;
  enabled: number;
  bundled: boolean;
}

interface PluginSettings {
  [key: string]: string;
}

interface EmailRow {
  id: string;
  event: string;
  order_id: string | null;
  order_number: string | null;
  recipient: string;
  recipient_role: string;
  subject: string;
  status: string;
  attempts: number;
  max_attempts: number;
  provider: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

interface EmailData {
  items: EmailRow[];
  total: number;
  summary: Record<string, number>;
  enabled: boolean;
}

const PAGE_SIZE = 20;

export function EmailsPage() {
  const emails = useAsync(() => adminGet<EmailData>(`/emails?page=1&perPage=${PAGE_SIZE}&status=all`));
  const plugins = useAsync(() => adminGet<PluginRow[]>("/plugins"));
  const settings = useAsync(() => adminGet<PluginSettings>(`/plugins/${PLUGIN_ID}/settings`));
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);

  const plugin = (plugins.data ?? []).find((row) => row.id === PLUGIN_ID);
  const enabled = plugin?.enabled === 1;

  useEffect(() => {
    if (!settings.data) return;
    setValues({
      backend: settings.data.backend || "resend",
      from: settings.data.from || "",
      fromName: settings.data.fromName || "",
      replyTo: settings.data.replyTo || "",
      notifyAdmin: settings.data.notifyAdmin === "0" ? "0" : "1",
      resendApiKey: settings.data.resendApiKey || "",
    });
  }, [settings.data]);

  async function save(event: Event) {
    event.preventDefault();
    setSaving(true);
    try {
      await adminSend(`/plugins/${PLUGIN_ID}/settings`, "PUT", {
        settings: values,
        secretKeys: ["resendApiKey"],
      });
      toast("Email settings saved.");
      settings.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    setWorking(true);
    try {
      await adminSend(`/plugins/${PLUGIN_ID}/${enabled ? "disable" : "enable"}`, "POST", {});
      toast(enabled ? "Email notifications disabled." : "Email notifications enabled.");
      plugins.reload();
      emails.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change the plugin state.", "error");
    } finally {
      setWorking(false);
    }
  }

  async function sendTest(): Promise<void> {
    if (!testTo) return;
    setTestingEmail(true);
    try {
      await adminSend("/plugins/email-notifications/test", "POST", { to: testTo });
      toast("Test email sent.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Test email failed.", "error");
    } finally {
      setTestingEmail(false);
    }
  }

  async function dispatch() {
    setWorking(true);
    try {
      const result = await adminSend<{ sent: number; failed: number; skipped?: boolean }>("/emails/dispatch", "POST", {});
      toast(result.skipped ? "Email notifications are disabled." : `Queue processed: ${result.sent} sent, ${result.failed} failed.`);
      emails.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not process the queue.", "error");
    } finally {
      setWorking(false);
    }
  }

  async function retryFailed() {
    setWorking(true);
    try {
      const result = await adminSend<{ retried: number; sent: number; failed: number; skipped?: boolean }>("/emails/retry", "POST", {});
      toast(result.skipped
        ? `Reset ${result.retried} failed email(s); email notifications are disabled.`
        : `Retried ${result.retried}, sent ${result.sent}, still failing ${result.failed}.`);
      emails.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not retry failed emails.", "error");
    } finally {
      setWorking(false);
    }
  }

  if (plugins.loading && !plugins.data) return <Loading />;
  if (plugins.error) return <ErrorBox message={plugins.error} onRetry={plugins.reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Email notifications</h1>
          <p class="muted">Send order emails through Resend or Cloudflare Email Workers.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="button" onClick={() => void dispatch()} disabled={working || !enabled}>Process queue</button>
          <button type="button" class="button" onClick={() => void retryFailed()} disabled={working || !enabled}>Retry failed</button>
          <button type="button" class={`button ${enabled ? "button--danger" : "button--primary"}`} onClick={() => void toggle()} disabled={working}>
            {enabled ? "Disable email notifications" : "Enable email notifications"}
          </button>
        </div>
      </header>

      {!enabled && (
        <div class="notice notice--warning">
          Disabled by default. Enable the plugin and configure a sending channel to start sending order emails.
        </div>
      )}

      <div class="grid-2">
        <section class="card">
          <h2>Settings</h2>
          <form class="stack" onSubmit={save}>
            <Field label="Backend" hint="Resend uses an API key. Cloudflare requires the EMAIL send_email binding in wrangler.jsonc.">
              <select value={values.backend ?? "resend"} onChange={(event) => setValues({ ...values, backend: (event.target as HTMLSelectElement).value })}>
                <option value="resend">Resend</option>
                <option value="cloudflare">Cloudflare Email Workers</option>
              </select>
            </Field>
            <Field label="From address">
              <input type="email" required value={values.from ?? ""} onInput={(event) => setValues({ ...values, from: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="From name">
              <input value={values.fromName ?? ""} onInput={(event) => setValues({ ...values, fromName: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Reply-to address">
              <input type="email" value={values.replyTo ?? ""} onInput={(event) => setValues({ ...values, replyTo: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Resend API key" hint="Stored encrypted. Leave the masked value unchanged to keep the current key.">
              <input type="password" value={values.resendApiKey ?? ""} onInput={(event) => setValues({ ...values, resendApiKey: (event.target as HTMLInputElement).value })} />
            </Field>
            <label class="checkbox-row">
              <input
                type="checkbox"
                checked={values.notifyAdmin !== "0"}
                onChange={(event) => setValues({ ...values, notifyAdmin: (event.target as HTMLInputElement).checked ? "1" : "0" })}
              />
              <span>Send a copy to the support email</span>
            </label>
            <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save email settings"}</button>
            <div class="settings-subcard">
              <h3>Test delivery</h3>
              <p class="muted small">Save the settings first, then send a real test message.</p>
              <Field label="Test recipient">
                <input type="email" value={testTo} onInput={(event) => setTestTo((event.target as HTMLInputElement).value)} placeholder="you@example.com" />
              </Field>
              <button type="button" class="button" disabled={testingEmail || !enabled || !testTo} onClick={() => void sendTest()}>
                {testingEmail ? "Sending…" : "Send test email"}
              </button>
            </div>
          </form>
        </section>

        <section class="card">
          <h2>Outbox summary</h2>
          <dl class="totals">
            <div><dt>Queued</dt><dd>{emails.data?.summary.pending ?? 0}</dd></div>
            <div><dt>Sending</dt><dd>{emails.data?.summary.sending ?? 0}</dd></div>
            <div><dt>Sent</dt><dd>{emails.data?.summary.sent ?? 0}</dd></div>
            <div><dt>Failed</dt><dd>{emails.data?.summary.failed ?? 0}</dd></div>
          </dl>
          <p class="muted small">
            A cron trigger runs every 5 minutes and retries due messages. Process queue can also drain the outbox immediately.
          </p>
        </section>
      </div>

      <section class="card">
        <h2>Outbox</h2>
        <DataTable
          rows={emails.data?.items ?? []}
          empty="No emails queued yet."
          columns={[
            { key: "recipient", label: "Recipient", render: (row) => <>{row.recipient}<div class="muted small">{row.recipient_role === "store" ? "Store copy" : "Customer"}</div></> },
            { key: "subject", label: "Subject", render: (row) => <>{row.subject}<div class="muted small">{row.order_number ?? "—"} · {row.event}</div></> },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
            { key: "attempts", label: "Attempts", render: (row) => `${row.attempts} / ${row.max_attempts}` },
            { key: "error", label: "Last error", render: (row) => row.last_error ? <span class="muted small">{row.last_error}</span> : "—" },
            { key: "created", label: "Queued", render: (row) => formatDate(row.created_at) },
            { key: "sent", label: "Sent", render: (row) => row.sent_at ? formatDate(row.sent_at) : "—" },
          ]}
        />
      </section>
    </div>
  );
}
