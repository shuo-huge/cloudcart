import { expect, test } from "@playwright/test";
import { loadFixtures } from "./fixtures";
import { dragTo } from "./drag";

test("reorders sections, previews, and publishes a new version", async ({ page }) => {
  const fixtures = loadFixtures();
  await page.goto("/admin/pages/home/edit");
  await expect(page.locator(".editor-topbar")).toBeVisible();

  const items = page.locator(".outline-item");
  await expect(items).toHaveCount(3);
  const labelsBefore = await items.locator(".outline-name strong").allTextContents();
  expect(labelsBefore).toHaveLength(3);

  await dragTo(page, items.nth(0).locator(".drag-handle"), items.nth(2));

  await expect(page.locator(".editor-status--saved")).toHaveText("All changes saved");
  const labelsAfter = await items.locator(".outline-name strong").allTextContents();
  expect(labelsAfter).toEqual([labelsBefore[1], labelsBefore[2], labelsBefore[0]]);

  await page.reload();
  await expect(page.locator(".editor-topbar")).toBeVisible();
  await expect(page.locator(".outline-item .outline-name strong")).toHaveText(labelsAfter);

  const preview = page.frameLocator(".preview-iframe");
  await expect(preview.locator("body")).toContainText("E2E Home Hero");

  await page.getByRole("button", { name: "Tablet" }).click();
  await expect(page.locator(".preview-frame")).toHaveAttribute("style", /width:\s*768px/);
  await page.getByRole("button", { name: "Mobile" }).click();
  await expect(page.locator(".preview-frame")).toHaveAttribute("style", /width:\s*390px/);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".toast").last()).toContainText("Published version");

  await page.getByRole("button", { name: "Versions" }).click();
  await expect(page.locator(".version-row")).toHaveCount(fixtures.homeVersion + 1);
  await expect(page.locator(".version-row").first()).toContainText("Restore");
});
