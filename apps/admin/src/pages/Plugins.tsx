import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Field, Loading, Modal, StatusBadge, toast, useAsync } from "../components";
import { useI18n } from "../i18n";
import { notifyPluginsChanged } from "../plugin-nav";
import { linkProps } from "../router";
import type { PluginRow } from "../types";

interface RemotePreview {
  manifest: {
    id: string;
    name: string;
    version: string;
    type: string;
    description: string;
    author?: string;
    permissions: string[];
    admin: { entryUrl: string; pages: Array<{ id: string; label: string; icon?: string }> };
    service: { baseUrl: string };
  };
  manifestUrl: string;
  manifestHash: string;
  adminOrigin: string;
  permissions: string[];
  warnings: string[];
}

interface InstallResult {
  id: string;
  serviceSecret?: string;
}

export function PluginsPage() {
  const { data, loading, error, reload } = useAsync(() => adminGet<PluginRow[]>("/plugins"));
  const { locales } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageForm, setLanguageForm] = useState({ defaultLocale: "en", showSwitcher: true });
  const [languageSaving, setLanguageSaving] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [manifestUrl, setManifestUrl] = useState("");
  const [preview, setPreview] = useState<RemotePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [serviceSecret, setServiceSecret] = useState("");
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState<string | null>(null);

  async function toggle(plugin: PluginRow) {
    try {
      await adminSend(`/plugins/${plugin.id}/${plugin.enabled ? "disable" : "enable"}`, "POST", {});
      toast(`${plugin.name} ${plugin.enabled ? "disabled" : "enabled"}.`);
      if (plugin.runtime === "remote") {
        notifyPluginsChanged();
        window.setTimeout(() => window.location.reload(), 300);
        return;
      }
      reload();
      if (plugin.id === "admin-i18n") {
        window.setTimeout(() => window.location.reload(), 400);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed.", "error");
    }
  }

  function openInstall(): void {
    setUpdateId(null);
    setManifestUrl("");
    setPreview(null);
    setInstallError(null);
    setServiceSecret("");
    setGeneratedSecret(null);
    setInstallOpen(true);
  }

  function openUpdate(plugin: PluginRow): void {
    setUpdateId(plugin.id);
    setManifestUrl(plugin.manifestUrl ?? "");
    setPreview(null);
    setInstallError(null);
    setServiceSecret("");
    setGeneratedSecret(null);
    setInstallOpen(true);
  }

  async function previewManifest(): Promise<void> {
    if (!manifestUrl.trim()) return;
    setPreviewing(true);
    setInstallError(null);
    setPreview(null);
    setGeneratedSecret(null);
    try {
      const path = updateId
        ? `/plugins/${encodeURIComponent(updateId)}/update/preview`
        : "/plugins/remote/preview";
      const result = await adminSend<RemotePreview>(path, "POST", { manifestUrl: manifestUrl.trim() });
      setPreview(result);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Could not read the manifest.");
    } finally {
      setPreviewing(false);
    }
  }

  async function installOrUpdate(): Promise<void> {
    if (!preview) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const path = updateId
        ? `/plugins/${encodeURIComponent(updateId)}/update`
        : "/plugins/remote/install";
      const result = await adminSend<InstallResult>(path, "POST", {
        manifestUrl: preview.manifestUrl,
        manifestHash: preview.manifestHash,
        serviceSecret: serviceSecret.trim() || undefined,
      });
      if (result.serviceSecret) {
        setGeneratedSecret(result.serviceSecret);
        toast(updateId ? "Plugin updated. Save the new service secret." : "Plugin installed. Save the service secret.");
      } else {
        toast(updateId ? "Plugin updated." : "Plugin installed.");
        finishInstall();
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Installation failed.");
    } finally {
      setInstalling(false);
    }
  }

  function finishInstall(): void {
    setInstallOpen(false);
    setPreview(null);
    setGeneratedSecret(null);
    notifyPluginsChanged();
    window.setTimeout(() => window.location.reload(), 300);
  }

  async function checkHealth(plugin: PluginRow): Promise<void> {
    setHealthBusy(plugin.id);
    try {
      const result = await adminSend<{ ok: boolean; message?: string }>(
        `/plugins/${encodeURIComponent(plugin.id)}/health`,
        "POST",
        {},
      );
      toast(result.ok ? `${plugin.name} is healthy.` : `${plugin.name}: ${result.message ?? "unhealthy"}`, result.ok ? "success" : "error");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Health check failed.", "error");
    } finally {
      setHealthBusy(null);
    }
  }

  async function uninstall(plugin: PluginRow): Promise<void> {
    if (!window.confirm(
      `Uninstall ${plugin.name}? Orders and payment transactions are kept, but the plugin menu and storefront access are removed.`,
    )) return;
    try {
      await adminSend(`/plugins/${encodeURIComponent(plugin.id)}/uninstall`, "POST", {});
      toast(`${plugin.name} uninstalled.`);
      notifyPluginsChanged();
      window.setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Uninstall failed.", "error");
    }
  }

  async function copySecret(): Promise<void> {
    if (!generatedSecret) return;
    try {
      await navigator.clipboard.writeText(generatedSecret);
      toast("Service secret copied.");
    } catch {
      toast("Select and copy the secret manually.", "error");
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
          <p class="muted">Bundled plugins run in the Worker. Remote plugins run on their own HTTPS service and open inside the admin.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="button button--primary" onClick={openInstall}>Install remote plugin</button>
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
                  <span class={`plugin-badge plugin-badge--${plugin.runtime}`}>{plugin.runtime}</span>
                  <div class="muted small">{plugin.description}</div>
                  <div class="muted small">
                    {plugin.author ? `${plugin.author} · ` : ""}v{plugin.version}
                  </div>
                  <div class="capabilities">{plugin.capabilities.map((capability) => <code key={capability}>{capability}</code>)}</div>
                  {plugin.runtime === "remote" && plugin.last_error && (
                    <div class="muted small">Last error: {plugin.last_error}</div>
                  )}
                </div>
              ),
            },
            { key: "type", label: "Type", render: (plugin) => plugin.type },
            {
              key: "status",
              label: "Status",
              render: (plugin) => (
                <div class="plugin-status">
                  <StatusBadge status={plugin.enabled ? "active" : "disabled"} />
                  {plugin.runtime === "remote" && (
                    <span class={`health-dot health-dot--${plugin.healthStatus}`} title={`Health: ${plugin.healthStatus}`} />
                  )}
                </div>
              ),
            },
            {
              key: "source",
              label: "Source",
              render: (plugin) => plugin.runtime === "remote"
                ? <span class="muted small">{plugin.adminOrigin ?? plugin.serviceBaseUrl ?? "Remote"}</span>
                : <span class="muted small">Bundled</span>,
            },
            {
              key: "actions",
              label: "",
              render: (plugin) => (
                <div class="row-actions">
                  <button type="button" class="button button--small" onClick={() => void toggle(plugin)}>
                    {plugin.enabled ? "Disable" : "Enable"}
                  </button>
                  {plugin.runtime === "remote" ? (
                    <>
                      {plugin.adminPages[0] && plugin.enabled === 1 && (
                        <a class="link-button" {...linkProps(`/plugins/${encodeURIComponent(plugin.id)}/${encodeURIComponent(plugin.adminPages[0].id)}`)}>
                          Open
                        </a>
                      )}
                      <button type="button" class="button button--small" onClick={() => openUpdate(plugin)}>Update</button>
                      <button
                        type="button"
                        class="button button--small"
                        disabled={healthBusy === plugin.id}
                        onClick={() => void checkHealth(plugin)}
                      >
                        {healthBusy === plugin.id ? "Checking…" : "Health"}
                      </button>
                      <button type="button" class="button button--small button--danger" onClick={() => void uninstall(plugin)}>Uninstall</button>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </section>
      <section class="card">
        <h2>Plugin safety</h2>
        <ul class="plain-list">
          <li>Bundled plugins are compiled into the Worker; enabling one never downloads code.</li>
          <li>Remote plugins run on their own HTTPS service. CloudCart only stores their manifest and calls signed APIs.</li>
          <li>Disabling a plugin hides its storefront entry points and admin menu. Historical orders and payment data are retained.</li>
          <li>Uninstalling a remote plugin keeps orders and payment transactions; finish pending payments first.</li>
        </ul>
      </section>

      {installOpen && (
        <Modal
          title={updateId ? "Update remote plugin" : "Install remote plugin"}
          onClose={() => setInstallOpen(false)}
          wide
        >
          <div class="stack">
            {!generatedSecret && (
              <>
                <Field label="Manifest URL" hint="Must be a public HTTPS URL serving the plugin manifest JSON.">
                  <input
                    type="url"
                    value={manifestUrl}
                    placeholder="https://plugin.example.com/cloudcart-plugin.json"
                    onInput={(event) => setManifestUrl((event.target as HTMLInputElement).value)}
                  />
                </Field>
                <div class="row-actions">
                  <button type="button" class="button" disabled={previewing || !manifestUrl.trim()} onClick={() => void previewManifest()}>
                    {previewing ? "Reading…" : "Preview"}
                  </button>
                </div>
              </>
            )}

            {installError && <div class="notice notice--warning">{installError}</div>}

            {preview && !generatedSecret && (
              <div class="remote-preview">
                <h3>{preview.manifest.name}</h3>
                <p class="muted small">
                  {preview.manifest.author ?? "Unknown author"} · v{preview.manifest.version} · {preview.manifest.type}
                </p>
                <p>{preview.manifest.description}</p>
                <dl class="totals">
                  <div><dt>Service</dt><dd><code>{preview.manifest.service.baseUrl}</code></dd></div>
                  <div><dt>Admin page</dt><dd><code>{preview.manifest.admin.entryUrl}</code></dd></div>
                  <div><dt>Admin origin</dt><dd><code>{preview.adminOrigin}</code></dd></div>
                </dl>
                <h4>Permissions</h4>
                {preview.permissions.length > 0 ? (
                  <ul class="plain-list">{preview.permissions.map((permission) => <li key={permission}><code>{permission}</code></li>)}</ul>
                ) : <p class="muted small">No store data access requested.</p>}
                <h4>Admin menu</h4>
                {preview.manifest.admin.pages.length > 0 ? (
                  <ul class="plain-list">{preview.manifest.admin.pages.map((page) => <li key={page.id}>{page.label} <span class="muted small">({page.id})</span></li>)}</ul>
                ) : <p class="muted small">No admin menu pages.</p>}
                {preview.warnings.map((warning) => <div class="notice" key={warning}>{warning}</div>)}
                <Field
                  label="Service secret (optional)"
                  hint="Leave blank to generate a secret. If the plugin service already has a secret, paste it here."
                >
                  <input
                    type="password"
                    value={serviceSecret}
                    onInput={(event) => setServiceSecret((event.target as HTMLInputElement).value)}
                  />
                </Field>
                <div class="modal-actions">
                  <button type="button" class="button" onClick={() => setInstallOpen(false)}>Cancel</button>
                  <button type="button" class="button button--primary" disabled={installing} onClick={() => void installOrUpdate()}>
                    {installing ? "Saving…" : updateId ? "Update plugin" : "Install plugin"}
                  </button>
                </div>
              </div>
            )}

            {generatedSecret && (
              <div class="stack">
                <div class="notice notice--warning">
                  Copy this service secret now. It is shown only once and must be configured on the plugin server.
                </div>
                <code class="secret-code">{generatedSecret}</code>
                <div class="modal-actions">
                  <button type="button" class="button" onClick={() => void copySecret()}>Copy secret</button>
                  <button type="button" class="button button--primary" onClick={finishInstall}>Done</button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

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
