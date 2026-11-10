import { useEffect, useState } from "preact/hooks";
import { adminGet, adminSend } from "./api";
import { Field, toast } from "./components";
import type { MediaStorageProvider, MediaStorageStatus } from "./types";

export function MediaStorageSettings() {
  const [status, setStatus] = useState<MediaStorageStatus | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<MediaStorageProvider>("r2");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("products");
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<MediaStorageProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(next: MediaStorageStatus): void {
    setStatus(next);
    setDefaultProvider(next.defaultProvider);
    setOwner(next.providers.jsdelivr.owner || "");
    setRepo(next.providers.jsdelivr.repo || "");
    setBranch(next.providers.jsdelivr.branch || "main");
    setPath(next.providers.jsdelivr.path || "products");
    setToken("");
    setClearToken(false);
  }

  useEffect(() => {
    let active = true;
    adminGet<MediaStorageStatus>("/media/storage")
      .then((next) => {
        if (active) apply(next);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load media storage settings.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: Event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const next = await adminSend<MediaStorageStatus>("/media/storage", "PUT", {
        defaultProvider,
        jsdelivr: {
          owner,
          repo,
          branch,
          path,
          ...(token.trim() ? { token: token.trim() } : {}),
          ...(clearToken ? { clearToken: true } : {}),
        },
      });
      apply(next);
      toast("Media storage settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function test(provider: MediaStorageProvider) {
    setTesting(provider);
    setError(null);
    try {
      const result = await adminSend<{ ok: boolean; message: string }>("/media/storage/test", "POST", { provider });
      if (result.ok) toast(result.message || "Storage connection OK.");
      else {
        setError(result.message || "Storage test failed.");
        toast(result.message || "Storage test failed.", "error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Storage test failed.");
      toast(err instanceof Error ? err.message : "Storage test failed.", "error");
    } finally {
      setTesting(null);
    }
  }

  return (
    <section class="card">
      <h2>Media storage</h2>
      <p class="muted">
        Choose where uploaded product images are stored. R2 is available only when this deployment has a MEDIA binding. jsDelivr publishes files to a public GitHub repository.
      </p>
      <form class="stack" onSubmit={save}>
        <div class="form-grid">
          <Field label="Default storage" hint="Used when an upload does not choose a provider.">
            <select
              value={defaultProvider}
              onChange={(event) => setDefaultProvider((event.target as HTMLSelectElement).value as MediaStorageProvider)}
            >
              <option value="r2" disabled={!status?.providers.r2.available}>R2{status?.providers.r2.available ? "" : " — not configured"}</option>
              <option value="jsdelivr" disabled={!status?.providers.jsdelivr.configured}>jsDelivr{status?.providers.jsdelivr.configured ? "" : " — not configured"}</option>
            </select>
          </Field>
          <div class="field">
            <span class="field-label">R2 status</span>
            <span class={`provider-status ${status?.providers.r2.available ? "provider-status--ok" : "provider-status--warning"}`}>
              {status?.providers.r2.available
                ? "Available — uploads are served from /media/*"
                : status?.providers.r2.reason || "R2 is not configured in this deployment."}
            </span>
          </div>
        </div>

        <div class="settings-subcard">
          <h3>jsDelivr (GitHub)</h3>
          <p class="muted small">
            Use a public GitHub repository and a fine-grained token with <strong>Contents: Read and write</strong>.
            The token is encrypted with your store key and is never returned by the API.
            jsDelivr is intended for open-source projects; review its terms before using it for a commercial catalog.
          </p>
          <div class="form-grid">
            <Field label="Repository owner">
              <input value={owner} onInput={(event) => setOwner((event.target as HTMLInputElement).value)} placeholder="your-github-user" />
            </Field>
            <Field label="Repository name">
              <input value={repo} onInput={(event) => setRepo((event.target as HTMLInputElement).value)} placeholder="cloudcart-media" />
            </Field>
            <Field label="Branch">
              <input value={branch} onInput={(event) => setBranch((event.target as HTMLInputElement).value)} placeholder="main" />
            </Field>
            <Field label="Folder path">
              <input value={path} onInput={(event) => setPath((event.target as HTMLInputElement).value)} placeholder="products" />
            </Field>
            <Field label="GitHub token" hint={status?.providers.jsdelivr.tokenConfigured ? "A token is stored. Leave blank to keep it." : "Fine-grained PAT with Contents: Read and write."}>
              <input
                type="password"
                autoComplete="new-password"
                value={token}
                placeholder={status?.providers.jsdelivr.tokenConfigured ? "•••••••• (stored)" : "github_pat_..."}
                onInput={(event) => setToken((event.target as HTMLInputElement).value)}
              />
            </Field>
          </div>
          {status?.providers.jsdelivr.tokenConfigured && (
            <label class="checkbox-row">
              <input type="checkbox" checked={clearToken} onChange={(event) => setClearToken((event.target as HTMLInputElement).checked)} />
              <span>Remove the stored GitHub token</span>
            </label>
          )}
          {status?.providers.jsdelivr.tokenConfigured && !status.providers.jsdelivr.tokenReadable && (
            <div class="error-box" role="alert">The stored token cannot be decrypted. Enter a new token.</div>
          )}
          <p class="muted small">
            Status: {status?.providers.jsdelivr.available ? "Connected configuration ready." : status?.providers.jsdelivr.reason || "Not configured."}
          </p>
        </div>

        {error && <div class="error-box" role="alert">{error}</div>}
        <div class="row-actions">
          <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save storage settings"}</button>
          <button type="button" class="button" disabled={testing !== null} onClick={() => void test("jsdelivr")}>
            {testing === "jsdelivr" ? "Testing…" : "Test jsDelivr"}
          </button>
          <button type="button" class="button" disabled={testing !== null || !status?.providers.r2.available} onClick={() => void test("r2")}>
            {testing === "r2" ? "Testing…" : "Test R2"}
          </button>
        </div>
      </form>
    </section>
  );
}
