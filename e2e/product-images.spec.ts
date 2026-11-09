import { expect, test } from "@playwright/test";
import { loadFixtures } from "./fixtures";
import { dragTo } from "./drag";

test("reorders product images and updates the storefront cover", async ({ page }) => {
  const fixtures = loadFixtures();
  await page.goto(`/admin/products/${fixtures.productId}`);
  await expect(page.locator(".media-grid")).toBeVisible();
  const tiles = page.locator(".media-tile");
  await expect(tiles).toHaveCount(3);

  const idsBefore = await tiles.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-image-id")));
  await expect(tiles.nth(0).locator(".media-cover-badge")).toHaveText("Cover");

  await dragTo(page, tiles.nth(0).locator(".media-drag-handle"), tiles.nth(2));
  await expect(page.locator(".toast").last()).toContainText("Image order saved.");
  await expect(tiles.nth(0).locator(".media-cover-badge")).toHaveText("Cover");

  await page.reload();
  await expect(page.locator(".media-tile")).toHaveCount(3);
  const idsAfter = await page.locator(".media-tile").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-image-id")));
  expect(idsAfter).toEqual([idsBefore[1], idsBefore[2], idsBefore[0]]);

  await page.goto(`/products/${fixtures.productSlug}`);
  const mainImage = page.locator("[data-product-main-image]");
  await expect(mainImage).toBeVisible();
  await expect(mainImage).toHaveAttribute("src", fixtures.imageUrls[1]!);
});
