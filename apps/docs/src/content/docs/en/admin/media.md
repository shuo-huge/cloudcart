---
title: Media
description: Upload images locally and switch storage between R2 and jsDelivr; reorder product images and link external images.
---

CloudCart supports three image sources:

- **Local upload**: choose a file on the product editor page or in the media library; it is written to the current storage automatically
- **R2**: available when the deployment has a `MEDIA` binding configured; images are served by the Worker at `/media/*`
- **jsDelivr**: published through a public GitHub repository and served from a jsDelivr CDN URL

**External HTTPS image URLs** are also still supported as an advanced option and do not copy any files.

## Uploading from the product editor

Go to **Admin → Products → Edit → Media**:

1. Choose the storage: R2 or jsDelivr
2. Choose a local image (JPEG / PNG / GIF / WebP / AVIF, max 5 MB)
3. Click **Upload**
4. The image is added to the media grid; the first one is the storefront cover

Drag the handle in the top-left corner of an image to reorder. The upload control sits outside the media grid and does not affect the drag order.

## Uploading from the media library

**Admin → Media** offers the same storage selector and upload control. The list shows each image's source: R2, jsDelivr or External.

## Configuring storage

### R2 (optional)

R2 is only available when this deployment has a `MEDIA` binding. To enable it:

1. Create an R2 bucket in Cloudflare
2. Add the following to `wrangler.jsonc`:

```jsonc
"r2_buckets": [
  { "binding": "MEDIA", "bucket_name": "cloudcart-media" }
]
```

3. Redeploy

The current one-click deployment does not create R2 by default; without R2, the admin shows "R2 — not configured".

### jsDelivr (GitHub)

1. Create a **public** GitHub repository (for example `your-name/cloudcart-media`)
2. Create a fine-grained PAT with **Contents: Read and write** permission for that repository only
3. In the admin, go to **Settings → Media storage** and fill in:
   - Repository owner
   - Repository name
   - Branch (usually `main`)
   - Folder path (for example `products`)
   - GitHub token
4. Click **Save storage settings**, then click **Test jsDelivr**

The token is stored encrypted with an AES-GCM key derived from `APP_MASTER_KEY`; the API only returns `tokenConfigured`, never the plaintext.

After upload, the Worker calls the GitHub Contents API to create a commit and uses the commit SHA to generate a stable URL:

```text
https://cdn.jsdelivr.net/gh/<owner>/<repo>@<commit-sha>/products/<file>.jpg
```

:::caution
jsDelivr is primarily intended for open-source projects, not as a general-purpose commercial image host. Long-term use for a commercial product catalogue may violate its terms; R2 is recommended for production.
:::

## External images (advanced)

Product Media and the media library have **Advanced: external image URL** at the bottom. It only records the URL; it does not download or copy files.

Requirements:

- Must be `https://`
- Must not be localhost, a private IP or an internal network address
- Must not contain a username/password

## Switching storage

- **Default storage**: Settings → Media storage
- **Per upload**: the Storage dropdown in the upload control
- Unavailable providers are disabled and show the reason
- The CLI uses `--storage r2|jsdelivr`; network images are downloaded and written to storage by default, and only `--external` keeps the external link

## Limits

- Maximum 5 MB; JPEG/PNG/GIF/WebP/AVIF; SVG is rejected
- Remote jsDelivr/GitHub files are not deleted automatically; deleting media only removes the D1 record and product associations
- Uploads fail if the GitHub token is expired or lacks permissions; the Test button in Settings can help diagnose the problem
- External URLs are not affected by storage settings and do not count towards media storage usage
