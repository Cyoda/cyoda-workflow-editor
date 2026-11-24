import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

function edgePaths(page: Page) {
  return page.locator("path.react-flow__edge-path");
}

async function pathData(page: Page): Promise<string[]> {
  return edgePaths(page).evaluateAll((paths) =>
    paths.map((path) => path.getAttribute("d") ?? ""),
  );
}

async function pathBoxes(page: Page): Promise<Array<{ width: number; height: number }>> {
  return edgePaths(page).evaluateAll((paths) =>
    paths.map((path) => {
      const box = (path as SVGGraphicsElement).getBBox();
      return { width: box.width, height: box.height };
    }),
  );
}

/**
 * Picks `value` in an inspector dropdown. `CustomSelectInput` renders a hidden
 * native <select> (which carries the test id, for unit tests) next to the
 * visible combobox a user clicks — so drive the combobox like a user does and
 * use the hidden select only to find the option's label and check the result.
 */
async function chooseOption(page: Page, testId: string, value: string) {
  const select = page.getByTestId(testId);
  const label = (await select.locator(`option[value="${value}"]`).textContent())!.trim();
  const field = select.locator("xpath=..");
  await field.getByRole("combobox").click();
  await field.getByRole("option", { name: label, exact: true }).click();
  await expect(select).toHaveValue(value);
}

function changedPathCount(before: string[], after: string[]): number {
  const count = Math.max(before.length, after.length);
  let changed = 0;
  for (let i = 0; i < count; i += 1) {
    if ((before[i] ?? "") !== (after[i] ?? "")) changed += 1;
  }
  return changed;
}

test("editor drag keeps connected edge geometry attached without a follow-up click", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.getByTestId("editor-page")).toBeVisible();
  await expect(page.getByTestId("rf-state-active")).toBeVisible();
  await expect.poll(async () => (await pathData(page)).filter(Boolean).length).toBeGreaterThan(0);

  const active = page.locator(".react-flow__node").filter({ has: page.getByTestId("rf-state-active") }).first();
  const box = await active.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  const canvas = page.getByTestId("workflow-canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  const before = await pathData(page);

  await active.dragTo(canvas, {
    targetPosition: {
      x: startX - 160 - canvasBox!.x,
      y: startY + 20 - canvasBox!.y,
    },
    force: true,
  });

  const afterBox = await active.boundingBox();
  expect(afterBox?.x).toBeLessThan(box!.x - 40);
  await expect.poll(async () => changedPathCount(before, await pathData(page))).toBeGreaterThan(0);
});

test("editor anchor dropdowns move the selected transition path without exporting metadata", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.getByTestId("editor-page")).toBeVisible();
  await expect.poll(async () => (await pathData(page)).filter(Boolean).length).toBeGreaterThan(0);

  const firstEdge = edgePaths(page).first();
  const before = await pathData(page);
  await firstEdge.click({ force: true });

  await chooseOption(page, "inspector-transition-source-anchor", "right");
  await expect.poll(async () => changedPathCount(before, await pathData(page))).toBeGreaterThan(0);

  const afterSource = await pathData(page);
  await chooseOption(page, "inspector-transition-target-anchor", "left");
  await expect.poll(async () => changedPathCount(afterSource, await pathData(page))).toBeGreaterThan(0);

  await expect(page.getByTestId("editor-page")).not.toContainText("edgeAnchors");
});

test("editor drag-connect preserves the drawn source-to-target direction", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.getByTestId("editor-page")).toBeVisible();

  const sourceHandle = page.locator('[data-testid="rf-state-new"] [data-id$="-bottom-source"]').first();
  const targetHandle = page.locator('[data-testid="rf-state-active"] [data-id$="-top-target"]').first();
  await expect(sourceHandle).toBeVisible();
  await expect(targetHandle).toBeVisible();
  // On a cold load the handles are visible before ELK layout + fitView have
  // finished moving the nodes, so a drag computed from their first position
  // can land off-target. Wait until the target stops moving.
  await expect
    .poll(
      async () => {
        const a = await targetHandle.boundingBox();
        await page.waitForTimeout(150);
        const b = await targetHandle.boundingBox();
        return a !== null && b !== null && a.x === b.x && a.y === b.y;
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  await sourceHandle.dragTo(targetHandle, { force: true });

  await expect(page.getByTestId("dragconnect-name")).toBeVisible();
  await expect(page.getByTestId("modal-frame")).toContainText("new → active");
});

test("editor retargeting to the same state keeps a visible self-loop on the graph", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.getByTestId("editor-page")).toBeVisible();
  await expect.poll(async () => (await pathData(page)).filter(Boolean).length).toBeGreaterThan(0);

  await page
    .locator('[data-testid^="rf-edge-label-"]')
    .filter({ hasText: "TO_ARCHIVED" })
    .first()
    .click();
  await chooseOption(page, "inspector-transition-next", "approved");

  await expect(page.getByTestId("editor-page")).toContainText('"next": "approved"');
  await expect.poll(async () => {
    const boxes = await pathBoxes(page);
    return boxes.some((box) => box.width > 80 && box.height > 80);
  }).toBe(true);
});
