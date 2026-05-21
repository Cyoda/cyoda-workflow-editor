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

  await expect(page.getByTestId("inspector-transition-source-anchor")).toBeVisible();
  await page.getByTestId("inspector-transition-source-anchor").selectOption("right");
  await expect.poll(async () => changedPathCount(before, await pathData(page))).toBeGreaterThan(0);

  const afterSource = await pathData(page);
  await page.getByTestId("inspector-transition-target-anchor").selectOption("left");
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
  await expect(page.getByTestId("inspector-transition-next")).toBeVisible();
  await page.getByTestId("inspector-transition-next").selectOption("approved");

  await expect(page.getByTestId("editor-page")).toContainText('"next": "approved"');
  await expect.poll(async () => {
    const boxes = await pathBoxes(page);
    return boxes.some((box) => box.width > 80 && box.height > 80);
  }).toBe(true);
});
