import { expect, test } from "@playwright/test";
import { setup } from "./fixtures";

test.describe("landing", () => {
  test("renders hero, network badge and live preview without fabricated figures", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /clean your wallet/i })).toBeVisible();
    await expect(page.getByText(/built for robinhood chain/i).first()).toBeVisible();
    await expect(page.getByText("Wallet health")).toBeVisible();
    // Figures are placeholders until a scan happens.
    await expect(page.getByTestId("preview-figure-label").first()).toHaveText("unwanted assets");
    await expect(page.getByTestId("preview-figure-label")).toHaveCount(3);
    // Live network state comes from the (mocked) RPC, never hard-coded.
    await expect(page.getByText("Block").locator("..").getByText(/^[\d,]{6,}$/)).toBeVisible();
    await expect(page.getByText("Gas price").locator("..").getByText(/gwei/)).toBeVisible();
    await expect(page.getByText(/not configured/i).first()).toBeVisible();
    await expect(page.getByText(/not affiliated with or endorsed by robinhood/i)).toBeVisible();
  });

  test("secondary pages render", async ({ page }) => {
    await setup(page);
    for (const [path, heading] of [
      ["/how-it-works", /six steps/i],
      ["/security", /fail closed/i],
      ["/sponsor", /creator fees pay/i],
      ["/transparency", /where the gas comes from/i],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(page.getByText(/not deployed on robinhood chain testnet yet/i)).toBeVisible();
  });
});
