import type { Database } from "@cloudcart/database";
import type { MediaRow } from "@cloudcart/database";
import { HttpError, newId, nowIso } from "@cloudcart/shared";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, { ext: string; magic: (bytes: Uint8Array) => boolean }> = {
  "image/jpeg": {
    ext: "jpg",
    magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/png": {
    ext: "png",
    magic: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  "image/gif": {
    ext: "gif",
    magic: (b) => b.length > 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  "image/webp": {
    ext: "webp",
    magic: (b) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  "image/avif": {
    ext: "avif",
    magic: (b) => b.length > 12 && String.fromCharCode(...b.slice(4, 12)).includes("ftypavif"),
  },
};

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

export function mediaUrl(r2Key: string): string {
  return /^https:\/\//i.test(r2Key) ? r2Key : `/media/${r2Key}`;
}

export interface ValidatedImage {
  bytes: Uint8Array;
  extension: string;
  contentType: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Shared validation for every provider. The bytes are read once and reused by
 * R2 or the GitHub/jsDelivr uploader.
 */
export async function prepareImageUpload(file: File): Promise<ValidatedImage> {
  if (file.size <= 0) throw new HttpError(400, "empty_file", "The uploaded file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "file_too_large", "Images must be 5 MB or smaller.");
  }
  const declaredType = (file.type || "").toLowerCase();
  const allowed = ALLOWED_TYPES[declaredType];
  if (!allowed) {
    throw new HttpError(415, "unsupported_type", "Only JPEG, PNG, GIF, WebP and AVIF images are accepted. SVG uploads are disabled.");
  }
  const filename = file.name || "upload";
  const extension = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  if (extension && EXTENSION_TYPES[extension] !== declaredType) {
    throw new HttpError(415, "extension_mismatch", "The file extension does not match its content type.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!allowed.magic(bytes)) {
    throw new HttpError(415, "content_mismatch", "The file does not look like a valid image of the declared type.");
  }
  return {
    bytes,
    extension: allowed.ext,
    contentType: declaredType,
    filename,
    sizeBytes: file.size,
  };
}

export function mediaObjectKey(id: string, extension: string, basePath = "media"): string {
  const date = new Date();
  return `${basePath}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${id}.${extension}`;
}

export interface InsertMediaInput {
  id?: string;
  key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storage: MediaRow["storage"];
  uploadedBy: string | null;
  alt?: string;
}

export async function insertMediaRow(db: Database, input: InsertMediaInput): Promise<MediaRow> {
  const id = input.id || newId("med");
  const now = nowIso();
  const filename = input.filename.slice(0, 200);
  const alt = (input.alt || "").slice(0, 300);
  await db.run(
    `INSERT INTO media (id, r2_key, filename, content_type, size_bytes, width, height, alt, uploaded_by, storage, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
    [id, input.key, filename, input.contentType, input.sizeBytes, alt, input.uploadedBy, input.storage, now],
  );
  return {
    id,
    r2_key: input.key,
    filename,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    width: null,
    height: null,
    alt,
    uploaded_by: input.uploadedBy,
    storage: input.storage,
    created_at: now,
  };
}

export async function storeR2Media(
  db: Database,
  bucket: R2Bucket,
  image: ValidatedImage,
  uploadedBy: string | null,
  alt = "",
): Promise<MediaRow> {
  const id = newId("med");
  const key = mediaObjectKey(id, image.extension);
  await bucket.put(key, image.bytes, {
    httpMetadata: {
      contentType: image.contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      originalName: image.filename.slice(0, 200),
    },
  });
  return insertMediaRow(db, {
    id,
    key,
    filename: image.filename,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    storage: "r2",
    uploadedBy,
    alt,
  });
}

/** Backwards-compatible R2 helper. New code should call prepareImageUpload + storeR2Media. */
export async function storeMedia(
  db: Database,
  bucket: R2Bucket,
  file: File,
  uploadedBy: string | null,
): Promise<MediaRow> {
  return storeR2Media(db, bucket, await prepareImageUpload(file), uploadedBy);
}

export async function deleteMedia(db: Database, bucket: R2Bucket | undefined, id: string): Promise<void> {
  const row = await db.first<{ r2_key: string; storage: MediaRow["storage"] }>(
    "SELECT r2_key, storage FROM media WHERE id = ?",
    [id],
  );
  if (!row) throw new HttpError(404, "media_not_found", "Media not found.");
  if (bucket && row.storage === "r2" && !/^https:\/\//i.test(row.r2_key)) await bucket.delete(row.r2_key);
  await db.run("DELETE FROM product_images WHERE r2_key = ?", [row.r2_key]);
  await db.run("DELETE FROM media WHERE id = ?", [id]);
}

export async function attachImageToProduct(
  db: Database,
  productId: string,
  mediaId: string,
  alt: string,
): Promise<string> {
  const media = await db.first<MediaRow>("SELECT * FROM media WHERE id = ?", [mediaId]);
  if (!media) throw new HttpError(404, "media_not_found", "Media not found.");
  const product = await db.first<{ id: string }>("SELECT id FROM products WHERE id = ?", [productId]);
  if (!product) throw new HttpError(404, "product_not_found", "Product not found.");
  const maxPosition = await db.first<{ position: number | null }>(
    "SELECT MAX(position) AS position FROM product_images WHERE product_id = ?",
    [productId],
  );
  const imageId = newId("img");
  await db.run(
    `INSERT INTO product_images (id, product_id, r2_key, alt, content_type, width, height, size_bytes, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      imageId, productId, media.r2_key, alt.slice(0, 300), media.content_type,
      media.width, media.height, media.size_bytes, (maxPosition?.position ?? -1) + 1, nowIso(),
    ],
  );
  return imageId;
}

export async function removeProductImage(db: Database, productId: string, imageId: string): Promise<void> {
  const existing = await db.first<{ id: string }>(
    "SELECT id FROM product_images WHERE id = ? AND product_id = ?",
    [imageId, productId],
  );
  if (!existing) throw new HttpError(404, "image_not_found", "Product image not found.");
  const remaining = await db.all<{ id: string }>(
    "SELECT id FROM product_images WHERE product_id = ? AND id <> ? ORDER BY position, created_at, id",
    [productId, imageId],
  );
  const now = nowIso();
  const statements = [
    db.prepare("DELETE FROM product_images WHERE id = ? AND product_id = ?", [imageId, productId]),
    ...remaining.map((row, index) => db.prepare(
      "UPDATE product_images SET position = ? WHERE id = ? AND product_id = ?",
      [index, row.id, productId],
    )),
    db.prepare("UPDATE products SET updated_at = ? WHERE id = ?", [now, productId]),
  ];
  await db.batch(statements);
}

/**
 * Reorders a product's images. The submitted list must contain exactly the
 * current image IDs, so a concurrent add/remove cannot silently drop images.
 */
export async function reorderProductImages(
  db: Database,
  productId: string,
  imageIds: string[],
): Promise<void> {
  const product = await db.first<{ id: string }>("SELECT id FROM products WHERE id = ?", [productId]);
  if (!product) throw new HttpError(404, "product_not_found", "Product not found.");
  if (!Array.isArray(imageIds) || imageIds.length === 0 || imageIds.length > 100) {
    throw new HttpError(400, "invalid_image_order", "Provide between 1 and 100 image IDs.");
  }
  const unique = new Set(imageIds);
  if (unique.size !== imageIds.length) {
    throw new HttpError(400, "invalid_image_order", "Image IDs must be unique.");
  }
  const rows = await db.all<{ id: string }>(
    "SELECT id FROM product_images WHERE product_id = ? ORDER BY position, created_at, id",
    [productId],
  );
  if (rows.length !== imageIds.length) {
    throw new HttpError(409, "image_list_stale", "The product images changed. Reload and try again.");
  }
  const current = new Set(rows.map((row) => row.id));
  if (imageIds.some((id) => !current.has(id))) {
    throw new HttpError(400, "invalid_image_order", "Every image must belong to this product.");
  }
  const now = nowIso();
  await db.batch([
    ...imageIds.map((id, index) => db.prepare(
      "UPDATE product_images SET position = ? WHERE id = ? AND product_id = ?",
      [index, id, productId],
    )),
    db.prepare("UPDATE products SET updated_at = ? WHERE id = ?", [now, productId]),
  ]);
}

export async function listMedia(db: Database, page: number, perPage: number): Promise<{ items: MediaRow[]; total: number }> {
  const [count, list] = await db.batch([
    db.prepare("SELECT COUNT(*) AS count FROM media"),
    db.prepare("SELECT * FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?", [perPage, (page - 1) * perPage]),
  ]);
  return {
    items: (list?.results ?? []) as unknown as MediaRow[],
    total: Number((count?.results?.[0] as { count?: number } | undefined)?.count ?? 0),
  };
}

export function isSafeMediaKey(key: string): boolean {
  return /^media\/\d{4}\/\d{2}\/[a-z]+_[a-f0-9]+\.[a-z0-9]{2,5}$/.test(key) &&
    !key.includes("..");
}
