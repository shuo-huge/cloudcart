import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Field, Loading, Modal, StatusBadge, toast, useAsync } from "../components";
import { useI18n } from "../i18n";
import { linkProps } from "../router";
import type { PluginRow } from "../types";

export function PluginsPage() {
  const { data, loading, error, reload } = useAsync(() => adminGet<PluginRow[]>("/plugins"));
  const { locales } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageForm, setLanguageForm] = useState({ defaultLocale: "en", showSwitcher: true });
  const [languageSaving, setLanguageSaving] = useState(false);

  async function toggle(plugin: PluginRow) {
    try {
      await adminSend(`/plugins/${plugin.id}/${plugin.enabled ? "disable" : "enable"}`, "POST", {});
      toast(`${plugin.name} ${plugin.enabled ? "disabled" : "enabled"}.`);
      reload();
      if (plugin.id === "admin-i18n") {
        // Translations are a DOM overlay; reload so the UI starts from clean source text.
        window.setTimeout(() => window.location.reload(), 400);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed.", "error");
    }
  }

  async function openLanguageSettings() {
    try {
      const settings = await adminGet<Record<string, string>>("/plugins/admin-i18n/settings");
      setLanguageForm({
        defaultLocale: settings.defaultLocale || "en",
        showSwitcher: settings.showSwitcher !== "0",
      });
      setLanguageOpen(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to load language settings.", "error");
    }
  }

  async function saveLanguageSettings(event: Event) {
    event.preventDefault();
    setLanguageSaving(true);
    try {
      await adminSend("/plugins/admin-i18n/settings", "PUT", {
        settings: {
          defaultLocale: languageForm.defaultLocale,
          showSwitcher: languageForm.showSwitcher ? "1" : "0",
        },
        secretKeys: [],
      });
      toast("Language pack saved.");
      setLanguageOpen(false);
      window.setTimeout(() => window.location.reload(), 400);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setLanguageSaving(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Plugins</h1>
          <p class="muted">Plugins are bundled at build time. Enabling a plugin never downloads or executes new code.</p>
        </div>
      </header>
      <section class="card">
        <DataTable
          rows={data ?? []}
          empty="No plugins in this build."
          columns={[
            {
              key: "name",
              label: "Plugin",
              render: (plugin) => (
                <div>
                  <strong>{plugin.name}</strong>
                  <div class="muted small">{plugin.description}</div>
                  <div class="capabilities">{plugin.capabilities.map((capability) => <code key={capability}>{capability}</code>)}</div>
                </div>
              ),
            },
            { key: "type", label: "Type", render: (plugin) => plugin.type },
            { key: "version", label: "Version", render: (plugin) => plugin.version },
            { key: "status", label: "Status", render: (plugin) => plugin.bundled ? <StatusBadge status={plugin.enabled ? "active" : "disabled"} /> : <StatusBadge status="not in build" /> },
            {
              key: "actions",
              label: "",
              render: (plugin) => plugin.bundled ? (
                <div class="row-actions">
                  <button type="button" class="button button--small" onClick={() => toggle(plugin)}>
                    {plugin.enabled ? "Disable" : "Enable"}
                  </button>
                  {plugin.type === "payment" && (
                    <a class="link-button" {...linkProps("/payments")}>Configure</a>
                  )}
                  {plugin.type === "notification" && (
                    <a class="link-button" {...linkProps("/emails")}>Configure</a>
                  )}
                  {plugin.id === "admin-i18n" && (
                    <button type="button" class="link-button" onClick={() => void openLanguageSettings()}>
                      Language settings
                    </button>
                  )}
                </div>
              ) : <span class="muted small">Redeploy with this plugin to manage it.</span>,
            },
          ]}
        />
      </section>
      <section class="card">
        <h2>Plugin safety</h2>
        <ul class="plain-list">
          <li>Disabling a plugin hides its storefront entry points and blocks new payments through it.</li>
          <li>Historical orders and payment transactions are retained.</li>
          <li>Uninstalling a plugin never deletes business data.</li>
        </ul>
      </section>

      {languageOpen && (
        <Modal title="Language settings" onClose={() => setLanguageOpen(false)}>
          <form class="stack" onSubmit={saveLanguageSettings}>
            <p class="muted small">
              Enable or disable the admin language pack. Changing the language reloads the page.
            </p>
            <Field label="Default language">
              <select
                value={languageForm.defaultLocale}
                onChange={(event) => setLanguageForm({
                  ...languageForm,
                  defaultLocale: (event.target as HTMLSelectElement).value,
                })}
              >
                {locales.map((locale) => <option key={locale.code} value={locale.code}>{locale.label}</option>)}
              </select>
            </Field>
            <label class="checkbox">
              <input
                type="checkbox"
                checked={languageForm.showSwitcher}
                onChange={(event) => setLanguageForm({
                  ...languageForm,
                  showSwitcher: (event.target as HTMLInputElement).checked,
                })}
              />
              Show language switcher
            </label>
            <div class="modal-actions">
              <button type="button" class="button" onClick={() => setLanguageOpen(false)}>Cancel</button>
              <button type="submit" class="button button--primary" disabled={languageSaving}>
                {languageSaving ? "Saving…" : "Save language settings"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
