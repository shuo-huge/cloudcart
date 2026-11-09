import { expect, test } from "@playwright/test";

test("opens the full storefront preview from the theme gallery", async ({ page }) => {
  await page.goto("/admin/themes");
  const trigger = page.locator(".theme-preview-trigger").first();
  await expect(trigger).toBeVisible();
  await trigger.click();

  const preview = page.locator(".theme-preview-art--large");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS("background-image", /theme-previews-atlas\.webp/);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(preview).toBeHidden();
});
