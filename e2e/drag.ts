import type { Locator, Page } from "@playwright/test";

/**
 * SortableJS is configured with forceFallback, so a pointer/mouse sequence is
 * more reliable than HTML5 dragTo. Move in small steps to let Sortable update
 * its placeholder before releasing.
 */
export async function dragTo(
  page: Page,
  handle: Locator,
  target: Locator,
  position: "top" | "bottom" = "bottom",
): Promise<void> {
  await handle.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  const destination = await target.boundingBox();
  if (!source || !destination) throw new Error("Drag source or target is not visible.");

  const startX = source.x + source.width / 2;
  const startY = source.y + source.height / 2;
  const endX = destination.x + destination.width / 2;
  const endY = position === "bottom"
    ? destination.y + destination.height - 4
    : destination.y + 4;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(startX, startY + 10, { steps: 5 });
  await page.waitForTimeout(150);
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.move(endX, endY + (position === "bottom" ? 2 : -2), { steps: 3 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(250);
}
