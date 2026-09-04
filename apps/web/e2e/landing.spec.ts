import { expect, test } from "@playwright/test";
import { setup } from "./fixtures";

test.describe("landing", () => {
  test("renders the wordmark, mascot, one call to action and the three steps", async ({ page }) => {
    await setup(page);
    await page.goto("/");

    await expect(page.getByRole("img", { name: "RH Incinerator" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /clean your wallet/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /mascot burning unwanted tokens/i })).toBeVisible();
    await expect(page.getByText(/built for robinhood chain/i).first()).toBeVisible();

    // A single primary action in the page body, plus the one in the header.
    await expect(page.getByRole("button", { name: /connect wallet/i })).toHaveCount(2);

    for (const step of ["Connect", "Select", "Incinerate"]) {
      await expect(page.getByRole("listitem").filter({ hasText: step })).toBeVisible();
    }
    await expect(page.getByText(/not affiliated with or endorsed by robinhood/i)).toBeVisible();
  });

  test("the animated background paints without blocking content", async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.waitForTimeout(700);
    const state = await page.evaluate(() => {
      const c = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (!c) return null;
      const ctx = c.getContext("2d")!;
      const strip = ctx.getImageData(0, Math.floor(c.height * 0.6), c.width, 40).data;
      let lit = 0;
      for (let i = 3; i < strip.length; i += 4) if (strip[i]! > 0) lit++;
      return { lit, total: strip.length / 4, pointerEvents: getComputedStyle(c.parentElement!).pointerEvents };
    });
    expect(state).not.toBeNull();
    // Some glyphs are painted, but the field stays sparse and never intercepts clicks.
    expect(state!.lit).toBeGreaterThan(0);
    expect(state!.lit / state!.total).toBeLessThan(0.5);
    expect(state!.pointerEvents).toBe("none");
  });

  test("old marketing routes redirect into the two pages that remain", async ({ page }) => {
    await setup(page);
    for (const [from, to] of [
      ["/how-it-works", "/"],
      ["/security", "/transparency"],
      ["/sponsor", "/transparency"],
    ] as const) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to === "/" ? "\\/$" : to}`));
    }
  });

  test("transparency shows live figures and the security model", async ({ page }) => {
    await setup(page);
    await page.goto("/transparency");
    await expect(page.getByRole("heading", { name: /where the gas comes from/i })).toBeVisible();
    await expect(page.getByText(/not deployed on robinhood chain testnet yet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /what protects you/i })).toBeVisible();
    await expect(page.getByText("One-way funding")).toBeVisible();
    await expect(page.getByText("Protected by default")).toBeVisible();
  });
});
