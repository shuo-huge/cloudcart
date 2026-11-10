import { useEffect, useState } from "preact/hooks";
import { publicGet, publicSend } from "../api";
import { Field } from "../components";
import { BrandMark } from "../icons";
import { useI18n } from "../i18n";
import type { Admin } from "../types";

export function LoginPage({ onAuthenticated }: { onAuthenticated: (admin: Admin) => void }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enabled: i18nEnabled, showSwitcher, locales, locale, setLocale } = useI18n();

  useEffect(() => {
    publicGet<{ installed: boolean; setupTokenConfigured: boolean }>("/api/admin/setup/status")
      .then((status) => {
        setInstalled(status.installed);
        setTokenConfigured(status.setupTokenConfigured);
      })
      .catch(() => setInstalled(true));
  }, []);

  async function handleLogin(event: Event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    setBusy(true);
    setError(null);
    try {
      const result = await publicSend<{ admin: Admin }>("/api/admin/login", "POST", {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      onAuthenticated(result.admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(event: Event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    setBusy(true);
    setError(null);
    try {
      const result = await publicSend<{ admin: Admin }>("/api/admin/setup", "POST", {
        setupToken: String(form.get("setupToken") ?? ""),
        storeName: String(form.get("storeName") ?? ""),
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        currency: String(form.get("currency") ?? "USD"),
      });
      onAuthenticated(result.admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setBusy(false);
    }
  }

  if (installed === null) {
    return <div class="boot-screen">Loading CloudCart…</div>;
  }

  return (
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand">
          <BrandMark /> CloudCart
          {i18nEnabled && showSwitcher && locales.length > 1 && (
            <select
              class="locale-select locale-select--auth"
              aria-label="Language"
              value={locale}
              onChange={(event) => setLocale((event.target as HTMLSelectElement).value)}
            >
              {locales.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          )}
        </div>
        <h1>{installed ? "Sign in" : "Set up your store"}</h1>
        <p class="muted">
          {installed
            ? "Use the store owner account created during setup."
            : "Create the store owner account. This setup screen closes permanently once completed."}
        </p>
        {error && <div class="error-box" role="alert">{error}</div>}
        {!installed && !tokenConfigured && (
          <div class="error-box" role="alert">
            SETUP_TOKEN is not configured. Add it as a Worker secret and redeploy before setting up.
          </div>
        )}
        {installed ? (
          <form onSubmit={handleLogin} class="stack">
            <Field label="Email">
              <input name="email" type="email" required autocomplete="username" />
            </Field>
            <Field label="Password">
              <input name="password" type="password" required autocomplete="current-password" />
            </Field>
            <button class="button button--primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <form onSubmit={handleSetup} class="stack">
            <Field label="Setup token" hint="Printed by the deployment script as SETUP_TOKEN.">
              <input name="setupToken" type="password" required autocomplete="off" />
            </Field>
            <Field label="Store name">
              <input name="storeName" required maxlength={120} defaultValue="My Store" />
            </Field>
            <Field label="Your name">
              <input name="name" required maxlength={120} />
            </Field>
            <Field label="Email">
              <input name="email" type="email" required autocomplete="username" />
            </Field>
            <Field label="Password" hint="At least 8 characters, including a letter and a number.">
              <input name="password" type="password" required minLength={8} autocomplete="new-password" />
            </Field>
            <Field label="Store currency">
              <select name="currency" defaultValue="USD">
                {["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CNY", "HKD", "SGD"].map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </Field>
            <button class="button button--primary" type="submit" disabled={busy || !tokenConfigured}>
              {busy ? "Creating…" : "Create administrator"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
