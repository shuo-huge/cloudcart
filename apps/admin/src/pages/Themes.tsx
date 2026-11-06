import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { ErrorBox, Field, Loading, Modal, toast, useAsync } from "../components";
import type { ThemeRow, ThemeToken } from "../types";

interface ThemeSettingsResponse {
  settings: Record<string, string>;
  tokens: ThemeToken[];
}

export function ThemesPage() {
  const { data, loading, error, reload } = useAsync(() => adminGet<ThemeRow[]>("/themes"));
  const [configuring, setConfiguring] = useState<ThemeRow | null>(null);
  const [previewing, setPreviewing] = useState<ThemeRow | null>(null);
  const [tokens, setTokens] = useState<ThemeToken[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function openSettings(theme: ThemeRow) {
    try {
      const result = await adminGet<ThemeSettingsResponse>(`/themes/${theme.id}/settings`);
      const initial: Record<string, string> = {};
      for (const token of result.tokens) initial[token.key] = result.settings[token.key] ?? token.default;
      setTokens(result.tokens);
      setValues(initial);
      setConfiguring(theme);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unable to load theme settings.", "error");
    }
  }

  async function activate(theme: ThemeRow) {
    if (!window.confirm(`Activate the ${theme.name} theme? This does not change products or orders.`)) return;
    try {
      await adminSend(`/themes/${theme.id}/activate`, "POST", {});
      toast(`${theme.name} is now active.`);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Activation failed.", "error");
    }
  }

  async function saveSettings(event: Event) {
    event.preventDefault();
    if (!configuring) return;
    setSaving(true);
    try {
      await adminSend(`/themes/${configuring.id}/settings`, "PUT", { settings: values });
      toast("Theme settings saved.");
      setConfiguring(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  const groups = [...new Set(tokens.map((token) => token.group ?? "General"))];

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Themes</h1>
          <p class="muted">Themes are bundled with the Worker. Switching themes never changes products or orders.</p>
        </div>
        <a class="button" href="/" target="_blank" rel="noopener">View store ↗</a>
      </header>
      <div class="theme-grid">
        {(data ?? []).map((theme) => (
          <article class={`theme-card${theme.active ? " theme-card--active" : ""}`} key={theme.id}>
            <div class="theme-preview">
              <button
                type="button"
                class="theme-preview-trigger"
                onClick={() => setPreviewing(theme)}
                aria-label={`View full ${theme.name} storefront preview`}
                title="View full storefront preview"
              >
                {theme.preview_image ? (
                  <span
                    class={`theme-preview-art theme-preview-art--${theme.id}`}
                    style={{ backgroundImage: `url("${theme.preview_image}")` }}
                    role="img"
                    aria-label={`${theme.name} storefront homepage preview`}
                  />
                ) : (
                  <span class="theme-preview-placeholder" aria-hidden="true">
                    <span class="theme-preview-bar" />
                    <span class="theme-preview-hero" />
                    <span class="theme-preview-grid"><i /><i /><i /><i /></span>
                  </span>
                )}
                <span class="theme-preview-hint">View full preview ↗</span>
              </button>
            </div>
            <div class="theme-card-body">
              <header>
                <h2>{theme.name}</h2>
                {theme.active ? <span class="badge badge--success">Active</span> : null}
                {!theme.bundled ? <span class="badge badge--danger">Not in build</span> : null}
              </header>
              <p class="muted small">{theme.description}</p>
              <p class="muted small">Version {theme.version}</p>
              <div class="row-actions">
                {!theme.active && theme.bundled && (
                  <button type="button" class="button button--primary button--small" onClick={() => activate(theme)}>Activate</button>
                )}
                {theme.bundled && (
                  <button type="button" class="button button--small" onClick={() => openSettings(theme)}>Customise</button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {previewing && (
        <Modal title={`${previewing.name} · Storefront preview`} onClose={() => setPreviewing(null)} wide>
          <div class="theme-preview-modal">
            {previewing.preview_image ? (
              <div
                class={`theme-preview-art theme-preview-art--${previewing.id} theme-preview-art--large`}
                style={{ backgroundImage: `url("${previewing.preview_image}")` }}
                role="img"
                aria-label={`Full ${previewing.name} storefront homepage preview`}
              />
            ) : (
              <p class="muted">No preview image is available for this theme yet.</p>
            )}
          </div>
          <p class="muted small theme-preview-caption">
            Preview content is illustrative. Your live storefront will use your own branding, products, prices and store settings.
          </p>
        </Modal>
      )}

      {configuring && (
        <Modal title={`Customise ${configuring.name}`} onClose={() => setConfiguring(null)} wide>
          <form class="stack" onSubmit={saveSettings}>
            {groups.map((group) => (
              <fieldset class="settings-group" key={group}>
                <legend>{group}</legend>
                <div class="form-grid">
                  {tokens.filter((token) => (token.group ?? "General") === group).map((token) => (
                    <Field key={token.key} label={token.label}>
                      {token.type === "color" ? (
                        <div class="color-field">
                          <input type="color" value={values[token.key] ?? token.default} onInput={(event) => setValues({ ...values, [token.key]: (event.target as HTMLInputElement).value })} />
                          <input value={values[token.key] ?? token.default} onInput={(event) => setValues({ ...values, [token.key]: (event.target as HTMLInputElement).value })} />
                        </div>
                      ) : (
                        <input value={values[token.key] ?? token.default} onInput={(event) => setValues({ ...values, [token.key]: (event.target as HTMLInputElement).value })} />
                      )}
                    </Field>
                  ))}
                </div>
              </fieldset>
            ))}
            <div class="modal-actions">
              <button type="button" class="button" onClick={() => setConfiguring(null)}>Cancel</button>
              <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
