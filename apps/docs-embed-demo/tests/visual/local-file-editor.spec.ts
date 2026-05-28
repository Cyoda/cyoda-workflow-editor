import { expect, test } from "@playwright/test";

const WORKFLOW_JSON = JSON.stringify(
  {
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "PlaywrightFlow",
        initialState: "start",
        active: true,
        states: {
          start: {
            transitions: [
              { name: "go", next: "end", manual: false, disabled: false },
            ],
          },
          end: {
            transitions: [],
          },
        },
      },
    ],
  },
  null,
  2,
);

test("local file editor falls back to file input and download mode without File System Access API", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/local-file-editor");
  await expect(page.getByTestId("local-file-editor-page")).toBeVisible();
  await expect(page.getByTestId("local-file-editor-empty")).toBeVisible();
  await expect(
    page.getByText(
      "Direct save back to disk is only available in browsers that support the File System Access API. In this browser, use Download instead.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toBeDisabled();

  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("local-file-editor-open-toolbar").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({
    name: "fallback.json",
    mimeType: "application/json",
    buffer: Buffer.from(WORKFLOW_JSON),
  });

  await expect(page.getByTestId("local-file-editor-shell")).toBeVisible();
  await expect(page.locator(".local-file-editor__file-name")).toHaveText("fallback.json");
  await expect(page.getByRole("button", { name: "Download" })).toBeEnabled();
});

test("local file editor opens, marks dirty, confirms overwrite, and writes clean JSON via File System Access API", async ({
  page,
}) => {
  await page.addInitScript((contents: string) => {
    type WritableState = { writes: string[]; writeCount: number };

    const state: WritableState = { writes: [], writeCount: 0 };
    (window as Window & { __localFileEditorTestState?: WritableState }).__localFileEditorTestState =
      state;

    const handle = {
      kind: "file" as const,
      name: "playwright-workflow.json",
      async getFile() {
        return new File([contents], "playwright-workflow.json", {
          type: "application/json",
        });
      },
      async createWritable() {
        return {
          async write(data: string | Blob) {
            state.writeCount += 1;
            if (typeof data === "string") {
              state.writes.push(data);
              return;
            }
            state.writes.push(await data.text());
          },
          async close() {},
        };
      },
    };

    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: async () => [handle],
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => handle,
    });
  }, WORKFLOW_JSON);

  await page.goto("/local-file-editor");
  await expect(page.getByTestId("local-file-editor-page")).toBeVisible();

  await page.getByTestId("local-file-editor-open-toolbar").click();
  await expect(page.getByTestId("local-file-editor-shell")).toBeVisible();
  await expect(page.locator(".local-file-editor__file-name")).toHaveText(
    "playwright-workflow.json",
  );

  await page.getByTestId("rf-state-start").click();
  await expect(page.getByTestId("inspector")).toBeVisible();
  await page.getByTestId("inspector-state-name").fill("start2");
  await page.getByTestId("inspector-state-name").press("Enter");

  await expect(page.getByText("Unsaved changes")).toBeVisible();

  await page.getByTestId("local-file-editor-save").click();
  await expect(page.getByTestId("local-file-editor-modal")).toBeVisible();
  await expect(page.getByText("Overwrite local file?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByTestId("local-file-editor-modal")).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      return (
        (
          window as Window & {
            __localFileEditorTestState?: { writeCount: number };
          }
        ).__localFileEditorTestState?.writeCount ?? 0
      );
    }),
  ).toBe(0);

  await page.getByTestId("local-file-editor-save").click();
  await page.getByRole("button", { name: "Overwrite file" }).click();

  await expect(page.getByText("Saved to playwright-workflow.json")).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);

  const written = await page.evaluate(() => {
    return (
      (
        window as Window & {
          __localFileEditorTestState?: { writes: string[]; writeCount: number };
        }
      ).__localFileEditorTestState ?? { writes: [], writeCount: 0 }
    );
  });

  expect(written.writeCount).toBe(1);
  expect(written.writes[0]).toContain("\"start2\"");
  expect(written.writes[0]).not.toContain("workflowUi");
  expect(written.writes[0]).not.toContain("edgeAnchors");
  expect(written.writes[0]).not.toContain("viewports");
});
