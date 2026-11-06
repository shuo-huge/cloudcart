import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { DataTable, ErrorBox, Field, Loading, Modal, toast, useAsync } from "../components";
import type { Category } from "../types";

interface CategoryForm {
  id?: string;
  name: string;
  slug: string;
  description: string;
  position: number;
  seoTitle: string;
  seoDescription: string;
}

const EMPTY: CategoryForm = {
  name: "", slug: "", description: "", position: 0, seoTitle: "", seoDescription: "",
};

export function CategoriesPage() {
  const { data, loading, error, reload } = useAsync(() => adminGet<Category[]>("/categories"));
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: Event) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const body = {
        name: form.name,
        slug: form.slug || undefined,
        description: form.description,
        position: Number(form.position) || 0,
        seoTitle: form.seoTitle || null,
        seoDescription: form.seoDescription || null,
      };
      if (form.id) await adminSend(`/categories/${form.id}`, "PUT", body);
      else await adminSend("/categories", "POST", body);
      toast("Category saved.");
      setForm(null);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Delete “${category.name}”? Products remain, but this category is removed from them.`)) return;
    try {
      await adminSend(`/categories/${category.id}`, "DELETE");
      toast("Category deleted.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Categories</h1>
          <p class="muted">Organise products into collections for navigation and SEO.</p>
        </div>
        <button type="button" class="button button--primary" onClick={() => setForm({ ...EMPTY })}>New category</button>
      </header>
      <section class="card">
        <DataTable
          rows={data ?? []}
          empty="No categories yet."
          columns={[
            {
              key: "name",
              label: "Name",
              render: (category) => (
                <button type="button" class="link-button" onClick={() => setForm({
                  id: category.id,
                  name: category.name,
                  slug: category.slug,
                  description: category.description,
                  position: category.position,
                  seoTitle: category.seo_title ?? "",
                  seoDescription: category.seo_description ?? "",
                })}>{category.name}</button>
              ),
            },
            { key: "slug", label: "URL", render: (category) => <code>/collections/{category.slug}</code> },
            { key: "count", label: "Products", render: (category) => category.product_count },
            { key: "position", label: "Position", render: (category) => category.position },
            {
              key: "actions",
              label: "",
              render: (category) => (
                <button type="button" class="link-button link-button--danger" onClick={() => remove(category)}>Delete</button>
              ),
            },
          ]}
        />
      </section>

      {form && (
        <Modal title={form.id ? "Edit category" : "New category"} onClose={() => setForm(null)}>
          <form class="stack" onSubmit={save}>
            <Field label="Name">
              <input required maxLength={160} value={form.name} onInput={(event) => setForm({ ...form, name: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Slug" hint="Leave blank to generate from the name.">
              <input value={form.slug} maxLength={80} onInput={(event) => setForm({ ...form, slug: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="Description">
              <textarea rows={3} value={form.description} onInput={(event) => setForm({ ...form, description: (event.target as HTMLTextAreaElement).value })} />
            </Field>
            <Field label="Position">
              <input type="number" min={0} value={form.position} onInput={(event) => setForm({ ...form, position: Number((event.target as HTMLInputElement).value) })} />
            </Field>
            <Field label="SEO title">
              <input value={form.seoTitle} maxLength={200} onInput={(event) => setForm({ ...form, seoTitle: (event.target as HTMLInputElement).value })} />
            </Field>
            <Field label="SEO description">
              <textarea rows={2} value={form.seoDescription} maxLength={400} onInput={(event) => setForm({ ...form, seoDescription: (event.target as HTMLTextAreaElement).value })} />
            </Field>
            <div class="modal-actions">
              <button type="button" class="button" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save category"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
