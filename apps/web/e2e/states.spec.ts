import { expect, test } from "@playwright/test";
import { connectAndScan, quoteFixture, scanFixture, setup } from "./fixtures";

test.describe("edge states", () => {
  test("unsupported wallet: no provider detected", async ({ page }) => {
    await setup(page, { noWallet: true });
    await page.goto("/app");
    await page.getByRole("button", { name: /connect wallet/i }).first().click();
    await expect(page.getByText(/no wallet detected/i)).toBeVisible();
  });

  test("empty wallet shows empty states", async ({ page }) => {
    await setup(page, { scan: { ...scanFixture, tokens: [], nfts: [], approvals: [] } });
    await connectAndScan(page);
    await expect(page.getByText(/no erc-20 balances found/i)).toBeVisible();
    await page.getByRole("tab", { name: /nfts/i }).click();
    await expect(page.getByText(/no nfts found/i)).toBeVisible();
    await page.getByRole("tab", { name: /approvals/i }).click();
    await expect(page.getByText(/no active approvals found/i)).toBeVisible();
  });

  test("scanner loading state on a slow backend", async ({ page }) => {
    await setup(page, { scanDelayMs: 2500 });
    await connectAndScan(page);
    await expect(page.getByText(/scanning robinhood chain/i)).toBeVisible();
    await expect(page.getByTestId("asset-row-DOGCOIN")).toBeVisible({ timeout: 15_000 });
  });

  test("partial scanner failure is surfaced, results still usable", async ({ page }) => {
    await setup(page, { scan: { ...scanFixture, approvals: [], partial: { tokens: true, nfts: true, approvals: false }, errors: ["approvals: indexer timeout"] } });
    await connectAndScan(page);
    await expect(page.getByText(/some data could not be loaded/i)).toBeVisible();
    await expect(page.getByText("Scan incomplete")).toBeVisible();
    await expect(page.getByTestId("asset-row-DOGCOIN")).toBeVisible();
  });

  test("scan failure offers retry", async ({ page }) => {
    await setup(page, { scanStatus: 503 });
    await connectAndScan(page);
    await expect(page.getByText(/scan failed/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("simulation revert blocks confirmation and names the operation", async ({ page }) => {
    await setup(page, { quote: (b) => quoteFixture(b.operations.length, { revertIndex: 0 }) });
    await connectAndScan(page);
    await page.getByRole("checkbox", { name: /select dogcoin/i }).click();
    await page.getByRole("button", { name: /^review$/i }).click();
    await expect(page.getByText(/non-standard token/i)).toBeVisible();
    await expect(page.getByText(/blacklisted recipient/i)).toBeVisible();
    await page.getByLabel(/cannot be reversed/i).check();
    await expect(page.getByRole("button", { name: /incinerate 1 asset/i })).toBeDisabled();
  });

  test("transaction revert shows a failed state with retry", async ({ page }) => {
    await setup(page, { rpc: { receiptStatus: "0x0" } });
    await connectAndScan(page);
    await page.getByRole("checkbox", { name: /select dogcoin/i }).click();
    await page.getByRole("button", { name: /^review$/i }).click();
    await page.getByLabel(/cannot be reversed/i).check();
    await page.getByRole("button", { name: /incinerate 1 asset/i }).click();
    await expect(page.getByText(/transaction 1 reverted/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  test("user rejection in the wallet is reported plainly", async ({ page }) => {
    await setup(page, { rejectSend: true });
    await connectAndScan(page);
    await page.getByRole("checkbox", { name: /select dogcoin/i }).click();
    await page.getByRole("button", { name: /^review$/i }).click();
    await page.getByLabel(/cannot be reversed/i).check();
    await page.getByRole("button", { name: /incinerate 1 asset/i }).click();
    await expect(page.getByText(/signature rejected in wallet/i)).toBeVisible({ timeout: 15_000 });
  });

  test("protected asset can be unlocked only through an explicit confirmation", async ({ page }) => {
    await setup(page);
    await connectAndScan(page);
    const row = page.getByTestId("asset-row-NFLX");
    await expect(page.getByRole("checkbox", { name: /select nflx/i })).toBeDisabled();
    await row.hover();
    await row.getByRole("button", { name: /protected · unlock/i }).click();
    await expect(row.getByText(/unlocking lets you destroy a protected asset/i)).toBeVisible();
    await row.getByRole("button", { name: /^unlock$/i }).click();
    await expect(page.getByRole("checkbox", { name: /select nflx/i })).toBeEnabled();
  });
});
