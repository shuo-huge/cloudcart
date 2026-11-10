import fs from "node:fs/promises";
import {
  flagBool,
  flagList,
  flagString,
  requirePositional,
} from "../args.mjs";
import { CliError, requireConfirmation, usageError } from "../errors.mjs";
import {
  integerFlag,
  readFileBytes,
  readJsonInput,
  readTextInput,
  splitList,
  stripUndefined,
} from "../io.mjs";
import { minorToDecimal, moneyString } from "../money.mjs";

function unwrap(body) {
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

function unwrapUpload(result) {
  return unwrap(unwrap(result));
}

function mimeForFile(filePath) {
  const extension = String(filePath).toLowerCase().split(".").pop();
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
  }[extension] || "application/octet-stream";
}

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PRIVATE_HOST = /^(127\.|10\.|192\.168\.|169\.254\.)/;

function validateRemoteImageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw usageError(`Invalid image URL: ${value}`);
  }
  const host = url.hostname.toLowerCase();
  const privateHost = host === "localhost" || host.endsWith(".local") || PRIVATE_HOST.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::1" || host === "[::1]";
  if (url.protocol !== "https:" || url.username || url.password || privateHost) {
    throw usageError("Image URLs must be public HTTPS URLs without credentials.");
  }
  return url;
}

export async function downloadImage(value, { fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  let url = validateRemoteImageUrl(value);
  let response;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    try {
      response = await fetchImpl(url, {
        redirect: "manual",
        headers: {
          Accept: "image/*",
          "User-Agent": "CloudCartCLI/0.5.0 (+https://github.com/shuo-huge/cloudcart)",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new CliError(`Could not download ${url}: ${error instanceof Error ? error.message : String(error)}`, {
        code: "image_download_failed",
        exitCode: 8,
      });
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new CliError("Image redirect did not include a Location.", { code: "image_download_failed", exitCode: 8 });
    url = validateRemoteImageUrl(new URL(location, url).toString());
  }
  if (!response || !response.ok) {
    throw new CliError(`Image download failed (HTTP ${response?.status ?? "unknown"}).`, {
      code: "image_download_failed",
      exitCode: 8,
    });
  }
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES[contentType]) {
    throw new CliError("The URL did not return a JPEG, PNG, GIF, WebP or AVIF image.", {
      code: "unsupported_image_type",
      exitCode: 2,
    });
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new CliError("Images must be 5 MB or smaller.", { code: "file_too_large", exitCode: 2 });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new CliError("Images must be between 1 byte and 5 MB.", { code: "file_too_large", exitCode: 2 });
  }
  const pathName = decodeURIComponent(url.pathname.split("/").pop() || "image");
  const base = pathName.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  return {
    bytes,
    filename: `${base}.${IMAGE_TYPES[contentType]}`,
    contentType,
  };
}

async function attachExternalUrl(client, productId, url, alt) {
  if (typeof url !== "string") throw usageError("--image needs a URL.");
  const media = unwrap(await client.requestJson("POST", "/api/admin/media/external", {
    body: { url, alt: alt || "" },
  }));
  return client.requestJson("POST", `/api/admin/products/${productId}/images`, {
    body: { mediaId: media.id, alt: alt || "" },
  });
}

async function attachUrl(client, productId, url, alt, { storage, external } = {}) {
  if (external) return attachExternalUrl(client, productId, url, alt);
  const image = await downloadImage(url);
  const media = unwrapUpload(await client.uploadFile("/api/admin/media", {
    ...image,
    alt: alt || "",
    storage,
  }));
  return client.requestJson("POST", `/api/admin/products/${productId}/images`, {
    body: { mediaId: media.id, alt: alt || "" },
  });
}

async function attachFile(client, productId, filePath, alt, { storage } = {}) {
  const bytes = await readFileBytes(filePath);
  const media = unwrapUpload(await client.uploadFile("/api/admin/media", {
    bytes,
    filename: String(filePath).split(/[\\/]/).pop() || "image",
    contentType: mimeForFile(filePath),
    alt: alt || "",
    storage,
  }));
  return client.requestJson("POST", `/api/admin/products/${productId}/images`, {
    body: { mediaId: media.id, alt: alt || "" },
  });
}

async function attachFlags(client, productId, flags) {
  const urls = flagList(flags, "image");
  const files = flagList(flags, "image-file");
  const alt = flagString(flags, "alt");
  const storage = flagString(flags, "storage");
  const external = flagBool(flags, "external");
  if (external && storage) throw usageError("--external cannot be combined with --storage.");
  if (external && files.length > 0) throw usageError("--external only applies to URL images; local files are always uploaded to storage.");
  for (const url of urls) await attachUrl(client, productId, url, alt, { storage, external });
  for (const file of files) await attachFile(client, productId, file, alt, { storage });
}

function productFlags(flags) {
  const payload = {
    name: flagString(flags, "name"),
    slug: flagString(flags, "slug"),
    description: flagString(flags, "description"),
    status: flagString(flags, "status"),
    type: flagString(flags, "type"),
    price: flagString(flags, "price"),
    compareAtPrice: flagString(flags, "compare-at-price"),
    sku: flagString(flags, "sku"),
    stock: flags.stock !== undefined ? integerFlag(flags.stock, "stock") : undefined,
    manageStock: flags["manage-stock"] !== undefined ? flagBool(flags, "manage-stock") : undefined,
    featured: flags.featured !== undefined ? flagBool(flags, "featured") : undefined,
    seoTitle: flagString(flags, "seo-title"),
    seoDescription: flagString(flags, "seo-description"),
    categoryIds: flags["category-id"] !== undefined ? flagList(flags, "category-id") : undefined,
    tags: flags.tag !== undefined ? flagList(flags, "tag") : undefined,
  };
  return stripUndefined(payload);
}

async function productPayload(flags, currency = "USD") {
  if (flags.data !== undefined) {
    const parsed = await readJsonInput(flags.data, "product JSON");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw usageError("Product JSON must be an object.");
    }
    return parsed;
  }
  const payload = productFlags(flags);
  if (!payload.name) throw usageError("Missing --name.");
  if (!payload.price) throw usageError("Missing --price.");
  payload.price = moneyString(payload.price, currency, "price");
  if (payload.compareAtPrice) payload.compareAtPrice = moneyString(payload.compareAtPrice, currency, "compare-at-price");
  if (flags["description-file"]) payload.description = await readTextInput(undefined, flags["description-file"], "description");
  else payload.description = payload.description ?? "";
  payload.status = payload.status || "draft";
  payload.type = payload.type || "simple";
  payload.stock = payload.stock ?? 0;
  payload.manageStock = payload.manageStock ?? true;
  payload.featured = payload.featured ?? false;
  payload.categoryIds = payload.categoryIds ?? [];
  payload.tags = payload.tags ?? [];
  payload.variants = flags["variants-file"]
    ? await readJsonInput(`@${flags["variants-file"]}`, "variants JSON")
    : flags.variants !== undefined
      ? await readJsonInput(flags.variants, "variants JSON")
      : [];
  if (!Array.isArray(payload.variants)) throw usageError("variants must be an array.");
  return payload;
}

function productFromAdmin(product) {
  const currency = product.currency || "USD";
  return {
    name: product.name,
    slug: product.slug,
    description: product.description || "",
    status: product.status,
    type: product.type,
    price: minorToDecimal(product.price_cents, currency),
    compareAtPrice: product.compare_at_price_cents == null
      ? null
      : minorToDecimal(product.compare_at_price_cents, currency),
    sku: product.sku,
    stock: product.stock,
    manageStock: Boolean(product.manage_stock),
    featured: Boolean(product.featured),
    seoTitle: product.seo_title,
    seoDescription: product.seo_description,
    categoryIds: product.category_ids || [],
    tags: product.tags || [],
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      price: minorToDecimal(variant.price_cents, currency),
      compareAtPrice: variant.compare_at_price_cents == null
        ? null
        : minorToDecimal(variant.compare_at_price_cents, currency),
      stock: variant.stock,
      options: (() => {
        try { return JSON.parse(variant.options_json || "{}"); } catch { return {}; }
      })(),
      active: Boolean(variant.active),
    })),
    imageIds: (product.images || []).map((image) => image.id),
  };
}

function mergeProductFlags(payload, flags, currency) {
  const updates = productFlags(flags);
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.slug !== undefined) payload.slug = updates.slug;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.type !== undefined) payload.type = updates.type;
  if (updates.price !== undefined) payload.price = moneyString(updates.price, currency, "price");
  if (updates.compareAtPrice !== undefined) {
    payload.compareAtPrice = updates.compareAtPrice ? moneyString(updates.compareAtPrice, currency, "compare-at-price") : null;
  }
  if (updates.sku !== undefined) payload.sku = updates.sku;
  if (updates.stock !== undefined) payload.stock = updates.stock;
  if (updates.manageStock !== undefined) payload.manageStock = updates.manageStock;
  if (updates.featured !== undefined) payload.featured = updates.featured;
  if (updates.seoTitle !== undefined) payload.seoTitle = updates.seoTitle;
  if (updates.seoDescription !== undefined) payload.seoDescription = updates.seoDescription;
  if (updates.categoryIds !== undefined) payload.categoryIds = updates.categoryIds;
  if (updates.tags !== undefined) payload.tags = updates.tags;
  return payload;
}

export async function productsList(ctx) {
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("GET", "/api/admin/products", {
    query: {
      page: flagString(ctx.flags, "page") || 1,
      perPage: flagString(ctx.flags, "per-page") || 20,
      q: flagString(ctx.flags, "q") || "",
      status: flagString(ctx.flags, "status") || "",
    },
  }));
  return { data };
}

export async function productsGet(ctx) {
  const id = requirePositional(ctx.args, 0, "product id");
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", `/api/admin/products/${encodeURIComponent(id)}`)) };
}

export async function productsCreate(ctx) {
  const client = ctx.requireClient();
  const payload = await productPayload(ctx.flags, await ctx.getCurrency());
  const result = unwrap(await client.requestJson("POST", "/api/admin/products", { body: payload }));
  if (!result?.id) return { data: result, message: "Product create request planned." };
  await attachFlags(client, result.id, ctx.flags);
  const product = unwrap(await client.requestJson("GET", `/api/admin/products/${encodeURIComponent(result.id)}`));
  return {
    data: product,
    message: `Created product ${product.id} (${product.slug}).`,
  };
}

export async function productsUpdate(ctx) {
  const id = requirePositional(ctx.args, 0, "product id");
  const client = ctx.requireClient();
  const current = unwrap(await client.requestJson("GET", `/api/admin/products/${encodeURIComponent(id)}`));
  const payload = ctx.flags.data !== undefined
    ? await readJsonInput(ctx.flags.data, "product JSON")
    : mergeProductFlags(productFromAdmin(current), ctx.flags, current.currency || "USD");
  if (ctx.flags["description-file"]) {
    payload.description = await readTextInput(undefined, ctx.flags["description-file"], "description");
  }
  if (ctx.flags["variants-file"]) {
    payload.variants = await readJsonInput(`@${ctx.flags["variants-file"]}`, "variants JSON");
  } else if (ctx.flags.variants !== undefined) {
    payload.variants = await readJsonInput(ctx.flags.variants, "variants JSON");
  }
  await client.requestJson("PUT", `/api/admin/products/${encodeURIComponent(id)}`, { body: payload });
  await attachFlags(client, id, ctx.flags);
  const product = unwrap(await client.requestJson("GET", `/api/admin/products/${encodeURIComponent(id)}`));
  return { data: product, message: `Updated product ${id} (${product.slug}).` };
}

export async function productsStatus(ctx) {
  const id = requirePositional(ctx.args, 0, "product id");
  const status = requirePositional(ctx.args, 1, "status (draft|active|archived)");
  const client = ctx.requireClient();
  await client.requestJson("POST", `/api/admin/products/${encodeURIComponent(id)}/status`, { body: { status } });
  return { data: { id, status }, message: `Set product ${id} to ${status}.` };
}

export async function productsDelete(ctx) {
  requireConfirmation(ctx.flags, "Deleting a product");
  const id = requirePositional(ctx.args, 0, "product id");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/products/${encodeURIComponent(id)}${ctx.flags["delete-media"] ? "?deleteMedia=true" : ""}`);
  return { data: { id, deleted: true }, message: `Deleted product ${id}.` };
}

export async function productImagesAdd(ctx) {
  const productId = requirePositional(ctx.args, 0, "product id");
  const mediaId = requirePositional(ctx.args, 1, "media id");
  const client = ctx.requireClient();
  await client.requestJson("POST", `/api/admin/products/${encodeURIComponent(productId)}/images`, {
    body: { mediaId, alt: flagString(ctx.flags, "alt") || "" },
  });
  return { data: { productId, mediaId }, message: `Attached media ${mediaId} to ${productId}.` };
}

export async function productImagesAttach(ctx) {
  const productId = requirePositional(ctx.args, 0, "product id");
  const client = ctx.requireClient();
  const url = flagString(ctx.flags, "image-url") || flagString(ctx.flags, "image");
  const file = flagString(ctx.flags, "file") || flagString(ctx.flags, "image-file");
  const storage = flagString(ctx.flags, "storage");
  const external = flagBool(ctx.flags, "external");
  if (!url && !file) throw usageError("Use --image-url https://... or --file ./photo.jpg.");
  if (external && storage) throw usageError("--external cannot be combined with --storage.");
  if (external && file) throw usageError("--external only applies to URL images; local files are always uploaded to storage.");
  if (url) await attachUrl(client, productId, url, flagString(ctx.flags, "alt"), { storage, external });
  if (file) await attachFile(client, productId, file, flagString(ctx.flags, "alt"), { storage });
  return { data: { productId, attached: true }, message: `Attached image to ${productId}.` };
}

export async function productImagesRemove(ctx) {
  requireConfirmation(ctx.flags, "Removing a product image");
  const productId = requirePositional(ctx.args, 0, "product id");
  const imageId = requirePositional(ctx.args, 1, "product image id");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`);
  return { data: { productId, imageId, removed: true }, message: `Removed image ${imageId}.` };
}

export async function productImagesOrder(ctx) {
  const productId = requirePositional(ctx.args, 0, "product id");
  const imageIds = ctx.args.slice(1).flatMap((value) => splitList(value));
  if (imageIds.length === 0) throw usageError("Pass the product image ids in the desired order.");
  const client = ctx.requireClient();
  await client.requestJson("PUT", `/api/admin/products/${encodeURIComponent(productId)}/images/order`, {
    body: { imageIds },
  });
  return { data: { productId, imageIds }, message: `Reordered ${imageIds.length} product images.` };
}

export async function mediaList(ctx) {
  const client = ctx.requireClient();
  return {
    data: unwrap(await client.requestJson("GET", "/api/admin/media", {
      query: {
        page: flagString(ctx.flags, "page") || 1,
        perPage: flagString(ctx.flags, "per-page") || 20,
      },
    })),
  };
}

export async function mediaAddUrl(ctx) {
  const url = requirePositional(ctx.args, 0, "HTTPS image URL");
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", "/api/admin/media/external", {
    body: { url, alt: flagString(ctx.flags, "alt") || "" },
  }));
  return { data, message: `Added external media ${data.id}.` };
}

export async function mediaUpload(ctx) {
  const file = requirePositional(ctx.args, 0, "image file");
  const client = ctx.requireClient();
  const bytes = await readFileBytes(file);
  const data = unwrapUpload(await client.uploadFile("/api/admin/media", {
    bytes,
    filename: file.split(/[\\/]/).pop() || "image",
    contentType: mimeForFile(file),
    alt: flagString(ctx.flags, "alt") || "",
    storage: flagString(ctx.flags, "storage"),
  }));
  return { data, message: `Uploaded media ${data.id} (${data.storage}).` };
}

export async function mediaImportUrl(ctx) {
  const url = requirePositional(ctx.args, 0, "HTTPS image URL");
  const client = ctx.requireClient();
  const image = await downloadImage(url);
  const data = unwrapUpload(await client.uploadFile("/api/admin/media", {
    ...image,
    alt: flagString(ctx.flags, "alt") || "",
    storage: flagString(ctx.flags, "storage"),
  }));
  return { data, message: `Imported media ${data.id} into ${data.storage}.` };
}

export async function mediaStorage(ctx) {
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", "/api/admin/media/storage")) };
}

export async function mediaDelete(ctx) {
  requireConfirmation(ctx.flags, "Deleting media");
  const id = requirePositional(ctx.args, 0, "media id");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/media/${encodeURIComponent(id)}`);
  return { data: { id, deleted: true }, message: `Deleted media ${id}.` };
}

function categoryPayload(flags) {
  return stripUndefined({
    name: flagString(flags, "name"),
    slug: flagString(flags, "slug"),
    description: flagString(flags, "description"),
    parentId: flagString(flags, "parent-id"),
    position: flags.position !== undefined ? integerFlag(flags.position, "position") : undefined,
    seoTitle: flagString(flags, "seo-title"),
    seoDescription: flagString(flags, "seo-description"),
  });
}

export async function categoriesList(ctx) {
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", "/api/admin/categories")) };
}

export async function categoriesCreate(ctx) {
  const payload = categoryPayload(ctx.flags);
  if (!payload.name) throw usageError("Missing --name.");
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", "/api/admin/categories", { body: payload }));
  return { data, message: `Created category ${data.id}.` };
}

export async function categoriesUpdate(ctx) {
  const id = requirePositional(ctx.args, 0, "category id");
  const client = ctx.requireClient();
  const categories = unwrap(await client.requestJson("GET", "/api/admin/categories"));
  const current = (Array.isArray(categories) ? categories : categories.items || []).find((item) => item.id === id);
  if (!current) throw usageError(`Category not found: ${id}`);
  const payload = {
    name: current.name,
    slug: current.slug,
    description: current.description || "",
    parentId: current.parent_id || null,
    position: current.position ?? 0,
    seoTitle: current.seo_title || null,
    seoDescription: current.seo_description || null,
    ...categoryPayload(ctx.flags),
  };
  await client.requestJson("PUT", `/api/admin/categories/${encodeURIComponent(id)}`, { body: payload });
  return { data: { id, ...payload }, message: `Updated category ${id}.` };
}

export async function categoriesDelete(ctx) {
  requireConfirmation(ctx.flags, "Deleting a category");
  const id = requirePositional(ctx.args, 0, "category id");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/categories/${encodeURIComponent(id)}`);
  return { data: { id, deleted: true }, message: `Deleted category ${id}.` };
}

export function validatePageDocumentClient(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw usageError("Page document must be an object.");
  }
  if (!Number.isInteger(document.version) || document.version < 1 || document.version > 1000) {
    throw usageError("Page document version must be an integer between 1 and 1000.");
  }
  if (typeof document.page !== "string" || !document.page || document.page.length > 80) {
    throw usageError("Page document.page must be a slug of 1–80 characters.");
  }
  if (!Array.isArray(document.sections) || document.sections.length > 100) {
    throw usageError("Page document.sections must be an array of at most 100 sections.");
  }
  for (const section of document.sections) {
    if (!section || typeof section !== "object" || typeof section.id !== "string" || typeof section.type !== "string") {
      throw usageError("Every page section needs id, type, enabled and settings.");
    }
    if (typeof section.enabled !== "boolean" || !section.settings || typeof section.settings !== "object") {
      throw usageError(`Section ${section.id} needs enabled and settings.`);
    }
  }
  const serialized = JSON.stringify(document);
  if (Buffer.byteLength(serialized, "utf8") > 256 * 1024) throw usageError("Page document exceeds 256 KiB.");
  if (/<script/i.test(serialized)) throw usageError("Page documents cannot contain <script> tags.");
  return document;
}

async function pageDocumentFromFlags(flags) {
  const parsed = await readJsonInput(flags.data, "page document");
  return validatePageDocumentClient(parsed && typeof parsed === "object" && "document" in parsed ? parsed.document : parsed);
}

export async function pagesList(ctx) {
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", "/api/admin/pages")) };
}

export async function pagesGet(ctx) {
  const slug = requirePositional(ctx.args, 0, "page slug");
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", `/api/admin/pages/${encodeURIComponent(slug)}`)) };
}

export async function pagesCreate(ctx) {
  const title = flagString(ctx.flags, "title");
  const slug = flagString(ctx.flags, "slug");
  if (!title || !slug) throw usageError("Both --title and --slug are required.");
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", "/api/admin/pages", { body: { title, slug } }));
  return { data, message: `Created page ${data.slug || slug}.` };
}

export async function pagesDraft(ctx) {
  const slug = requirePositional(ctx.args, 0, "page slug");
  const document = await pageDocumentFromFlags(ctx.flags);
  if (document.page !== slug) throw usageError(`document.page must match the page slug (${slug}).`);
  const client = ctx.requireClient();
  await client.requestJson("PUT", `/api/admin/pages/${encodeURIComponent(slug)}/draft`, { body: { document } });
  return { data: { slug, version: document.version, sections: document.sections.length }, message: `Saved draft for ${slug}.` };
}

export async function pagesPublish(ctx) {
  const slug = requirePositional(ctx.args, 0, "page slug");
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", `/api/admin/pages/${encodeURIComponent(slug)}/publish`, { body: {} }));
  return { data: { slug, ...data }, message: `Published ${slug} (version ${data.version}).` };
}

export async function pagesVersions(ctx) {
  const slug = requirePositional(ctx.args, 0, "page slug");
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", `/api/admin/pages/${encodeURIComponent(slug)}/versions`)) };
}

export async function pagesVersion(ctx) {
  const slug = requirePositional(ctx.args, 0, "page slug");
  const version = requirePositional(ctx.args, 1, "version");
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", `/api/admin/pages/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`)) };
}

export async function pagesRestore(ctx) {
  const slug = requirePositional(ctx.args, 0, "page slug");
  const version = requirePositional(ctx.args, 1, "version");
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", `/api/admin/pages/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/restore`, { body: {} }));
  return { data, message: `Restored ${slug} version ${version} into the draft.` };
}

export async function pagesPreview(ctx) {
  const slug = requirePositional(ctx.args, 0, "page slug");
  const document = await pageDocumentFromFlags(ctx.flags);
  if (document.page !== slug) throw usageError(`document.page must match the page slug (${slug}).`);
  const client = ctx.requireClient();
  const result = await client.request("POST", `/api/admin/pages/${encodeURIComponent(slug)}/preview`, {
    body: { document },
  });
  const html = typeof result.data === "string" ? result.data : result.text;
  if (flagString(ctx.flags, "out")) {
    await fs.writeFile(flagString(ctx.flags, "out"), html, "utf8");
    return { data: { slug, out: flagString(ctx.flags, "out") }, message: `Wrote preview to ${flagString(ctx.flags, "out")}.` };
  }
  return { data: { slug, html }, message: html };
}

export async function pagesRename(ctx) {
  const slug = requirePositional(ctx.args, 0, "page slug");
  const title = flagString(ctx.flags, "title");
  if (!title) throw usageError("Missing --title.");
  const client = ctx.requireClient();
  await client.requestJson("PUT", `/api/admin/pages/${encodeURIComponent(slug)}`, { body: { title } });
  return { data: { slug, title }, message: `Renamed ${slug} to "${title}".` };
}

export async function pagesDelete(ctx) {
  requireConfirmation(ctx.flags, "Deleting a page");
  const slug = requirePositional(ctx.args, 0, "page slug");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/pages/${encodeURIComponent(slug)}`);
  return { data: { slug, deleted: true }, message: `Deleted page ${slug}.` };
}

function blogDocument(slug, title, text, flags) {
  const heroTitle = flagString(flags, "heading") || title;
  const cover = flagString(flags, "cover-image");
  const excerpt = flagString(flags, "excerpt");
  const sections = [];
  if (cover || excerpt) {
    sections.push({
      id: `${slug}-hero`,
      type: "hero",
      enabled: true,
      settings: {
        title: heroTitle,
        subtitle: excerpt || "",
        image: cover || "",
        imageAlt: flagString(flags, "cover-alt") || title,
        buttonText: "",
        buttonUrl: "",
      },
    });
  }
  sections.push({
    id: `${slug}-content`,
    type: "rich-text",
    enabled: true,
    settings: {
      title: cover || excerpt ? "" : heroTitle,
      text: text || "<p></p>",
    },
  });
  return validatePageDocumentClient({ version: 1, page: slug, sections });
}

async function blogBody(flags) {
  if (flags.data !== undefined) {
    const parsed = await readJsonInput(flags.data, "page document");
    return validatePageDocumentClient(parsed && typeof parsed === "object" && "document" in parsed ? parsed.document : parsed);
  }
  const text = await readTextInput(flags.text, flags["text-file"], "blog text");
  return text;
}

export async function blogList(ctx) {
  const pages = unwrap(await ctx.requireClient().requestJson("GET", "/api/admin/pages"));
  const q = (flagString(ctx.flags, "q") || "").toLowerCase();
  const status = flagString(ctx.flags, "status") || "all";
  const items = (Array.isArray(pages) ? pages : []).filter((page) => {
    if (page.type !== "content") return false;
    if (q && !`${page.title} ${page.slug}`.toLowerCase().includes(q)) return false;
    if (status === "published") return Boolean(page.published_version);
    if (status === "draft") return !page.published_version;
    return true;
  });
  return { data: { items } };
}

export async function blogGet(ctx) {
  return pagesGet(ctx);
}

export async function blogCreate(ctx) {
  const title = flagString(ctx.flags, "title");
  const slug = flagString(ctx.flags, "slug");
  if (!title || !slug) throw usageError("Both --title and --slug are required.");
  const body = await blogBody(ctx.flags);
  const client = ctx.requireClient();
  const page = unwrap(await client.requestJson("POST", "/api/admin/pages", { body: { title, slug } }));
  let document;
  if (typeof body === "string") {
    document = blogDocument(slug, title, body, ctx.flags);
  } else {
    document = body;
    if (document.page !== slug) throw usageError(`document.page must match the blog slug (${slug}).`);
  }
  await client.requestJson("PUT", `/api/admin/pages/${encodeURIComponent(slug)}/draft`, { body: { document } });
  let version = null;
  if (ctx.flags.publish) {
    const published = unwrap(await client.requestJson("POST", `/api/admin/pages/${encodeURIComponent(slug)}/publish`, { body: {} }));
    version = published.version;
  }
  return {
    data: { id: page.id, slug, url: `/pages/${slug}`, published: Boolean(version), version },
    message: `Created ${version ? "published" : "draft"} blog page ${slug}. ${version ? `URL: /pages/${slug}` : "Run blog publish when ready."}`,
  };
}

export async function blogUpdate(ctx) {
  const slug = requirePositional(ctx.args, 0, "blog slug");
  const client = ctx.requireClient();
  const current = unwrap(await client.requestJson("GET", `/api/admin/pages/${encodeURIComponent(slug)}`));
  const title = flagString(ctx.flags, "title") || current.page.title;
  if (title) {
    await client.requestJson("PUT", `/api/admin/pages/${encodeURIComponent(slug)}`, { body: { title } });
  }
  if (ctx.flags.data !== undefined || ctx.flags.text !== undefined || ctx.flags["text-file"] !== undefined) {
    const body = await blogBody(ctx.flags);
    const document = typeof body === "string"
      ? blogDocument(slug, title, body, ctx.flags)
      : body;
    if (document.page !== slug) throw usageError(`document.page must match the blog slug (${slug}).`);
    await client.requestJson("PUT", `/api/admin/pages/${encodeURIComponent(slug)}/draft`, { body: { document } });
  }
  let version = null;
  if (ctx.flags.publish) {
    const published = unwrap(await client.requestJson("POST", `/api/admin/pages/${encodeURIComponent(slug)}/publish`, { body: {} }));
    version = published.version;
  }
  return {
    data: { slug, published: Boolean(version), version },
    message: version ? `Updated and published ${slug}.` : `Updated the draft for ${slug}.`,
  };
}

export async function blogPublish(ctx) {
  return pagesPublish(ctx);
}

export async function blogDelete(ctx) {
  return pagesDelete(ctx);
}
