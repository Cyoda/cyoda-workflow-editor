import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Functional (no-screenshot) e2e coverage for the annotations editing lifecycle
// (create -> edit -> apply -> verify persisted -> delete) driven against the real
// editor on /editor, where the annotations field renders a real Monaco instance
// (jsonEditor={{ monaco }} is wired through to CriterionMonacoProvider). This
// closes the gap left by the jsdom component tests, which fall back to a plain
// <textarea> because jsdom cannot run Monaco.

function attachErrorCapture(page: Page): string[] {
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
  return errors;
}

async function gotoEditor(page: Page) {
  await page.goto("/editor");
  await expect(page.getByTestId("editor-page")).toBeVisible();
  await expect(page.getByTestId("workflow-editor-shell")).toBeVisible();
  // Let ELK layout + the one-shot fitView settle before interacting with the graph.
  await expect(page.locator('[data-testid^="rf-state-"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="rf-edge-label-"]').first()).toBeVisible();
}

async function selectFirstState(page: Page) {
  await page.locator('[data-testid^="rf-state-"]').first().click();
  await expect(page.getByTestId("inspector-state-name")).toBeVisible();
}

async function selectFirstTransition(page: Page) {
  // The edge label is an SVG foreignObject child; it needs a synthetic click
  // (matches the pattern in criteria-editor.spec.ts / criterion-delete-key.spec.ts).
  await page.locator('[data-testid^="rf-edge-label-"]').first().dispatchEvent("click");
  await expect(page.getByTestId("inspector-transition-delete")).toBeVisible();
}

async function selectWorkflow(page: Page) {
  await page.getByTestId("canvas-workflow-settings").click();
}

/**
 * Types a JSON object into the annotations editor. On /editor this is real
 * Monaco, which auto-closes brackets/quotes, so `keyboard.type('{...}')`
 * would produce broken JSON. Falls back to a plain `.fill()` if the field
 * ever renders the jsdom-only `<textarea>` fallback instead.
 *
 * Adapted from the brief's Select-All + Delete + insertText recipe: this
 * Monaco build renders its editable surface as an EditContext-based
 * `.native-edit-context` div, and synthetic ControlOrMeta+A + Delete key
 * presses did not clear its content under Playwright's CDP-driven input
 * (verified empirically — the "{}" text survived the Delete press, and the
 * following insertText then appended after it, producing invalid JSON like
 * `{}{"role":"wf-reviewer"}`, which left Apply permanently disabled).
 * Workaround: the editor always starts as the literal buffer `"{}"` right
 * after `inspector-annotations-add` is clicked (`onCommit({})` seeds an
 * empty object), so position the cursor between the braces and `insertText`
 * the object's inner properties instead of clearing + retyping the buffer.
 * `insertText` itself still dispatches a single input event and bypasses
 * Monaco's bracket auto-close, per the brief.
 */
async function setAnnotationsJson(page: Page, json: string) {
  const editor = page.getByTestId("annotations-json-editor");
  await expect(editor).toBeVisible();
  const tagName = await editor.evaluate((el) => el.tagName);
  if (tagName === "TEXTAREA") {
    await editor.fill(json);
    return;
  }

  const viewLines = editor.locator(".view-lines");
  await viewLines.click();
  await expect(viewLines).toHaveText("{}");
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  const inner = json.trim().replace(/^\{/, "").replace(/\}$/, "");
  await page.keyboard.insertText(inner);
}

/**
 * Drives the full annotations lifecycle for whichever node is currently
 * selected: create (Add) -> edit + Apply -> verify persisted in the serialized
 * JsonBlock panel -> delete (Remove), asserting the field clears and the
 * committed value disappears from the panel.
 */
async function runAnnotationsLifecycle(page: Page, uniqueValue: string) {
  const addButton = page.getByTestId("inspector-annotations-add");
  await expect(addButton).toBeVisible();
  await addButton.click();

  const editorLocator = page.getByTestId("annotations-json-editor");
  await expect(editorLocator).toBeVisible();

  await setAnnotationsJson(page, JSON.stringify({ role: uniqueValue }));

  const applyButton = page.getByTestId("inspector-annotations-apply");
  await expect(applyButton).toBeEnabled();
  await applyButton.click();

  // Verify persisted: assert against the serialized JsonBlock panel (the
  // committed WorkflowEditorDocument), not the Monaco buffer. EditorShowcasePage
  // renders exactly one JsonBlock, so its unique `.code-block` <pre> identifies
  // the panel unambiguously.
  const jsonBlock = page.locator(".code-block");
  await expect(jsonBlock).toContainText(uniqueValue);

  // Delete: the field collapses back to the "Add" affordance, and the value
  // drops out of the committed document.
  const removeButton = page.getByTestId("inspector-annotations-remove");
  await expect(removeButton).toBeVisible();
  await removeButton.click();

  await expect(page.getByTestId("inspector-annotations-add")).toBeVisible();
  await expect(jsonBlock).not.toContainText(uniqueValue);
}

test.describe("annotations editing lifecycle", () => {
  test("workflow annotations: create, edit, apply, verify persisted, delete", async ({ page }) => {
    const errors = attachErrorCapture(page);

    await gotoEditor(page);
    await selectWorkflow(page);
    await runAnnotationsLifecycle(page, "wf-reviewer");

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("state annotations: create, edit, apply, verify persisted, delete", async ({ page }) => {
    const errors = attachErrorCapture(page);

    await gotoEditor(page);
    await selectFirstState(page);
    await runAnnotationsLifecycle(page, "state-reviewer");

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("transition annotations: create, edit, apply, verify persisted, delete", async ({ page }) => {
    const errors = attachErrorCapture(page);

    await gotoEditor(page);
    await selectFirstTransition(page);
    await runAnnotationsLifecycle(page, "tx-reviewer");

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
