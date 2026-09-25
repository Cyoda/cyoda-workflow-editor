import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Replaces the value of the LAST JSON property in a pretty-printed
 * (`JSON.stringify(criterion, null, 2)`) criterion buffer — e.g. turns
 * `"value": "mismatch"` into `"value": "mismatch-e2e"` — without touching
 * anything else in the document.
 *
 * Avoids Select-All + Delete: `annotations-lifecycle.spec.ts` documents that
 * ControlOrMeta+A / Delete does not reliably clear this Monaco build's
 * EditContext-based editable surface under Playwright's CDP-driven input.
 * Pure keyboard navigation (End / ArrowUp / ArrowLeft / Shift+ArrowLeft) +
 * `insertText` does work — it is the same family of primitives already
 * proven by `criterion-delete-key.spec.ts`'s End+Backspace and by
 * `annotations-lifecycle.spec.ts`'s End+ArrowLeft+insertText.
 *
 * `oldValue`'s length drives how many characters get selected backward from
 * just before the closing quote of the last property's value, so this only
 * works when `oldValue` is the exact current value of the last property.
 */
async function replaceLastPropertyValue(page: Page, oldValue: string, newValue: string) {
  const editor = page.getByTestId("criterion-json-editor");
  const viewLines = editor.locator(".view-lines");
  await viewLines.click();
  await page.keyboard.press("ControlOrMeta+End"); // end of the document (closing "}")
  await page.keyboard.press("ArrowUp"); // up to the last property's line
  await page.keyboard.press("End"); // true end of that line, after the closing quote
  await page.keyboard.press("ArrowLeft"); // before the closing quote, after the value text
  for (let i = 0; i < oldValue.length; i += 1) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  await page.keyboard.insertText(newValue);
}

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
    "Array — positional values",
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

test("criteria editor shows compact inspector card and edits criterion inline", async ({ page }) => {
  await page.goto("/criteria");
  await expect(page.getByTestId("criteria-page")).toBeVisible();

  await page
    .locator('[data-testid^="rf-edge-label-"]')
    .filter({ hasText: "MATCH_MISMATCH" })
    .first()
    .dispatchEvent("click");

  // Compact, collapsed state: summary card + Edit affordance, no JSON pane yet.
  await expect(page.getByTestId("criterion-summary-card")).toBeVisible();
  await expect(page.getByTestId("inspector-criterion-edit")).toBeVisible();
  await expect(page.getByTestId("criterion-type-select")).toHaveCount(0);
  await expect(page.getByTestId("criterion-json-editor")).toHaveCount(0);
  await expect(page.getByTestId("criterion-compact-json")).toContainText("mismatch");

  await page.getByTestId("inspector-criterion-edit").click();

  // Expands INLINE — no modal ever mounts.
  await expect(page.getByTestId("criterion-editor-modal")).toHaveCount(0);
  await expect(page.getByTestId("criterion-json-editor")).toBeVisible();
  await expect(page.getByTestId("inspector-criterion-apply")).toBeVisible();
  await expect(page.getByTestId("inspector-criterion-revert")).toBeVisible();
  await expect(page.getByTestId("inspector-criterion-collapse")).toBeVisible();

  // Type valid criterion JSON into the Monaco pane (change the IEQUALS value).
  await replaceLastPropertyValue(page, "mismatch", "mismatch-e2e");

  const applyButton = page.getByTestId("inspector-criterion-apply");
  await expect(applyButton).toBeEnabled();
  await applyButton.click();

  // Apply commits and collapses the field back to the compact preview, which
  // now reflects the change — proving it actually took.
  await expect(page.getByTestId("criterion-json-editor")).toHaveCount(0);
  await expect(page.getByTestId("criterion-editor-modal")).toHaveCount(0);
  await expect(page.getByTestId("criterion-summary-card")).toBeVisible();
  await expect(page.getByTestId("criterion-compact-json")).toContainText("mismatch-e2e");

  // ... and persisted into the exported workflow JSON panel too. (/criteria
  // renders two .code-block panels — workflow JSON, then the entity sample —
  // so scope to the first, unlike /editor's single JsonBlock.)
  const jsonBlock = page.locator(".code-block").first();
  await expect(jsonBlock).toContainText("mismatch-e2e");
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
