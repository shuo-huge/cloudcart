import { useState } from "preact/hooks";
import { adminGet, adminSend, adminUpload } from "../api";
import { ErrorBox, Loading, Pagination, toast, useAsync } from "../components";

interface MediaRow {
  id: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  alt: string;
  created_at: string;
}

function mediaUrl(key: string): string {
  return /^https:\/\//i.test(key) ? key : `/media/${key}`;
}

export function MediaPage() {
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const { data, loading, error, reload } = useAsync(
    () => adminGet<{ items: MediaRow[]; total: number }>(`/media?page=${page}&perPage=24`),
    [page],
  );

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await adminUpload("/media", form);
      toast("Image uploaded.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  }

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

  async function remove(media: MediaRow) {
    if (!window.confirm(`Delete ${media.filename}? Products using it will lose the image.`)) return;
    try {
      await adminSend(`/media/${media.id}`, "DELETE");
      toast("Image deleted.");
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    }
  }

  async function copy(media: MediaRow) {
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
          <p class="muted">Add public HTTPS image URLs now. File uploads become available if you enable R2 later.</p>
        </div>
        <label class="button button--primary">
          {uploading ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
            hidden
            disabled={uploading}
            onChange={(event) => {
              const file = (event.target as HTMLInputElement).files?.[0];
              if (file) void upload(file);
              (event.target as HTMLInputElement).value = "";
            }}
          />
        </label>
      </header>
      <section class="card">
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
        {(data?.items ?? []).length === 0 ? (
          <div class="empty-state"><h3>No media yet</h3><p>Add a public HTTPS image URL to use it in products and page content.</p></div>
        ) : (
          <div class="media-library">
            {(data?.items ?? []).map((media) => (
              <figure class="media-card" key={media.id}>
                <img src={mediaUrl(media.r2_key)} alt={media.alt} loading="lazy" />
                <figcaption>
                  <span class="media-name" title={media.filename}>{media.filename}</span>
                  <span class="muted small">{media.content_type === "image/external" ? "External URL" : `${Math.round(media.size_bytes / 1024)} KB`}</span>
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
