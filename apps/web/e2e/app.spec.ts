import { expect, test } from "@playwright/test";
import { connectAndScan, quoteFixture, scanFixture, setup, statusFixture } from "./fixtures";

test.describe("wallet cleanup flow", () => {
  test("requires a wallet, guards the network, scans and classifies", async ({ page }) => {
    await setup(page);
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /connect to scan/i })).toBeVisible();

    await connectAndScan(page);
    await expect(page.getByTestId("asset-row-DOGCOIN")).toBeVisible();
    await expect(page.getByTestId("asset-row-DOGCOIN").getByText("84,920,193")).toBeVisible();
    // Protected asset is locked; unsupported token cannot be selected.
    await expect(page.getByRole("checkbox", { name: /select nflx/i })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: /select trap/i })).toBeDisabled();
    await expect(page.getByText(/standard burn/i).first()).toBeVisible();
    // Summary cards reflect real scan counts (4 tokens + 2 NFTs).
    await expect(page.getByTestId("stat-assets-found")).toHaveText("6");
    await expect(page.getByTestId("stat-selected")).toHaveText("0");
  });

  test("selects assets and completes a standard (user-paid) cleanup", async ({ page }) => {
    await setup(page);
    await connectAndScan(page);

    await page.getByRole("checkbox", { name: /select dogcoin/i }).click();
    await page.getByRole("checkbox", { name: /select burny/i }).click();
    await page.getByRole("tab", { name: /approvals/i }).click();
    await page.getByRole("checkbox", { name: /select approval of nflx/i }).click();
    await expect(page.getByText("3 selected")).toBeVisible();

    await page.getByRole("button", { name: /^review$/i }).click();
    await expect(page.getByRole("heading", { name: /review incineration/i })).toBeVisible();
    await expect(page.getByText(/these actions are irreversible/i)).toBeVisible();
    await expect(page.getByText("Transfer to dead address")).toBeVisible();
    await expect(page.getByText("Burn via token contract")).toBeVisible();
    await expect(page.getByText("Revoke token allowance")).toBeVisible();
    await expect(page.getByText("Your wallet")).toBeVisible();

    const cta = page.getByRole("button", { name: /incinerate 2 assets/i });
    await expect(cta).toBeDisabled(); // confirmation is never pre-checked
    await page.getByLabel(/cannot be reversed/i).check();
    await cta.click();

    await expect(page.getByRole("heading", { name: /cleanup complete/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Assets removed").locator("..").getByText("2")).toBeVisible();
    await expect(page.getByText("Approvals revoked").locator("..").getByText("1")).toBeVisible();
    // Three real eth_sendTransaction calls were made through the wallet.
    const sent = await page.evaluate(() => (window as unknown as { __mockSent: unknown[] }).__mockSent.length);
    expect(sent).toBe(3);
    await page.getByRole("button", { name: /back to wallet/i }).click();
    await expect(page.getByRole("heading", { name: /wallet cleanup/i })).toBeVisible();
  });

  test("uses an atomic batch when the wallet supports it", async ({ page }) => {
    await setup(page, { capabilities: { atomic: true }, initialChainId: "0xb626" });
    await connectAndScan(page, { expectNetworkGuard: false });
    await expect(page.getByText(/standard burn · batched/i)).toBeVisible();
    await page.getByRole("checkbox", { name: /select dogcoin/i }).click();
    await page.getByRole("button", { name: /^review$/i }).click();
    await page.getByLabel(/cannot be reversed/i).check();
    await page.getByRole("button", { name: /incinerate 1 asset/i }).click();
    await expect(page.getByRole("heading", { name: /cleanup complete/i })).toBeVisible({ timeout: 30_000 });
    const calls = await page.evaluate(() => (window as unknown as { __mockCalls: { calls: unknown[] }[] }).__mockCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.calls).toHaveLength(1);
  });

  test("sponsor-capable wallet with active sponsor asks to sign in and falls back when denied", async ({ page }) => {
    await setup(page, {
      capabilities: { paymasterService: true, atomic: true },
      initialChainId: "0xb626",
      status: statusFixture("ACTIVE"),
      quote: (b) => quoteFixture(b.operations.length, { sponsorState: "ACTIVE", eligible: false, denyReason: "daily sponsor budget exhausted" }),
    });
    await connectAndScan(page, { expectNetworkGuard: false });
    await expect(page.getByText(/free burn · gas sponsored/i).first()).toBeVisible();
    await expect(page.getByTestId("asset-row-DOGCOIN").getByTestId("asset-actions-desktop").getByText("Eligible for free")).toBeVisible();
    await page.getByRole("checkbox", { name: /select dogcoin/i }).click();
    await page.getByRole("button", { name: /^review$/i }).click();
    // No session yet: the sheet asks for a sign-in before promising free gas.
    await expect(page.getByRole("button", { name: /sign in to confirm sponsored gas/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /incinerate 1 asset/i })).toBeDisabled();
  });

  test("disconnect returns to the connect panel", async ({ page }) => {
    await setup(page);
    await connectAndScan(page);
    await page.getByRole("button", { name: /0x1000/i }).click();
    await page.getByRole("menuitem", { name: /disconnect/i }).click();
    await expect(page.getByRole("heading", { name: /connect to scan/i })).toBeVisible();
  });

  test("filter narrows the token list", async ({ page }) => {
    await setup(page);
    await connectAndScan(page);
    await page.getByLabel(/filter assets/i).fill("burny");
    await expect(page.getByTestId("asset-row-BURNY")).toBeVisible();
    await expect(page.getByTestId("asset-row-DOGCOIN")).toHaveCount(0);
  });

  test("scan fixture counts", () => {
    expect(scanFixture.tokens).toHaveLength(4);
  });
});
