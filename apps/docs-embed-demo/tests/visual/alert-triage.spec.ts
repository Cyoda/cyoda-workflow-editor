import { expect, test } from "@playwright/test";

/**
 * Baseline visual diff for the slim viewer rendering of the `alertTriage`
 * example (spec §22.4). This is the canonical "closely match SVG-workflow.png"
 * example from the plan.
 *
 * The baseline PNG is captured on first run via `pnpm visual:update`. CI
 * runs `pnpm test:visual` and fails on pixel divergence beyond the 1%
 * threshold configured in `playwright.config.ts`.
 */
test("alert-triage viewer matches reference", async ({ page }) => {
  await page.goto("/embed");
  await page.waitForSelector(".viewer-card svg");
  await expect(page.getByTestId("start-marker")).toHaveCount(0);
  await expect(page.locator(".viewer-card")).toHaveScreenshot("alert-triage.baseline.png");
});
