import { useEffect, useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { ErrorBox, Field, Loading, StatusBadge, toast, useAsync } from "../components";
import type { PluginRow } from "../types";

interface ManualSettings {
  method: "bank_transfer" | "cash_on_delivery" | "custom";
  instructions: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  swift: string;
  codInstructions: string;
}

const MANUAL_DEFAULTS: ManualSettings = {
  method: "bank_transfer",
  instructions: "Complete your bank transfer using the details below. Your order will be processed once payment is confirmed.",
  accountName: "",
  bankName: "",
  accountNumber: "",
  swift: "",
  codInstructions: "Pay in cash when your order is delivered.",
};

function maskConfigured(value: string | undefined): string {
  return value && value.startsWith("•") ? "••••••••" : (value ?? "");
}

export function PaymentsPage() {
  const plugins = useAsync(() => adminGet<PluginRow[]>("/plugins"));
  const manualSettings = useAsync(() => adminGet<Record<string, string>>("/plugins/manual/settings"));
  const stripeSettings = useAsync(() => adminGet<Record<string, string>>("/plugins/stripe/settings"));
  const paypalSettings = useAsync(() => adminGet<Record<string, string>>("/plugins/paypal/settings"));

  const [manual, setManual] = useState<ManualSettings>(MANUAL_DEFAULTS);
  const [manualSaving, setManualSaving] = useState(false);
  const [stripe, setStripe] = useState<Record<string, string>>({ mode: "sandbox", publishableKey: "", secretKey: "", webhookSecret: "" });
  const [stripeSaving, setStripeSaving] = useState(false);
  const [paypal, setPaypal] = useState<Record<string, string>>({ mode: "sandbox", clientId: "", clientSecret: "", webhookId: "" });
  const [paypalSaving, setPaypalSaving] = useState(false);

  useEffect(() => {
    if (manualSettings.data) {
      setManual({
        method: (manualSettings.data.method as ManualSettings["method"]) ?? MANUAL_DEFAULTS.method,
        instructions: manualSettings.data.instructions ?? MANUAL_DEFAULTS.instructions,
        accountName: manualSettings.data.accountName ?? "",
        bankName: manualSettings.data.bankName ?? "",
        accountNumber: manualSettings.data.accountNumber ?? "",
        swift: manualSettings.data.swift ?? "",
        codInstructions: manualSettings.data.codInstructions ?? MANUAL_DEFAULTS.codInstructions,
      });
    }
  }, [manualSettings.data]);

  useEffect(() => {
    if (stripeSettings.data) {
      setStripe({
        mode: stripeSettings.data.mode ?? "sandbox",
        publishableKey: stripeSettings.data.publishableKey ?? "",
        secretKey: "",
        webhookSecret: "",
      });
    }
  }, [stripeSettings.data]);

  useEffect(() => {
    if (paypalSettings.data) {
      setPaypal({
        mode: paypalSettings.data.mode ?? "sandbox",
        clientId: paypalSettings.data.clientId ?? "",
        clientSecret: "",
        webhookId: paypalSettings.data.webhookId ?? "",
      });
    }
  }, [paypalSettings.data]);

  const origin = window.location.origin;
  const plugin = (id: string) => plugins.data?.find((entry) => entry.id === id);

  async function toggle(pluginId: string, enabled: boolean): Promise<void> {
    try {
      await adminSend(`/plugins/${pluginId}/${enabled ? "disable" : "enable"}`, "POST", {});
      toast(`${plugin(pluginId)?.name ?? pluginId} ${enabled ? "disabled" : "enabled"}.`);
      plugins.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed.", "error");
    }
  }

  async function savePlugin(pluginId: string, values: Record<string, string>, secretKeys: string[], setSaving: (value: boolean) => void, reload: () => void): Promise<void> {
    setSaving(true);
    try {
      const settings: Record<string, string> = {};
      const providedSecrets: string[] = [];
      for (const [key, value] of Object.entries(values)) {
        if (secretKeys.includes(key)) {
          if (value && !value.startsWith("•")) {
            settings[key] = value;
            providedSecrets.push(key);
          }
        } else {
          settings[key] = value;
        }
      }
      await adminSend(`/plugins/${pluginId}/settings`, "PUT", { settings, secretKeys: providedSecrets });
      toast("Payment settings saved.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhookUrl(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${origin}${path}`);
      toast("Webhook URL copied.");
    } catch {
      toast("Could not copy the URL.", "error");
    }
  }

  if (plugins.loading && !plugins.data) return <Loading />;
  if (plugins.error) return <ErrorBox message={plugins.error} onRetry={plugins.reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Payments</h1>
          <p class="muted">Enable providers and store credentials encrypted with APP_MASTER_KEY. Saved secrets are never returned to this browser.</p>
        </div>
      </header>

      <section class="card">
        <header class="card-header">
          <h2>Manual payment {plugin("manual") ? <StatusBadge status={plugin("manual")!.enabled ? "active" : "disabled"} /> : null}</h2>
          {plugin("manual") && (
            <button type="button" class="button button--small" onClick={() => toggle("manual", Boolean(plugin("manual")!.enabled))}>
              {plugin("manual")!.enabled ? "Disable" : "Enable"}
            </button>
          )}
        </header>
        <p class="muted small">Orders remain <code>awaiting_manual_payment</code> until you confirm receipt in Orders.</p>
        {manualSettings.error && <ErrorBox message={manualSettings.error} onRetry={manualSettings.reload} />}
        <form class="stack" onSubmit={(event) => {
          event.preventDefault();
          const secret: string[] = [];
          void savePlugin("manual", { ...manual } as unknown as Record<string, string>, secret, setManualSaving, manualSettings.reload);
        }}>
          <Field label="Offline payment type">
            <select value={manual.method} onChange={(event) => setManual({ ...manual, method: (event.target as HTMLSelectElement).value as ManualSettings["method"] })}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash_on_delivery">Cash on delivery</option>
              <option value="custom">Custom instructions</option>
            </select>
          </Field>
          <Field label="Customer instructions">
            <textarea rows={3} value={manual.instructions} onInput={(event) => setManual({ ...manual, instructions: (event.target as HTMLTextAreaElement).value })} />
          </Field>
          {manual.method === "cash_on_delivery" && (
            <Field label="Cash on delivery instructions">
              <textarea rows={2} value={manual.codInstructions} onInput={(event) => setManual({ ...manual, codInstructions: (event.target as HTMLTextAreaElement).value })} />
            </Field>
          )}
          {manual.method === "bank_transfer" && (
            <div class="form-grid">
              <Field label="Account name"><input value={manual.accountName} onInput={(event) => setManual({ ...manual, accountName: (event.target as HTMLInputElement).value })} /></Field>
              <Field label="Bank name"><input value={manual.bankName} onInput={(event) => setManual({ ...manual, bankName: (event.target as HTMLInputElement).value })} /></Field>
              <Field label="Account number / IBAN"><input value={manual.accountNumber} onInput={(event) => setManual({ ...manual, accountNumber: (event.target as HTMLInputElement).value })} /></Field>
              <Field label="SWIFT / BIC"><input value={manual.swift} onInput={(event) => setManual({ ...manual, swift: (event.target as HTMLInputElement).value })} /></Field>
            </div>
          )}
          <button type="submit" class="button button--primary" disabled={manualSaving}>{manualSaving ? "Saving…" : "Save manual payment"}</button>
        </form>
      </section>

      <section class="card">
        <header class="card-header">
          <h2>Stripe {plugin("stripe") ? <StatusBadge status={plugin("stripe")!.enabled ? "active" : "disabled"} /> : null}</h2>
          {plugin("stripe") && (
            <button type="button" class="button button--small" onClick={() => toggle("stripe", Boolean(plugin("stripe")!.enabled))}>
              {plugin("stripe")!.enabled ? "Disable" : "Enable"}
            </button>
          )}
        </header>
        <p class="muted small">Stripe Checkout hosted page. Webhooks are signature-verified and events are idempotent. Configure the endpoint <code>{origin}/webhooks/stripe</code> in Stripe.</p>
        <div class="row-actions">
          <button type="button" class="link-button" onClick={() => copyWebhookUrl("/webhooks/stripe")}>Copy webhook URL</button>
        </div>
        <form class="stack" onSubmit={(event) => {
          event.preventDefault();
          void savePlugin("stripe", stripe, ["secretKey", "webhookSecret"], setStripeSaving, stripeSettings.reload);
        }}>
          <div class="form-grid">
            <Field label="Mode">
              <select value={stripe.mode} onChange={(event) => setStripe({ ...stripe, mode: (event.target as HTMLSelectElement).value })}>
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </Field>
            <Field label="Publishable key">
              <input value={stripe.publishableKey} placeholder="pk_test_…" onInput={(event) => setStripe({ ...stripe, publishableKey: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Secret key" hint={maskConfigured(stripeSettings.data?.secretKey) === "••••••••" ? "A secret key is already configured. Enter a new value to replace it." : "Encrypted at rest."}>
              <input type="password" value={stripe.secretKey} placeholder="sk_test_…" autocomplete="off" onInput={(event) => setStripe({ ...stripe, secretKey: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Webhook signing secret" hint={maskConfigured(stripeSettings.data?.webhookSecret) === "••••••••" ? "Already configured." : "Encrypted at rest."}>
              <input type="password" value={stripe.webhookSecret} placeholder="whsec_…" autocomplete="off" onInput={(event) => setStripe({ ...stripe, webhookSecret: (event.target as HTMLInputElement).value })} />
            </Field>
          </div>
          <button type="submit" class="button button--primary" disabled={stripeSaving}>{stripeSaving ? "Saving…" : "Save Stripe settings"}</button>
        </form>
      </section>

      <section class="card">
        <header class="card-header">
          <h2>PayPal {plugin("paypal") ? <StatusBadge status={plugin("paypal")!.enabled ? "active" : "disabled"} /> : null}</h2>
          {plugin("paypal") && (
            <button type="button" class="button button--small" onClick={() => toggle("paypal", Boolean(plugin("paypal")!.enabled))}>
              {plugin("paypal")!.enabled ? "Disable" : "Enable"}
            </button>
          )}
        </header>
        <p class="muted small">PayPal Orders v2 with server-side capture. Verify webhooks with the ID below and the endpoint <code>{origin}/webhooks/paypal</code>.</p>
        <div class="row-actions">
          <button type="button" class="link-button" onClick={() => copyWebhookUrl("/webhooks/paypal")}>Copy webhook URL</button>
        </div>
        <form class="stack" onSubmit={(event) => {
          event.preventDefault();
          void savePlugin("paypal", paypal, ["clientSecret"], setPaypalSaving, paypalSettings.reload);
        }}>
          <div class="form-grid">
            <Field label="Mode">
              <select value={paypal.mode} onChange={(event) => setPaypal({ ...paypal, mode: (event.target as HTMLSelectElement).value })}>
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </Field>
            <Field label="Client ID">
              <input value={paypal.clientId} onInput={(event) => setPaypal({ ...paypal, clientId: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Client secret" hint={maskConfigured(paypalSettings.data?.clientSecret) === "••••••••" ? "Already configured." : "Encrypted at rest."}>
              <input type="password" value={paypal.clientSecret} autocomplete="off" onInput={(event) => setPaypal({ ...paypal, clientSecret: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Webhook ID">
              <input value={paypal.webhookId} onInput={(event) => setPaypal({ ...paypal, webhookId: (event.target as HTMLInputElement).value })} />
            </Field>
          </div>
          <button type="submit" class="button button--primary" disabled={paypalSaving}>{paypalSaving ? "Saving…" : "Save PayPal settings"}</button>
        </form>
      </section>

      <section class="card">
        <h2>How payments are secured</h2>
        <ul class="plain-list">
          <li>Order totals, shipping and discounts are always recomputed on the server.</li>
          <li>Stripe signatures are verified against the raw body with a five-minute timestamp tolerance.</li>
          <li>PayPal webhooks are verified with PayPal's signature verification API.</li>
          <li>Provider amounts and currencies must match the internal order before it is marked paid.</li>
          <li>Event ids are unique per plugin, so repeated webhook deliveries never double-process.</li>
          <li>Secrets are encrypted with AES-GCM using a key derived from <code>APP_MASTER_KEY</code> and are never returned to the browser.</li>
        </ul>
      </section>
    </div>
  );
}
