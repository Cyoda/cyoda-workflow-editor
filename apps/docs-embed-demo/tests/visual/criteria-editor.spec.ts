import { expect, test } from "@playwright/test";

test("criteria editor page mounts and surfaces every coverage row", async ({ page }) => {
  const errors: string[] = [];
  const ignore = (msg: string) => /Canceled/i.test(msg);
  page.on("pageerror", (e) => {
    if (!ignore(e.message)) errors.push(`pageerror: ${e.message}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !ignore(m.text())) {
      errors.push(`console.error: ${m.text()}`);
    }
  });

  await page.goto("/criteria");
  await expect(page.getByTestId("criteria-page")).toBeVisible();
  await expect(page.getByTestId("workflow-editor-shell")).toBeVisible();

  // Coverage-matrix entries — at least one cell per criterion shape.
  for (const label of [
    "Simple — equality",
    "Simple — BETWEEN_INCLUSIVE",
    "Group — AND / OR / nested NOT",
    "Function — with quick-exit",
    "Lifecycle — previousTransition",
    "Array — CONTAINS",
  ]) {
    await expect(page.getByText(label, { exact: false })).toBeVisible();
  }

  // The exported JSON panel should include the demo workflow name.
  await expect(
    page.getByText("TradeCriteriaDemoWorkflow", { exact: false }).first(),
  ).toBeVisible();

  // The entity-sample panel should include the entity name.
  await expect(page.getByText("StructuredTrade", { exact: false }).first()).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("criteria editor shows compact inspector card and opens modal editor", async ({ page }) => {
  await page.goto("/criteria");
  await expect(page.getByTestId("criteria-page")).toBeVisible();

  await page
    .locator('[data-testid^="rf-edge-label-"]')
    .filter({ hasText: "MATCH_MISMATCH" })
    .first()
    .dispatchEvent("click");

  await expect(page.getByTestId("criterion-summary-card")).toBeVisible();
  await expect(page.getByTestId("inspector-criterion-edit")).toBeVisible();
  await expect(page.getByTestId("inspector-transition-criteria-section")).not.toContainText(
    "Edit as JSON",
  );
  await expect(page.getByTestId("criterion-type-select")).toHaveCount(0);

  await page.getByTestId("inspector-criterion-edit").click();

  await expect(page.getByTestId("criterion-editor-modal")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edit criterion" })).toBeVisible();
  await expect(page.getByTestId("criterion-json-editor")).toBeVisible();
  await expect(page.getByTestId("criterion-modal-apply")).toBeVisible();

  await page.getByTestId("criterion-modal-cancel").click();
  await expect(page.getByTestId("criterion-editor-modal")).toHaveCount(0);
  await expect(page.getByTestId("criterion-summary-card")).toBeVisible();
});

// Regression guard for the React Flow 11 / React 19 idle render loop: the Canvas
// effect that calls updateNodeInternals must key on the layout-derived node memo,
// not the live `nodes` state — otherwise re-measure -> dimensions change ->
// setNodes -> re-measure churns continuously and pins the main thread (was
// ~630ms of long-task CPU per second of idle on this ~13-node graph; fixed: ~0).
// Measured in-browser because the loop needs real React Flow node measurement,
// which jsdom does not run.
test("criteria editor graph does not burn CPU while idle (no React Flow render loop)", async ({ page }) => {
  await page.goto("/criteria");
  await expect(page.getByTestId("workflow-editor-shell")).toBeVisible();
  // Let ELK layout + the one-shot fitView settle.
  await page.waitForTimeout(4000);

  const longTaskMs = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        let po: PerformanceObserver | undefined;
        try {
          po = new PerformanceObserver((l) => {
            for (const e of l.getEntries()) total += e.duration;
          });
          po.observe({ entryTypes: ["longtask"] });
        } catch {
          // longtask unsupported -> report 0 (test is a no-op rather than flaky)
        }
        setTimeout(() => {
          po?.disconnect();
          resolve(Math.round(total));
        }, 2000);
      }),
  );

  // Generous budget: the bug produced ~630ms of long-task CPU over this 2s idle
  // window; the fix measures ~0. 400ms cleanly separates the two with CI margin.
  expect(longTaskMs, `idle long-task CPU was ${longTaskMs}ms over 2s`).toBeLessThan(400);
});
