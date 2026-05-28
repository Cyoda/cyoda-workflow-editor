import { expect, test } from "@playwright/test";

test("viewer playground switches to the kitchen sink fixture", async ({ page }) => {
  await page.goto("/viewer");
  await expect(page.getByTestId("viewer-page")).toBeVisible();
  await page.getByRole("button", { name: /Kitchen sink workflows/i }).click();
  await expect(page.locator(".example-button--active")).toContainText("Kitchen sink workflows");
});

test("layout showcase supports screenshots for ELK layout output", async ({ page }) => {
  await page.goto("/layout");
  await expect(page.getByTestId("layout-page")).toBeVisible();
  await page.locator("select").first().selectOption("opsAudit");
  await page.locator("select").nth(1).selectOption("horizontal");
  await expect(page.getByTestId("elk-layout-view")).toHaveScreenshot("layout-showcase.baseline.png");
});

test("editor showcase renders the viewer mode shell", async ({ page }) => {
  await page.goto("/editor");
  await expect(page.getByTestId("editor-page")).toBeVisible();
  await page.locator("select").first().selectOption("viewer");
  await expect(page.getByTestId("workflow-editor-shell")).toHaveScreenshot("editor-showcase.baseline.png");
});

test("monaco playground surfaces invalid fixture behavior", async ({ page }) => {
  await page.goto("/monaco");
  await expect(page.getByTestId("monaco-page")).toBeVisible();
  await page.getByRole("button", { name: /Intentionally invalid JSON/i }).click();
  await expect(page.getByText("Last valid document unavailable")).toBeVisible();
  await expect(page.getByTestId("monaco-page")).toHaveScreenshot("monaco-showcase.baseline.png");
});

test("save-flow harness shows confirm and conflict states", async ({ page }) => {
  await page.goto("/save-flow");
  await expect(page.getByTestId("save-flow-page")).toBeVisible();
  await page.getByRole("button", { name: "Request save" }).click();
  await expect(page.getByTestId("save-ack-mode")).toBeVisible();
  await page.getByTestId("save-ack-mode").getByRole("checkbox").check();
  await page.getByTestId("save-ack-warnings").getByRole("checkbox").check();
  await page.getByTestId("save-confirm").click();
  await expect(page.getByText("Save status").locator("..")).toContainText("success");

  await page.locator("select").nth(1).selectOption("conflict");
  await page.getByRole("button", { name: "Request save" }).click();
  await page.getByTestId("save-ack-mode").getByRole("checkbox").check();
  await page.getByTestId("save-ack-warnings").getByRole("checkbox").check();
  await page.getByTestId("save-confirm").click();
  await expect(page.getByTestId("conflict-banner")).toBeVisible();
});
