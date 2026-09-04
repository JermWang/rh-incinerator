import { expect, test } from "@playwright/test";
import { connectAndScan, setup } from "./fixtures";

test.describe("mobile", () => {
  test("no horizontal scroll and a sticky action tray", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /clean your wallet/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await connectAndScan(page);
    await page.getByRole("checkbox", { name: /select dogcoin/i }).click();
    const tray = page.getByText("1 selected");
    await expect(tray).toBeVisible();
    const box = await page.getByRole("button", { name: /^review$/i }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow2).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: /^review$/i }).click();
    await expect(page.getByRole("heading", { name: /review incineration/i })).toBeVisible();
  });
});
