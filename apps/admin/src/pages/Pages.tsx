import { formatDate } from "@cloudcart/shared";
import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Loading, useAsync, toast } from "../components";
import { linkProps, navigate } from "../router";

interface PageRow {
  id: string;
  slug: string;
  title: string;
  type: string;
  published_version: number | null;
  updated_at: string;
}

export function PagesPage() {
  const { data, loading, error, reload } = useAsync(() => adminGet<PageRow[]>("/pages"));
  const [newPageTitle, setNewPageTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function createPage() {
    const title = newPageTitle.trim();
    if (!title || creating) return;
    const slug = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) {
      toast("Use a page title containing Latin letters or numbers.", "error");
      return;
    }
    setCreating(true);
    try {
      const created = await adminSend<{ id: string; slug: string }>("/pages", "POST", { title, slug });
      toast("Page created as a draft.");
      navigate("/pages/" + created.slug + "/edit");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create the page.", "error");
    } finally {
      setCreating(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Page Builder</h1>
          <p class="muted">Page configuration is stored as validated JSON. Publishing creates an immutable version snapshot.</p>
        </div>
        <a class="button" href="/" target="_blank" rel="noopener">View home ↗</a>
      </header>

      <div class="notice">
        Standard store pages are added as drafts the first time Page Builder is opened. Review business details and policy wording before publishing.
        The editor supports drag-to-reorder, live preview at desktop/tablet/mobile widths, undo/redo,
        autosaved drafts, immutable published versions and sanitised HTML.
      </div>

      <section class="card">
        <h2>Create a new content page</h2>
        <form onSubmit={(event) => { event.preventDefault(); void createPage(); }} style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "24px" }}>
          <input
            type="text"
            aria-label="New page title"
            placeholder="e.g. Size Guide"
            value={newPageTitle}
            onInput={(event) => setNewPageTitle((event.currentTarget as HTMLInputElement).value)}
            maxLength={140}
            required
            style={{ minWidth: "250px", flex: "1" }}
          />
          <button class="button button--primary" type="submit" disabled={creating || !newPageTitle.trim()}>
            {creating ? "Creating…" : "Create page"}
          </button>
        </form>
        <DataTable
          rows={data ?? []}
          empty="No pages configured."
          columns={[
            { key: "title", label: "Page", render: (page) => <div><strong>{page.title}</strong><div class="muted small">/{page.slug}</div></div> },
            { key: "type", label: "Type", render: (page) => page.type },
            {
              key: "published",
              label: "Published",
              render: (page) => page.published_version !== null
                ? `Version ${page.published_version}`
                : <span class="badge badge--warning">Draft only</span>,
            },
            { key: "updated", label: "Updated", render: (page) => formatDate(page.updated_at) },
            {
              key: "actions",
              label: "",
              render: (page) => (
                <div class="row-actions">
                  <a class="link-button" {...linkProps(`/pages/${page.slug}/edit`)}>Edit</a>
                  <a class="link-button" href={page.slug === "home" ? "/" : `/pages/${page.slug}`} target="_blank" rel="noopener">Preview ↗</a>
                </div>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
