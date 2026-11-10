import { useEffect, useRef, useState } from "preact/hooks";
import { adminGet, adminUpload } from "./api";
import { toast } from "./components";
import { linkProps } from "./router";
import type { MediaAsset, MediaStorageProvider, MediaStorageStatus } from "./types";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/avif";

export function MediaUploader({
  alt = "",
  label = "Upload images",
  disabled = false,
  onUploaded,
}: {
  alt?: string;
  label?: string;
  disabled?: boolean;
  onUploaded: (media: MediaAsset) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<MediaStorageStatus | null>(null);
  const [storage, setStorage] = useState<MediaStorageProvider>("jsdelivr");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    adminGet<MediaStorageStatus>("/media/storage")
      .then((next) => {
        if (!active) return;
        setStatus(next);
        setStorage(next.effectiveDefault);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load storage settings.");
      });
    return () => {
      active = false;
    };
  }, []);

  function available(provider: MediaStorageProvider): boolean {
    return Boolean(status?.providers[provider]?.available);
  }

  function reason(provider: MediaStorageProvider): string | undefined {
    return status?.providers[provider]?.reason;
  }

  async function upload() {
    if (files.length === 0 || !status) return;
    if (!available(storage)) {
      setError(reason(storage) || "Choose an available storage provider.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        if (alt) form.append("alt", alt);
        form.append("storage", storage);
        const media = await adminUpload<MediaAsset>("/media", form);
        await onUploaded(media);
      }
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      toast(files.length === 1 ? "Image uploaded." : "Images uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      toast(err instanceof Error ? err.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  }

  const noProvider = status !== null && !available("r2") && !available("jsdelivr");

  return (
    <div class="media-uploader">
      <div class="media-uploader-row">
        <label class="field media-uploader-storage">
          <span class="field-label">Storage</span>
          <select
            value={storage}
            disabled={uploading || noProvider}
            onChange={(event) => setStorage((event.target as HTMLSelectElement).value as MediaStorageProvider)}
          >
            <option value="r2" disabled={!available("r2")}>R2{available("r2") ? "" : " — not configured"}</option>
            <option value="jsdelivr" disabled={!available("jsdelivr")}>jsDelivr{available("jsdelivr") ? "" : " — not configured"}</option>
          </select>
        </label>
        <div class="field media-uploader-file">
          <span class="field-label">{label}</span>
          <label class="media-uploader-pick">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              aria-label={label}
              disabled={uploading || disabled || noProvider}
              onChange={(event) => setFiles(Array.from((event.target as HTMLInputElement).files ?? []))}
            />
            <span class="media-uploader-pick-button">Choose files</span>
            <span class={`media-uploader-pick-value${files.length === 0 ? " media-uploader-pick-value--empty" : ""}`}>
              {files.length === 0 ? "No files selected" : files.map((file) => file.name).join(", ")}
            </span>
          </label>
        </div>
        <button
          type="button"
          class="button button--primary"
          disabled={uploading || disabled || files.length === 0 || !status || !available(storage)}
          onClick={() => void upload()}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      <p class="muted small media-uploader-hint">
        JPEG, PNG, GIF, WebP or AVIF. Maximum 5 MB. SVG uploads are disabled.
      </p>
      {status && reason(storage) && !available(storage) && (
        <p class="muted small">{reason(storage)}</p>
      )}
      {noProvider && (
        <p class="muted small">
          No upload storage is configured. <a class="text-link" {...linkProps("/settings")}>Configure media storage</a>.
        </p>
      )}
      {status?.providers.jsdelivr.available && storage === "jsdelivr" && (
        <p class="muted small">
          jsDelivr stores files in a public GitHub repository. Review jsDelivr's terms for commercial catalogs.
        </p>
      )}
      {error && <div class="error-box" role="alert">{error}</div>}
    </div>
  );
}
