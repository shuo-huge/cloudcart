import { useEffect, useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Field, Loading, toast, useAsync } from "../components";

interface SettingsData {
  settings: Record<string, string>;
}

interface RedirectRow {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  created_at: string;
}

export function SeoPage() {
  const settings = useAsync(() => adminGet<SettingsData>("/settings"));
  const redirects = useAsync(() => adminGet<RedirectRow[]>("/redirects"));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setTitle(settings.data.settings["seo.title"] ?? "");
      setDescription(settings.data.settings["seo.description"] ?? "");
    }
  }, [settings.data]);

  async function saveSeo(event: Event) {
    event.preventDefault();
    setSaving(true);
    try {
      await adminSend("/settings", "PUT", {
        settings: { "seo.title": title, "seo.description": description },
      });
      toast("SEO settings saved.");
      settings.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function addRedirect(event: Event) {
    event.preventDefault();
    try {
      await adminSend("/redirects", "POST", { fromPath, toPath, statusCode: 301 });
      toast("Redirect created.");
      setFromPath("");
      setToPath("");
      redirects.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create redirect.", "error");
    }
  }

  async function removeRedirect(id: string) {
    try {
      await adminSend(`/redirects/${id}`, "DELETE");
      toast("Redirect deleted.");
      redirects.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  }

  if (settings.loading && !settings.data) return <Loading />;
  if (settings.error) return <ErrorBox message={settings.error} onRetry={settings.reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>SEO</h1>
          <p class="muted">Product and collection pages are rendered server-side with meta tags, Open Graph and JSON-LD.</p>
        </div>
        <a class="button" href="/sitemap.xml" target="_blank" rel="noopener">Sitemap ↗</a>
      </header>

      <section class="card">
        <h2>Store metadata</h2>
        <form class="stack" onSubmit={saveSeo}>
          <Field label="Default title" hint="Used for the home page and as a fallback.">
            <input value={title} maxLength={200} onInput={(event) => setTitle((event.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Default meta description">
            <textarea rows={3} maxLength={400} value={description} onInput={(event) => setDescription((event.target as HTMLTextAreaElement).value)} />
          </Field>
          <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save SEO settings"}</button>
        </form>
      </section>

      <section class="card">
        <h2>301 redirects</h2>
        <form class="inline-form" onSubmit={addRedirect}>
          <input placeholder="/old-path" value={fromPath} onInput={(event) => setFromPath((event.target as HTMLInputElement).value)} required />
          <input placeholder="/new-path" value={toPath} onInput={(event) => setToPath((event.target as HTMLInputElement).value)} required />
          <button type="submit" class="button">Add redirect</button>
        </form>
        {redirects.error && <ErrorBox message={redirects.error} onRetry={redirects.reload} />}
        <DataTable
          rows={redirects.data ?? []}
          empty="No redirects configured."
          columns={[
            { key: "from", label: "From", render: (row) => <code>{row.from_path}</code> },
            { key: "to", label: "To", render: (row) => <code>{row.to_path}</code> },
            { key: "status", label: "Status", render: (row) => row.status_code },
            { key: "actions", label: "", render: (row) => <button type="button" class="link-button link-button--danger" onClick={() => removeRedirect(row.id)}>Delete</button> },
          ]}
        />
      </section>
    </div>
  );
}
