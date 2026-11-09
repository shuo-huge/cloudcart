import { expect, test } from "@playwright/test";

test.describe("responsive admin layout", () => {
  test("shows the desktop sidebar and hides the mobile menu at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin");
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".menu-button")).toBeHidden();
  });

  test("opens the mobile navigation at 768px and 390px without horizontal scroll", async ({ page }) => {
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/products");
      await expect(page.locator(".menu-button")).toBeVisible();
      await expect(page.locator(".menu-button")).toHaveCSS("display", "block");
      await page.locator(".menu-button").click();
      await expect(page.locator(".sidebar")).toHaveClass(/sidebar--open/);
      await expect(page.locator(".sidebar-scrim")).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test("collapses the page editor and theme grid on narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/pages/home/edit");
    await expect(page.locator(".editor-three")).toBeVisible();
    expect(await columns(page.locator(".editor-three"))).toBe(3);

    await page.setViewportSize({ width: 768, height: 900 });
    expect(await columns(page.locator(".editor-three"))).toBe(1);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/themes");
    expect(await columns(page.locator(".theme-grid"))).toBeGreaterThan(1);
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await columns(page.locator(".theme-grid"))).toBe(1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

async function columns(locator: import("@playwright/test").Locator): Promise<number> {
  return locator.evaluate((element) => {
    const value = getComputedStyle(element).gridTemplateColumns;
    return value.split(" ").filter(Boolean).length;
  });
}
