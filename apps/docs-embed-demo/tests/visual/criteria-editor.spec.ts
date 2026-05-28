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

test("criteria editor: focusing the JSONPath input shows entity-scoped hints", async ({ page }) => {
  await page.goto("/criteria");
  await expect(page.getByTestId("criteria-page")).toBeVisible();

  // Click any visible "edit criterion" pencil in the inspector. The inspector
  // is only populated after a transition is selected — click the first
  // transition edge label and then the criterion edit pencil.
  const transitionLabel = page.locator(".react-flow__edge").first();
  await transitionLabel.click({ force: true });

  const editBtn = page.getByTestId("inspector-criterion-edit").first();
  await editBtn.click();

  // Focus the simple-criterion JSONPath input and expect the hint panel.
  const pathInput = page.getByTestId("criterion-simple-path").first();
  await pathInput.focus();

  await expect(page.getByTestId("criterion-simple-path-hints")).toBeVisible();
  // At least one hint row should appear once the async provider resolves.
  await expect(page.getByTestId("criterion-simple-path-hint-0")).toBeVisible();
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
  await expect(page.getByTestId("inspector-transition-criteria-section")).not.toContainText(
    "Apply",
  );
  await expect(page.getByTestId("criterion-type-select")).toHaveCount(0);

  await page.getByTestId("inspector-criterion-edit").click();

  await expect(page.getByTestId("criterion-editor-modal")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edit criterion" })).toBeVisible();
  await expect(page.getByTestId("criterion-type-select")).toHaveCount(0);
  await expect(page.getByTestId("criterion-builder")).toBeVisible();
  await expect(page.getByTestId("criterion-modal-apply")).toBeVisible();

  await page.getByTestId("criterion-modal-cancel").click();
  await expect(page.getByTestId("criterion-editor-modal")).toHaveCount(0);
  await expect(page.getByTestId("criterion-summary-card")).toBeVisible();
});

test("criteria editor modal exposes group AND/OR composition controls", async ({ page }) => {
  await page.goto("/criteria");
  await expect(page.getByTestId("criteria-page")).toBeVisible();

  await page
    .locator('[data-testid^="rf-edge-label-"]')
    .filter({ hasText: "VALID_LARGE_USD_TRADE" })
    .first()
    .dispatchEvent("click");
  await page.getByTestId("inspector-criterion-edit").click();

  const modal = page.getByTestId("criterion-editor-modal");
  await expect(modal).toBeVisible();
  await expect(modal.getByText("Group criterion")).toBeVisible();
  await expect(modal.getByText("Match", { exact: true })).toBeVisible();
  await expect(page.getByTestId("criterion-group-and")).toContainText("All conditions (AND)");
  await expect(page.getByTestId("criterion-group-or")).toContainText("Any condition (OR)");
  await expect(page.getByTestId("criterion-group-add-condition")).toBeVisible();
  await expect(page.getByTestId("criterion-group-add-group")).toBeVisible();
  await expect(page.getByTestId("criterion-group-editor-0")).toHaveCount(0);
  await expect(page.getByTestId("criterion-group-edit-0")).toBeVisible();
  await expect(page.getByTestId("criterion-group-actions-0")).toBeVisible();
});
