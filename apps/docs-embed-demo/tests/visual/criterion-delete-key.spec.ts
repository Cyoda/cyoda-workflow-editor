import { expect, test } from "@playwright/test";

// Regression guard: deleting text inside the criterion JSON editor (Monaco)
// must NOT delete the selected transition.
//
// Monaco's EditContext-based editor exposes its editable surface as a
// `role="textbox"` <div> (not a <textarea> or contentEditable element). The
// editor's global Backspace/Delete shortcut bailed only on INPUT/TEXTAREA/SELECT
// and contentEditable, so a Backspace inside the open criterion modal escaped to
// the document-level handler and dispatched `removeTransition` — wiping the whole
// transition instead of editing its criterion. Reproduces only in a real browser
// because jsdom does not run Monaco's EditContext input surface.
test("backspace inside the criterion JSON editor does not delete the transition", async ({
  page,
}) => {
  await page.goto("/criteria");
  await expect(page.getByTestId("criteria-page")).toBeVisible();
  await expect(page.getByTestId("workflow-editor-shell")).toBeVisible();

  // Select the MATCH_MISMATCH transition (it carries a criterion).
  await page
    .locator('[data-testid^="rf-edge-label-"]')
    .filter({ hasText: "MATCH_MISMATCH" })
    .first()
    .dispatchEvent("click");

  await expect(page.getByTestId("criterion-summary-card")).toBeVisible();
  await page.getByTestId("inspector-criterion-edit").click();
  await expect(page.getByTestId("criterion-editor-modal")).toBeVisible();

  // Place a cursor in the Monaco editor and delete a character.
  await page.locator('[data-testid="criterion-json-editor"] .view-lines').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");

  // The modal stays open and the transition still exists — only the JSON text
  // changed, the transition was NOT removed.
  await expect(page.getByTestId("criterion-editor-modal")).toBeVisible();
  await expect(
    page
      .locator('[data-testid^="rf-edge-label-"]')
      .filter({ hasText: "MATCH_MISMATCH" }),
  ).toHaveCount(1);
});
