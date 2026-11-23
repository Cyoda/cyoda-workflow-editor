/**
 * Release smoke suite — see playwright.smoke.config.ts for how to run it.
 * Written for the cyoda-go 0.9.0 / monaco-editor 0.57 release; covers the
 * paths that release touched plus two bugs it surfaced (viewer drag crash,
 * Firefox file picker / export files in the local file editor).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../../../packages/workflow-core/tests/dialect/fixtures");
const EXPORT_090 = readFileSync(join(fixtures, "cyoda-0_9_0-export.json"), "utf8");
const EXPORT_084 = readFileSync(join(fixtures, "cyoda-0_8_4-export.json"), "utf8");
// Optional: a running cyoda-go 0.9.0 with a locked model `probe`/1.
const CYODA = process.env.CYODA_URL;

// A file in the cyoda-go 0.8.3/0.8.4 shape: startNewTxOnDispatch inside
// config, and the old exporters' `delayMs: 0` beside a schedule function.
const LEGACY_08X = JSON.stringify(
  {
    importMode: "MERGE",
    workflows: [
      {
        version: "1.4",
        name: "Legacy",
        initialState: "A",
        active: true,
        states: {
          A: {
            transitions: [
              {
                name: "go",
                next: "B",
                manual: true,
                processors: [
                  {
                    type: "externalized",
                    name: "commit",
                    executionMode: "COMMIT_BEFORE_DISPATCH",
                    config: { calculationNodesTags: "t", startNewTxOnDispatch: true },
                  },
                ],
              },
              {
                name: "tick",
                next: "B",
                manual: false,
                schedule: {
                  delayMs: 0,
                  function: { name: "when", resultKind: "Schedule", calculationNodesTags: "t" },
                },
              },
            ],
          },
          B: { transitions: [] },
        },
      },
    ],
  },
  null,
  2,
);

/** The parts of a saved workflow file these tests inspect. */
interface SavedTransition {
  name: string;
  processors?: Array<{ startNewTxOnDispatch?: boolean; config?: Record<string, unknown> }>;
  schedule?: { function?: { retryPolicy?: string } } & Record<string, unknown>;
}
interface SavedWorkflow {
  states: Record<string, { transitions: SavedTransition[] }>;
}

function savedWorkflow(saved: Record<string, unknown>): SavedWorkflow {
  return (saved["workflows"] as SavedWorkflow[])[0]!;
}

function savedTransition(wf: SavedWorkflow, state: string, name: string): SavedTransition {
  const t = wf.states[state]!.transitions.find((x) => x.name === name);
  expect(t, `transition ${state}/${name}`).toBeDefined();
  return t!;
}

const ROUTES = [
  "/",
  "/viewer",
  "/layout",
  "/editor",
  "/criteria",
  "/monaco",
  "/save-flow",
  "/utilities",
  "/embed",
  "/examples",
  "/ops-viewer",
  "/local-file-editor",
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  // Monaco cancels in-flight work on dispose with a benign "Canceled" error.
  const ignore = (msg: string) => /Canceled/i.test(msg);
  page.on("pageerror", (e) => {
    if (!ignore(e.message)) errors.push(`pageerror: ${e.message}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !ignore(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/** Run `fn` against the page's own monaco-editor module (the Vite dep bundle). */
async function withMonaco<T>(page: Page, fn: string, arg: unknown): Promise<T> {
  return page.evaluate(
    async ({ fn, arg }) => {
      const url = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => /\/deps\/monaco-editor\.js/.test(n));
      if (!url) throw new Error("monaco-editor module not loaded");
      const monaco = await import(/* @vite-ignore */ url);
      return new Function("monaco", "arg", `return (${fn})(monaco, arg);`)(monaco, arg);
    },
    { fn, arg },
  ) as Promise<T>;
}

function setModel(page: Page, uriPrefix: string, value: string) {
  return withMonaco<void>(
    page,
    `(monaco, a) => { const m = monaco.editor.getModels().find((x) => x.uri.toString().startsWith(a.uriPrefix)); if (!m) throw new Error("no model " + a.uriPrefix); m.setValue(a.value); }`,
    { uriPrefix, value },
  );
}

function markers(page: Page, uriPrefix: string) {
  return withMonaco<string[]>(
    page,
    `(monaco, a) => { const m = monaco.editor.getModels().find((x) => x.uri.toString().startsWith(a.uriPrefix)); return monaco.editor.getModelMarkers({ resource: m.uri }).map((k) => k.owner + ": " + k.message); }`,
    { uriPrefix },
  );
}

/** Install a fake File System Access API serving `contents`; capture writes. */
async function fakeFileSystem(page: Page, name: string, contents: string) {
  await page.addInitScript(
    ({ name, contents }) => {
      const state = { writes: [] as string[] };
      (window as unknown as { __fs: typeof state }).__fs = state;
      const handle = {
        kind: "file" as const,
        name,
        async getFile() {
          return new File([contents], name, { type: "application/json" });
        },
        async createWritable() {
          return {
            async write(data: string | Blob) {
              state.writes.push(typeof data === "string" ? data : await data.text());
            },
            async close() {},
          };
        },
      };
      Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: async () => [handle] });
      Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async () => handle });
    },
    { name, contents },
  );
}

async function removeFileSystemAccess(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: undefined });
    Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined });
  });
}

async function openViaFileInput(page: Page, name: string, contents: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("local-file-editor-open-toolbar").click();
  await (await chooser).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(contents) });
}

async function selectTransition(page: Page, name: string) {
  // Labels render as e.g. "GO\n3 processors…": pick the one whose first
  // rendered line is the transition name.
  await expect(page.locator('[data-testid^="rf-edge-label-"]').first()).toBeVisible();
  const testId = await page
    .locator('[data-testid^="rf-edge-label-"]')
    .evaluateAll(
      (els, wanted) =>
        els
          .find((e) => (e as HTMLElement).innerText.split("\n")[0]!.trim().toLowerCase() === wanted)
          ?.getAttribute("data-testid") ?? null,
      name.toLowerCase(),
    );
  expect(testId, `edge label for ${name}`).not.toBeNull();
  await page.getByTestId(testId!).dispatchEvent("click");
  await expect(page.getByTestId("inspector-transition-name")).toHaveValue(name);
}

async function saveAndRead(page: Page): Promise<Record<string, unknown>> {
  await page.getByTestId("local-file-editor-save").click();
  await page.getByRole("button", { name: "Overwrite file" }).click();
  await expect(page.getByText(/Saved to /)).toBeVisible();
  const writes = await page.evaluate(() => (window as unknown as { __fs: { writes: string[] } }).__fs.writes);
  expect(writes).toHaveLength(1);
  return JSON.parse(writes[0]!) as Record<string, unknown>;
}

async function renameState(page: Page, from: string, to: string) {
  await page.getByTestId(`rf-state-${from}`).click();
  await page.getByTestId("inspector-state-name").fill(to);
  await page.getByTestId("inspector-state-name").press("Enter");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
}

// ---------------------------------------------------------------------------

test.describe("every demo route", () => {
  for (const route of ROUTES) {
    test(`${route} loads without errors`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

test.describe("viewer drag (blank-screen crash)", () => {
  for (const route of ["/viewer", "/ops-viewer"]) {
    test(`${route}: repeated drags that end on a state keep the viewer alive`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(route);
      const svg = page.locator("svg[data-surface]").first();
      await expect(svg).toBeVisible();
      for (let i = 0; i < 6; i++) {
        // Grab a state node and drag: the graph pans with the cursor, so the
        // release lands on the same node and the click selects it — the exact
        // sequence that crashed.
        const node = svg.locator("g[style*='cursor']").nth(i % 3);
        const box = (await node.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 40, y + 25, { steps: 12 });
        await page.mouse.move(x + 80, y + 10, { steps: 12 });
        await page.mouse.up();
        await page.mouse.click(x + 80, y + 10);
      }
      await expect(svg).toBeVisible();
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

test.describe("local file editor", () => {
  test("file-input fallback opens a cyoda-go 0.9.0 export and shows the 0.9.0 fields", async ({ page }) => {
    const errors = collectErrors(page);
    await removeFileSystemAccess(page);
    await page.goto("/local-file-editor");
    await openViaFileInput(page, "export-0_9_0.json", EXPORT_090);
    await expect(page.getByTestId("local-file-editor-shell")).toBeVisible();
    await expect(page.locator(".local-file-editor__file-name")).toHaveText("export-0_9_0.json");
    await expect(page.getByRole("alert").filter({ hasText: /Unable to open/ })).toHaveCount(0);

    await selectTransition(page, "go");
    await page.getByTestId("processor-edit-0").click();
    await expect(page.getByTestId("processor-editor-modal")).toBeVisible();
    await expect(page.getByTestId("processor-start-new-tx")).toHaveValue("true");
    await expect(page.getByTestId("processor-idempotent")).toHaveValue("true");
    await expect(page.getByTestId("processor-retry-policy")).toHaveValue("FIXED");

    // A negative response timeout is refused by cyoda-go 0.9.0: Apply blocks.
    await page.getByLabel("Response timeout ms").fill("-1");
    await expect(page.getByTestId("processor-modal-error")).toContainText("greater than or equal to 0");
    await expect(page.getByTestId("processor-modal-apply")).toBeDisabled();
    await page.getByTestId("processor-modal-cancel").click();

    await selectTransition(page, "tick");
    await expect(page.getByTestId("inspector-transition-schedule-function-retry-policy")).toHaveValue("NONE");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("file-input fallback opens a cyoda-go 0.8.4 export", async ({ page }) => {
    await removeFileSystemAccess(page);
    await page.goto("/local-file-editor");
    await openViaFileInput(page, "export-0_8_4.json", EXPORT_084);
    await expect(page.getByTestId("local-file-editor-shell")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /Unable to open/ })).toHaveCount(0);
  });

  test("an invalid file names the actual problem", async ({ page }) => {
    await removeFileSystemAccess(page);
    await page.goto("/local-file-editor");
    const broken = JSON.stringify({ importMode: "MERGE", workflows: [{ version: "1.5", name: "w", active: true, states: {} }] });
    await openViaFileInput(page, "broken.json", broken);
    await expect(page.getByText(/Unable to open workflow file: .*initialState/)).toBeVisible();
  });

  test("saving a 0.9.0 export writes the 0.9.0 wire shape (and cyoda-go 0.9.0 imports it)", async ({ page, request }) => {
    await fakeFileSystem(page, "export-0_9_0.json", EXPORT_090);
    await page.goto("/local-file-editor");
    await page.getByTestId("local-file-editor-open-toolbar").click();
    await expect(page.getByTestId("local-file-editor-shell")).toBeVisible();
    await renameState(page, "B", "Done");

    const saved = await saveAndRead(page);
    const json = JSON.stringify(saved);
    const wf = savedWorkflow(saved);
    const commit = savedTransition(wf, "A", "go").processors![0]!;
    expect(commit.startNewTxOnDispatch).toBe(true);
    expect(commit.config).not.toHaveProperty("startNewTxOnDispatch");
    expect(commit.config?.["idempotent"]).toBe(true);
    const tick = savedTransition(wf, "A", "tick");
    expect(tick.schedule?.function?.retryPolicy).toBe("NONE");
    expect(tick.schedule).not.toHaveProperty("delayMs");
    expect(json).not.toMatch(/workflowUi|edgeAnchors|viewports/);

    if (CYODA) {
      const res = await request.post(`${CYODA}/model/probe/1/workflow/import`, {
        data: { ...saved, importMode: "REPLACE" },
      });
      expect(res.status(), await res.text()).toBe(200);
    }
  });

  test("saving a 0.8.x file migrates it to the 0.9.0 shape (and cyoda-go 0.9.0 imports it)", async ({ page, request }) => {
    await fakeFileSystem(page, "legacy.json", LEGACY_08X);
    await page.goto("/local-file-editor");
    await page.getByTestId("local-file-editor-open-toolbar").click();
    await expect(page.getByTestId("local-file-editor-shell")).toBeVisible();
    await renameState(page, "B", "Done");

    const saved = await saveAndRead(page);
    const wf = savedWorkflow(saved);
    const commit = savedTransition(wf, "A", "go").processors![0]!;
    expect(commit.startNewTxOnDispatch).toBe(true);
    expect(commit.config).not.toHaveProperty("startNewTxOnDispatch");
    expect(savedTransition(wf, "A", "tick").schedule).not.toHaveProperty("delayMs");

    if (CYODA) {
      const res = await request.post(`${CYODA}/model/probe/1/workflow/import`, {
        data: { ...saved, importMode: "REPLACE" },
      });
      expect(res.status(), await res.text()).toBe(200);
    }
  });
});

test.describe("monaco-editor 0.57", () => {
  test("the registered workflow schema is enforced by the JSON worker", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/monaco");
    await page.getByRole("button", { name: /Document lifecycle sample/i }).click();
    await expect(page.locator(".monaco-editor").first()).toBeVisible();
    const payload = JSON.parse(EXPORT_090) as Record<string, unknown>;
    const bogus = JSON.stringify({ importMode: "BOGUS", workflows: payload["workflows"] }, null, 2);
    await setModel(page, "cyoda://workflow/", bogus);
    await expect
      .poll(async () => (await markers(page, "cyoda://workflow/")).join("\n"), { timeout: 15_000 })
      .toMatch(/json: Value is not accepted/);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

test.describe("criterion JSON editor", () => {
  async function openCriterionEditor(page: Page) {
    await page.goto("/criteria");
    await page
      .locator('[data-testid^="rf-edge-label-"]')
      .filter({ hasText: "MATCH_MISMATCH" })
      .first()
      .dispatchEvent("click");
    await page.getByTestId("inspector-criterion-edit").click();
    await expect(page.getByTestId("criterion-json-editor")).toBeVisible();
    await expect(page.getByTestId("criterion-json-editor").locator(".view-lines")).toBeVisible();
  }

  test("blocks an undeclared member, with the function.config hint", async ({ page }) => {
    await openCriterionEditor(page);
    await setModel(page, "cyoda://criterion/", JSON.stringify({ type: "function", function: { name: "f", calculationNodesTags: "t" } }));
    await expect(page.getByTestId("criterion-error")).toContainText('Unknown member "calculationNodesTags" at /function');
    await expect(page.getByTestId("criterion-error")).toContainText("belong inside function.config");
    await expect(page.getByTestId("inspector-criterion-apply")).toBeDisabled();
  });

  test("blocks an array clause without an operator", async ({ page }) => {
    await openCriterionEditor(page);
    await setModel(page, "cyoda://criterion/", JSON.stringify({ type: "array", jsonPath: "$.tags[*]", values: ["a"] }));
    await expect(page.getByTestId("criterion-error")).toBeVisible();
    await expect(page.getByTestId("inspector-criterion-apply")).toBeDisabled();
  });

  test("accepts [low, high] pairs under BETWEEN and applies them", async ({ page }) => {
    await openCriterionEditor(page);
    await setModel(
      page,
      "cyoda://criterion/",
      JSON.stringify({ type: "array", jsonPath: "$.scores[*]", operatorType: "BETWEEN", values: [[1, 2], null] }),
    );
    await expect(page.getByTestId("criterion-error")).toHaveCount(0);
    await page.getByTestId("inspector-criterion-apply").click();
    await expect(page.getByTestId("criterion-compact-json")).toContainText("BETWEEN");
  });
});
