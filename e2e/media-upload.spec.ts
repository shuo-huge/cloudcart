import { expect, test } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7xkAAAAASUVORK5CYII=",
  "base64",
);

test("uploads local images through the configured jsDelivr provider", async ({ page, request, context }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: PNG,
  }));

  const csrf = (await context.cookies()).find((cookie) => cookie.name === "cc_csrf")?.value ?? "";
  const created = await request.post("/api/admin/products", {
    headers: { "X-CSRF-Token": csrf },
    data: {
      name: "Media Upload E2E",
      slug: "media-upload-e2e",
      description: "Created by the media upload test.",
      status: "draft",
      type: "simple",
      price: "1.00",
      stock: 1,
      manageStock: true,
      featured: false,
      tags: [],
      categoryIds: [],
      variants: [],
    },
  });
  expect(created.status()).toBe(201);
  const productId = ((await created.json()) as { data: { id: string } }).data.id;

  try {
    await page.goto(`/admin/products/${productId}`);
    const uploader = page.locator(".media-uploader");
    await expect(uploader).toBeVisible();
    await uploader.locator("select").selectOption("jsdelivr");
    await uploader.locator('input[type="file"]').setInputFiles({
      name: "upload.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await uploader.getByRole("button", { name: "Upload", exact: true }).click();

    await expect(page.locator(".media-tile")).toHaveCount(1);
    await expect(page.locator(".media-tile img")).toHaveAttribute("src", /cdn\.jsdelivr\.net/);
    await expect(page.locator(".toast").last()).toContainText("Image uploaded.");

    await page.goto("/admin/settings");
    const storageCard = page.locator(".card", { hasText: "Media storage" }).first();
    await expect(storageCard).toBeVisible();
    await expect(storageCard).toContainText("jsDelivr (GitHub)");
    await expect(storageCard).toContainText("not configured");

    await page.goto("/admin/media");
    const mediaUploader = page.locator(".media-uploader");
    await expect(mediaUploader).toBeVisible();
    await mediaUploader.locator('input[type="file"]').setInputFiles({
      name: "library.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await mediaUploader.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.locator(".storage-badge--jsdelivr").first()).toBeVisible();
  } finally {
    await request.delete(`/api/admin/products/${productId}`, {
      headers: { "X-CSRF-Token": csrf },
    });
  }
});
