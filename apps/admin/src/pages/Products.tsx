import { formatDate, formatMoney, moneyToInput } from "@cloudcart/shared";
import { useEffect, useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import {
  DataTable,
  ErrorBox,
  Field,
  Loading,
  Modal,
  Money,
  Pagination,
  StatusBadge,
  toast,
  useAsync,
} from "../components";
import { linkProps, navigate } from "../router";
import type { Category, Product, ProductVariant } from "../types";

function mediaUrl(key: string | null): string {
  if (!key) return "";
  return /^https:\/\//i.test(key) ? key : `/media/${key}`;
}

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsync(
    () => adminGet<{ items: Product[]; total: number }>(`/products?page=${page}&perPage=20&q=${encodeURIComponent(search)}&status=${status}`),
    [page, status, search],
  );

  async function remove(product: Product) {
    if (!window.confirm(`Delete “${product.name}”? This cannot be undone.`)) return;
    setDeleting(product.id);
    try {
      await adminSend(`/products/${product.id}`, "DELETE");
      toast("Product deleted.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setDeleting(null);
    }
  }

  async function toggleStatus(product: Product) {
    try {
      await adminSend(`/products/${product.id}/status`, "POST", {
        status: product.status === "active" ? "draft" : "active",
      });
      toast(product.status === "active" ? "Product moved to draft." : "Product published.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed.", "error");
    }
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Products</h1>
          <p class="muted">Manage the catalog, pricing, stock and images.</p>
        </div>
        <a class="button button--primary" {...linkProps("/products/new")}>Add product</a>
      </header>
      <section class="card">
        <div class="toolbar">
          <form class="toolbar-search" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
            <input
              type="search"
              placeholder="Search products"
              value={search}
              onInput={(event) => { setSearch((event.target as HTMLInputElement).value); setPage(1); }}
            />
          </form>
          <select value={status} onChange={(event) => { setStatus((event.target as HTMLSelectElement).value); setPage(1); }}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data ? <Loading /> : (
          <>
            <DataTable
              rows={data?.items ?? []}
              empty="No products yet. Add your first product to open the store."
              columns={[
                {
                  key: "product",
                  label: "Product",
                  render: (product) => (
                    <div class="product-cell">
                      {product.image_key ? <img class="thumb" src={mediaUrl(product.image_key)} alt="" loading="lazy" /> : <span class="thumb thumb--empty" />}
                      <div>
                        <a class="text-link" {...linkProps(`/products/${product.id}`)}>{product.name}</a>
                        <div class="muted small">/{product.slug}</div>
                      </div>
                    </div>
                  ),
                },
                { key: "status", label: "Status", render: (product) => <StatusBadge status={product.status} /> },
                { key: "price", label: "Price", render: (product) => <Money cents={product.price_cents} currency={product.currency} /> },
                {
                  key: "stock",
                  label: "Stock",
                  render: (product) => product.manage_stock ? product.stock : <span class="muted">Untracked</span>,
                },
                { key: "category", label: "Categories", render: (product) => product.category_names || <span class="muted">—</span> },
                { key: "date", label: "Updated", render: (product) => formatDate(product.updated_at) },
                {
                  key: "actions",
                  label: "",
                  render: (product) => (
                    <div class="row-actions">
                      <a class="link-button" {...linkProps(`/products/${product.id}`)}>Edit</a>
                      <button type="button" class="link-button" onClick={() => toggleStatus(product)}>
                        {product.status === "active" ? "Unpublish" : "Publish"}
                      </button>
                      <button type="button" class="link-button link-button--danger" disabled={deleting === product.id} onClick={() => remove(product)}>
                        Delete
                      </button>
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={page} perPage={20} total={data?.total ?? 0} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

interface EditorState {
  name: string;
  slug: string;
  description: string;
  status: "draft" | "active" | "archived";
  type: "simple" | "variable";
  price: string;
  compareAtPrice: string;
  sku: string;
  stock: number;
  manageStock: boolean;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  tags: string;
  categoryIds: string[];
}

interface VariantDraft {
  id?: string;
  title: string;
  sku: string;
  price: string;
  stock: number;
  active: boolean;
}

const EMPTY_FORM: EditorState = {
  name: "", slug: "", description: "", status: "draft", type: "simple",
  price: "0.00", compareAtPrice: "", sku: "", stock: 0, manageStock: true,
  featured: false, seoTitle: "", seoDescription: "", tags: "", categoryIds: [],
};

export function ProductEditorPage({ id }: { id: string | null }) {
  const [form, setForm] = useState<EditorState>(EMPTY_FORM);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [externalImageUrl, setExternalImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showMedia, setShowMedia] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const categoryList = await adminGet<Category[]>("/categories");
      setCategories(categoryList);
      if (id) {
        const loaded = await adminGet<Product>(`/products/${id}`);
        setProduct(loaded);
        setForm({
          name: loaded.name,
          slug: loaded.slug,
          description: loaded.description,
          status: loaded.status,
          type: loaded.type,
          price: moneyToInput(loaded.price_cents, loaded.currency),
          compareAtPrice: loaded.compare_at_price_cents ? moneyToInput(loaded.compare_at_price_cents, loaded.currency) : "",
          sku: loaded.sku ?? "",
          stock: loaded.stock,
          manageStock: loaded.manage_stock === 1,
          featured: loaded.featured === 1,
          seoTitle: loaded.seo_title ?? "",
          seoDescription: loaded.seo_description ?? "",
          tags: (loaded.tags ?? []).join(", "),
          categoryIds: loaded.category_ids ?? [],
        });
        setVariants((loaded.variants ?? []).map((variant) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku ?? "",
          price: moneyToInput(variant.price_cents, loaded.currency),
          stock: variant.stock,
          active: variant.active === 1,
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the product.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: Event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || undefined,
        description: form.description,
        status: form.status,
        type: form.type,
        price: form.price,
        compareAtPrice: form.compareAtPrice || null,
        sku: form.sku || null,
        stock: form.stock,
        manageStock: form.manageStock,
        featured: form.featured,
        seoTitle: form.seoTitle || null,
        seoDescription: form.seoDescription || null,
        categoryIds: form.categoryIds,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        variants: form.type === "variable"
          ? variants.map((variant) => ({
            id: variant.id,
            title: variant.title,
            sku: variant.sku || null,
            price: variant.price,
            compareAtPrice: null,
            stock: variant.stock,
            options: {},
            active: variant.active,
          }))
          : [],
      };
      if (id) {
        await adminSend(`/products/${id}`, "PUT", payload);
        toast("Product saved.");
        await load();
      } else {
        const created = await adminSend<{ id: string }>("/products", "POST", payload);
        toast("Product created.");
        navigate(`/products/${created.id}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function addExternalImage() {
    if (!id || !externalImageUrl.trim()) return;
    setUploading(true);
    try {
      const media = await adminSend<{ id: string }>("/media/external", "POST", {
        url: externalImageUrl.trim(),
        alt: form.name,
      });
      await adminSend(`/products/${id}/images`, "POST", { mediaId: media.id, alt: form.name });
      setExternalImageUrl("");
      toast("External image added.");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add image URL.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(imageId: string) {
    if (!id || !window.confirm("Remove this image from the product?")) return;
    try {
      await adminSend(`/products/${id}/images/${imageId}`, "DELETE");
      toast("Image removed.");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Remove failed.", "error");
    }
  }

  async function removeProduct() {
    if (!id || !window.confirm("Delete this product? This cannot be undone.")) return;
    try {
      await adminSend(`/products/${id}`, "DELETE");
      toast("Product deleted.");
      navigate("/products");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <p class="breadcrumb"><a {...linkProps("/products")}>Products</a> / {id ? form.name || "Edit" : "New product"}</p>
          <h1>{id ? form.name || "Edit product" : "New product"}</h1>
        </div>
        <div class="page-actions">
          {id && <button type="button" class="button button--danger" onClick={removeProduct}>Delete</button>}
          <button type="submit" form="product-form" class="button button--primary" disabled={saving}>{saving ? "Saving…" : "Save product"}</button>
        </div>
      </header>

      <form id="product-form" class="editor-grid" onSubmit={save}>
        <div class="editor-main">
          <section class="card">
            <h2>Details</h2>
            <Field label="Title">
              <input required maxLength={200} value={form.name} onInput={(event) => update("name", (event.target as HTMLInputElement).value)} />
            </Field>
            <Field label="URL slug" hint={`/products/${form.slug || "generated-from-title"}`}>
              <input value={form.slug} maxLength={80} onInput={(event) => update("slug", (event.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Description" hint="Basic HTML is allowed and sanitised at render time.">
              <textarea rows={10} value={form.description} onInput={(event) => update("description", (event.target as HTMLTextAreaElement).value)} />
            </Field>
          </section>

          <section class="card">
            <h2>Media</h2>
            {!id && <p class="muted">Save the product to add images.</p>}
            {id && (
              <>
                <div class="media-grid">
                  {(product?.images ?? []).map((image) => (
                    <figure class="media-tile" key={image.id}>
                      <img src={mediaUrl(image.r2_key)} alt={image.alt} loading="lazy" />
                      <button type="button" class="media-remove" onClick={() => removeImage(image.id)} aria-label="Remove image">×</button>
                    </figure>
                  ))}

                </div>
                <div class="field">
                  <span class="field-label">External image URL</span>
                  <div class="row-actions">
                    <input
                      type="url"
                      placeholder="https://example.com/product-image.jpg"
                      value={externalImageUrl}
                      onInput={(event) => setExternalImageUrl((event.target as HTMLInputElement).value)}
                    />
                    <button type="button" class="button" disabled={uploading || !externalImageUrl.trim()} onClick={() => void addExternalImage()}>
                      {uploading ? "Adding…" : "Add URL"}
                    </button>
                  </div>
                </div>
                <p class="muted small">Use a public HTTPS image URL. File uploads require R2, which is optional.</p>
              </>
            )}
          </section>

          <section class="card">
            <div class="card-header">
              <h2>Pricing</h2>
            </div>
            <div class="form-grid">
              <Field label="Price">
                <input required inputMode="decimal" value={form.price} onInput={(event) => update("price", (event.target as HTMLInputElement).value)} />
              </Field>
              <Field label="Compare-at price" hint="Shown as a struck-through original price.">
                <input inputMode="decimal" value={form.compareAtPrice} onInput={(event) => update("compareAtPrice", (event.target as HTMLInputElement).value)} />
              </Field>
              <Field label="SKU">
                <input value={form.sku} maxLength={100} onInput={(event) => update("sku", (event.target as HTMLInputElement).value)} />
              </Field>
              <Field label="Stock">
                <input type="number" min={0} value={form.stock} onInput={(event) => update("stock", Number((event.target as HTMLInputElement).value))} />
              </Field>
            </div>
            <label class="checkbox"><input type="checkbox" checked={form.manageStock} onChange={(event) => update("manageStock", (event.target as HTMLInputElement).checked)} /> Track inventory</label>
            <label class="checkbox"><input type="checkbox" checked={form.featured} onChange={(event) => update("featured", (event.target as HTMLInputElement).checked)} /> Feature on the home page</label>
          </section>

          <section class="card">
            <div class="card-header">
              <h2>Variants</h2>
              <button type="button" class="button button--small" onClick={() => setVariants([...variants, { title: "", sku: "", price: form.price, stock: 0, active: true }])}>Add variant</button>
            </div>
            <p class="muted small">Use variants for sizes, colours or materials. A variable product needs at least one variant.</p>
            {variants.length === 0 ? <p class="muted">No variants.</p> : (
              <div class="variant-list">
                {variants.map((variant, index) => (
                  <div class="variant-row" key={variant.id ?? `new-${index}`}>
                    <input placeholder="Title (e.g. Medium / Black)" value={variant.title} onInput={(event) => {
                      const next = [...variants];
                      next[index] = { ...variant, title: (event.target as HTMLInputElement).value };
                      setVariants(next);
                    }} />
                    <input placeholder="SKU" value={variant.sku} onInput={(event) => {
                      const next = [...variants];
                      next[index] = { ...variant, sku: (event.target as HTMLInputElement).value };
                      setVariants(next);
                    }} />
                    <input placeholder="Price" inputMode="decimal" value={variant.price} onInput={(event) => {
                      const next = [...variants];
                      next[index] = { ...variant, price: (event.target as HTMLInputElement).value };
                      setVariants(next);
                    }} />
                    <input type="number" min={0} placeholder="Stock" value={variant.stock} onInput={(event) => {
                      const next = [...variants];
                      next[index] = { ...variant, stock: Number((event.target as HTMLInputElement).value) };
                      setVariants(next);
                    }} />
                    <label class="checkbox"><input type="checkbox" checked={variant.active} onChange={(event) => {
                      const next = [...variants];
                      next[index] = { ...variant, active: (event.target as HTMLInputElement).checked };
                      setVariants(next);
                    }} /> Active</label>
                    <button type="button" class="link-button link-button--danger" onClick={() => setVariants(variants.filter((_, i) => i !== index))}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section class="card">
            <h2>Search engine listing</h2>
            <Field label="SEO title">
              <input maxLength={200} value={form.seoTitle} onInput={(event) => update("seoTitle", (event.target as HTMLInputElement).value)} />
            </Field>
            <Field label="SEO description">
              <textarea rows={3} maxLength={400} value={form.seoDescription} onInput={(event) => update("seoDescription", (event.target as HTMLTextAreaElement).value)} />
            </Field>
          </section>
        </div>

        <aside class="editor-side">
          <section class="card">
            <h2>Status</h2>
            <Field label="Visibility">
              <select value={form.status} onChange={(event) => update("status", (event.target as HTMLSelectElement).value as EditorState["status"])}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Product type">
              <select value={form.type} onChange={(event) => update("type", (event.target as HTMLSelectElement).value as EditorState["type"])}>
                <option value="simple">Simple product</option>
                <option value="variable">Variable product</option>
              </select>
            </Field>
          </section>
          <section class="card">
            <h2>Organisation</h2>
            <Field label="Tags" hint="Comma-separated.">
              <input value={form.tags} onInput={(event) => update("tags", (event.target as HTMLInputElement).value)} />
            </Field>
            <fieldset class="field">
              <span class="field-label">Categories</span>
              <div class="checkbox-list">
                {categories.length === 0 && <span class="muted">No categories yet.</span>}
                {categories.map((category) => (
                  <label class="checkbox" key={category.id}>
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(category.id)}
                      onChange={(event) => {
                        const checked = (event.target as HTMLInputElement).checked;
                        update("categoryIds", checked
                          ? [...form.categoryIds, category.id]
                          : form.categoryIds.filter((value) => value !== category.id));
                      }}
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          {product && (
            <section class="card">
              <h2>Product meta</h2>
              <p class="muted small">Created {formatDate(product.created_at)}<br />Updated {formatDate(product.updated_at)}</p>
              <p class="muted small">Storefront price: {formatMoney(product.price_cents, product.currency)}</p>
            </section>
          )}
        </aside>
      </form>
      {showMedia && <Modal title="Media" onClose={() => setShowMedia(false)}><p class="muted">Use the Media page to manage uploads.</p></Modal>}
    </div>
  );
}
