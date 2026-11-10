import { useState } from "preact/hooks";
import { adminGet, adminSend } from "../api";
import { ErrorBox, Loading, Pagination, toast, useAsync } from "../components";
import { MediaUploader } from "../media-uploader";
import type { MediaAsset } from "../types";

function mediaUrl(key: string): string {
  return /^https:\/\//i.test(key) ? key : `/media/${key}`;
}

function storageLabel(storage: string): string {
  if (storage === "jsdelivr") return "jsDelivr";
  if (storage === "r2") return "R2";
  return "External";
}

export function MediaPage() {
  const [page, setPage] = useState(1);
  const [externalUrl, setExternalUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const { data, loading, error, reload } = useAsync(
    () => adminGet<{ items: MediaAsset[]; total: number }>(`/media?page=${page}&perPage=24`),
    [page],
  );

  async function addExternalUrl(event: Event) {
    event.preventDefault();
    if (!externalUrl.trim()) return;
    setAddingUrl(true);
    try {
      await adminSend("/media/external", "POST", { url: externalUrl.trim() });
      setExternalUrl("");
      toast("External image added.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add image URL.", "error");
    } finally {
      setAddingUrl(false);
    }
  }

  async function remove(media: MediaAsset) {
    if (!window.confirm(`Delete ${media.filename}? Products using it will lose the image.`)) return;
    try {
      await adminSend(`/media/${media.id}`, "DELETE");
      toast("Image deleted.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  }

  async function copy(media: MediaAsset) {
    try {
      const url = /^https:\/\//i.test(media.r2_key)
        ? media.r2_key
        : `${window.location.origin}/media/${media.r2_key}`;
      await navigator.clipboard.writeText(url);
      toast("Image URL copied.");
    } catch {
      toast("Could not copy to the clipboard.", "error");
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Media</h1>
          <p class="muted">Upload images for products and page content. Choose R2 or jsDelivr for each upload.</p>
        </div>
      </header>
      <section class="card">
        <MediaUploader
          label="Upload image"
          onUploaded={async () => {
            await reload();
          }}
        />
        <details class="media-advanced">
          <summary>Advanced: external image URL</summary>
          <form class="toolbar" onSubmit={addExternalUrl}>
            <input
              type="url"
              placeholder="https://example.com/product-image.jpg"
              value={externalUrl}
              onInput={(event) => setExternalUrl((event.target as HTMLInputElement).value)}
              aria-label="External image URL"
            />
            <button type="submit" class="button" disabled={addingUrl || !externalUrl.trim()}>
              {addingUrl ? "Adding…" : "Add image URL"}
            </button>
          </form>
          <p class="muted small">Register an existing public HTTPS image without storing a copy.</p>
        </details>
        {(data?.items ?? []).length === 0 ? (
          <div class="empty-state"><h3>No media yet</h3><p>Upload an image or add a public HTTPS URL to use it in products and page content.</p></div>
        ) : (
          <div class="media-library">
            {(data?.items ?? []).map((media) => (
              <figure class="media-card" key={media.id}>
                <img src={mediaUrl(media.r2_key)} alt={media.alt} loading="lazy" />
                <figcaption>
                  <span class="media-name" title={media.filename}>{media.filename}</span>
                  <span class="muted small">
                    <span class={`storage-badge storage-badge--${media.storage || "external"}`}>{storageLabel(media.storage || "external")}</span>
                    {" · "}
                    {media.content_type === "image/external" ? "External URL" : `${Math.round(media.size_bytes / 1024)} KB`}
                  </span>
                  <div class="row-actions">
                    <button type="button" class="link-button" onClick={() => copy(media)}>Copy URL</button>
                    <button type="button" class="link-button link-button--danger" onClick={() => remove(media)}>Delete</button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <Pagination page={page} perPage={24} total={data?.total ?? 0} onChange={setPage} />
      </section>
    </div>
  );
}
