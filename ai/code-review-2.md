# Release Readiness Review: cyoda-workflow-editor

## Executive Summary

- **Release recommendation:** `Ready after fixes`
- **Blockers:** 1
- **High-priority:** 2
- **Medium-priority:** 4
- **Commands run:** `pnpm build` PASS, `pnpm typecheck` PASS, `pnpm lint` PASS, `pnpm test` PASS, `node ./scripts/release-preflight.mjs` PASS, `pnpm bench` FAIL, `pnpm --filter @cyoda/docs-embed-demo build` PASS

All four previously-identified blockers and high-priority issues from the 10 May `RELEASE_REVIEW.md` review have been resolved: the Monaco editor lifecycle is now stable across renders, the Monaco peer range is widened to `>=0.45 <0.53`, the JSON editor props are documented in both READMEs, and localStorage persistence now covers the full `WorkflowUiMeta` shape including `edgeAnchors` and `viewports`. The release infrastructure (Changesets, CI publish, preflight, provenance) remains clean. The one new blocker is that `pnpm bench` exits with code 1 because `@cyoda/workflow-graph` declares a `bench` script that Vitest executes but finds no bench files, failing the recursive run. The README also claims performance budgets that do not match the bench file (and do not match actual measured performance on M1 Pro). Two new documentation gaps exist for the recently shipped `developerMode` and `hintProvider` props.

---

## Scope

This review excludes all security analysis: vulnerability scanning, dependency CVEs, auth flows, XSS, secrets handling, supply-chain risk, and threat modelling. Security will be reviewed separately.

---

## Release-blocking Issues

### [BLOCKER-001] `pnpm bench` exits with code 1 — `@cyoda/workflow-graph` bench script has no bench files

- **Severity:** Blocker
- **Area:** build / release process
- **Files:**
  - `packages/workflow-graph/package.json` — declares `"bench": "vitest bench --run"`
  - `packages/workflow-graph/tests/` — contains only unit test files, no `*.bench.ts`
- **Problem:**
  The root `pnpm bench` command runs `pnpm -r --filter="./packages/*" run bench`. `@cyoda/workflow-graph` has a `bench` script but no matching bench files. Vitest exits with code 1 when it finds no benchmark files, which propagates as `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` and fails the whole `pnpm bench` run. The root `README.md` documents `pnpm bench` as a supported command that can be run by external contributors and as part of CI-adjacent verification.
- **Evidence:**
  Running `pnpm bench` produces:
  ```
  packages/workflow-graph bench: No benchmark files found, exiting with code 1
  ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @cyoda/workflow-graph@0.1.0 bench: `vitest bench --run`
  Exit status 1
  ```
  Only `@cyoda/workflow-core` and `@cyoda/workflow-graph` declare `bench` scripts; the other four packages do not, so vitest skips them silently.
- **Release impact:**
  Any contributor following the `README.md` quick-start (`pnpm bench`) gets an unexplained failure. If `pnpm bench` is ever added to CI (the bench comment block in `bench.bench.ts` says it should be wired up "in Phase 8"), the build breaks immediately.
- **Recommended fix:**
  Either (a) remove the `bench` script from `packages/workflow-graph/package.json`, or (b) add `--passWithNoTests` to the `vitest bench --run` invocation so Vitest exits 0 when there are no bench files. Option (a) is simpler and honest about what has benchmarks.
- **Suggested package owner:** `@cyoda/workflow-graph`
- **Confidence:** High

---

## High-priority Issues

### [HIGH-001] README performance budgets are stale and incorrect on both axes

- **Severity:** High
- **Area:** documentation
- **Files:**
  - `README.md` lines 531–536 ("Perf budgets (verified on M1 via `pnpm bench`)")
  - `packages/workflow-core/tests/perf/bench.bench.ts` (bench file budget labels)
- **Problem:**
  The root `README.md` states four performance budgets as "verified on M1":

  | README claim | Bench file budget | Actual mean (this M1 Pro run) |
  |---|---|---|
  | parse + validate, 50 states: < 30 ms | < 30 ms | ~6.2 ms ✓ |
  | parse + validate, 500 states: < 150 ms | < 250 ms | 629 ms ✗ |
  | serialize, 500 states: < 40 ms | < 100 ms | ~0.69 ms ✓ |
  | applyPatch on 100-state graph: < 5 ms | < 8 ms | ~0.33 ms ✓ |

  Two problems:
  1. The README budget for 500-state parse (`< 150 ms`) does not match the bench file label (`< 250 ms`). The README is the public-facing number; the bench file is the enforced one.
  2. The actual measured mean on M1 Pro hardware is **629 ms** for 500-state parse — exceeding even the bench file budget of 250 ms by 2.5x. The bench comment says "M1-class CPU; CI adds 1.5x slack", yet 629 ms is still 2x the slack-adjusted budget. The bench does not assert these budgets (it prints them for human inspection), so no automated gate catches the discrepancy.
- **Evidence:**
  `pnpm bench` output:
  ```
  500 states / ~2000 transitions (budget < 250 ms)   1.5894 hz  606ms  657ms  629ms mean
  ```
  README line 534: `- parse + validate at 500 states: < 150 ms`
  bench.bench.ts line: `bench("500 states / ~2000 transitions (budget < 250 ms)", () => {`
- **Release impact:**
  An external developer reads the README, trusts the "verified on M1" claim, and uses 500-state parse latency in their integration design. The actual performance is 4x the published number. This damages credibility when discovered.
- **Recommended fix:**
  Update the README budgets to match the bench file. For the 500-state parse figure, the README should be updated to `< 250 ms` (to match the bench) and the actual measured performance discrepancy against that budget investigated. If the bench generator (`generateGrid(500, 4)`) produces an atypically dense graph, document that. If the 629 ms is real and the budget needs revisiting, revise the budget rather than leaving a published claim that cannot be verified.
- **Suggested package owner:** `@cyoda/workflow-core` (bench), root README (docs)
- **Confidence:** High

### [HIGH-002] `developerMode` and `hintProvider` props are undocumented in both READMEs

- **Severity:** High
- **Area:** documentation / public API
- **Files:**
  - `README.md` — `WorkflowEditorProps` table (lines ~180–193)
  - `packages/workflow-react/README.md` — Props table (lines 66–81)
  - `packages/workflow-react/src/components/WorkflowEditor.tsx` — `WorkflowEditorProps` interface lines 91–111
- **Problem:**
  Two props that are part of the released public API of `@cyoda/workflow-react` do not appear in either the root README or the package README props tables:
  - `developerMode?: boolean` — described in the changeset (`editor-release-polish.md`) as a key behavioural switch that defaults to `false`; hosts that previously relied on the JSON tab in the inspector must opt in. This is a breaking-in-practice change for any host that used the inspector JSON tab without explicitly setting `developerMode`.
  - `hintProvider?: EntityFieldHintProvider` — enables model-schema autocomplete in criterion `jsonPath` inputs; wired through `EditorConfigContext` and consumed by `CriterionForm`. Not mentioned anywhere in either README.
- **Evidence:**
  `grep -n "developerMode\|hintProvider" README.md` returns zero hits.
  `grep -n "developerMode\|hintProvider" packages/workflow-react/README.md` returns zero hits.
  Both props are declared in `WorkflowEditorProps` and consumed in the component. `developerMode` is covered in the changeset text but that text only reaches developers watching the changelog, not first-time README readers.
- **Release impact:**
  An existing host app that used the inspector JSON tab (common during development) will silently lose it after upgrading. The prop to restore it is not documented. `hintProvider` is an integration point for Cyoda-specific field autocomplete; external Cyoda integrators have no documentation path to discover it.
- **Recommended fix:**
  Add both props to the `WorkflowEditorProps` tables in both READMEs. For `developerMode`, add a note that it defaults to `false` and that the JSON inspection tab is only visible when `true`. For `hintProvider`, add a note that it is optional and describe its effect on `jsonPath` inputs.
- **Suggested package owner:** `@cyoda/workflow-react` (docs)
- **Confidence:** High

---

## Medium-priority Issues

### [MEDIUM-001] README test count table is significantly stale

- **Severity:** Medium
- **Area:** documentation
- **Files:**
  - `README.md` lines 519–529 (Testing and quality gates section)
- **Problem:**
  The table claims: `workflow-core 63`, `workflow-viewer 8`, `workflow-react 66`, total `186`. Actual `pnpm test` output from this review session: `workflow-core 140`, `workflow-graph 13`, `workflow-viewer 9`, `workflow-layout 24`, `workflow-react 203`, `workflow-monaco 12`, total `401`. Every count is wrong; the core and react packages are off by more than 3x due to substantial test additions since the table was written.
- **Evidence:**
  `pnpm test` output (verified this session, all 401 tests green):
  ```
  workflow-core:   140 tests (16 files)
  workflow-graph:   13 tests
  workflow-viewer:   9 tests
  workflow-layout:  24 tests
  workflow-react:  203 tests (28 files)
  workflow-monaco:  12 tests
  ```
- **Release impact:**
  The table is the first signal of test coverage credibility for external evaluators. Understating by more than half undermines confidence.
- **Recommended fix:**
  Either refresh the numbers to match current output, or remove the static table and replace it with: "All packages ship vitest suites. Run `pnpm test` for current counts." The latter avoids future drift.
- **Suggested package owner:** root README
- **Confidence:** High

### [MEDIUM-002] README toolbar label copy does not match shipped i18n strings

- **Severity:** Medium
- **Area:** documentation
- **Files:**
  - `README.md` — Keyboard shortcuts table (lines 314–321) and Full editor capabilities section
  - `packages/workflow-react/README.md` — Manual layout bullet and keyboard shortcut table (lines 138–143)
  - `packages/workflow-react/src/i18n/en.ts` lines 11–12
- **Problem:**
  The `editor-release-polish.md` changeset renamed toolbar labels: `"Auto Layout"` → `"Auto-arrange"` and `"Reset Layout"` → `"Reset positions"`. The i18n source confirms these strings are live. Neither README was updated:
  - Root README keyboard shortcut table: `L | Auto layout` and `Shift+L | Reset layout`
  - Root README Full editor capabilities section: "Reset Layout / Auto Layout toolbar buttons"
  - `packages/workflow-react/README.md` keyboard shortcuts table: same stale values; manual layout bullet: "Reset Layout / Auto Layout toolbar buttons"

  A developer consulting the README to describe the editor to stakeholders will use the wrong labels.
- **Evidence:**
  `packages/workflow-react/src/i18n/en.ts`:
  ```ts
  autoLayout: "Auto-arrange",
  resetLayout: "Reset positions",
  ```
  Both README keyboard tables still say `Auto layout` and `Reset layout`.
- **Recommended fix:**
  Update both READMEs to say `Auto-arrange` and `Reset positions`.
- **Suggested package owner:** root README, `@cyoda/workflow-react` (docs)
- **Confidence:** High

### [MEDIUM-003] Demo app `/criteria` route is undocumented in the demo README

- **Severity:** Medium
- **Area:** documentation / demo
- **Files:**
  - `apps/docs-embed-demo/README.md` — Routes section
  - `apps/docs-embed-demo/src/App.tsx` — route definitions
- **Problem:**
  `App.tsx` defines and routes to `/criteria` (the `CriteriaEditorPage`), which the changeset (`contextual-workflow-inspector.md`) describes as a "Demo and regression page for the criterion editor with model-schema autocomplete wired to the StructuredTrade entity sample." The demo README's Routes section lists eight routes (`/`, `/viewer`, `/layout`, `/editor`, `/monaco`, `/save-flow`, `/utilities`, `/embed`) but omits `/criteria`. The visual regression README section also does not list `/criteria` as a route worth capturing baselines for, even though a `criteria-editor.spec.ts` Playwright spec exists.
- **Evidence:**
  `apps/docs-embed-demo/README.md` Routes section has no entry for `/criteria`.
  `apps/docs-embed-demo/src/App.tsx` defines and renders `CriteriaEditorPage` at `/criteria`.
- **Recommended fix:**
  Add `/criteria` to the demo README routes table with its description. Optionally add it to the "Routes most worth capturing" list in the visual regression section.
- **Suggested package owner:** `@cyoda/docs-embed-demo`
- **Confidence:** High

### [MEDIUM-004] `WorkflowExamplesPage.tsx` is a dead file in the demo app

- **Severity:** Medium
- **Area:** demo / code hygiene
- **Files:**
  - `apps/docs-embed-demo/src/pages/WorkflowExamplesPage.tsx`
  - `apps/docs-embed-demo/src/App.tsx`
- **Problem:**
  `WorkflowExamplesPage.tsx` exists in the pages directory but is not imported anywhere in `App.tsx` (confirmed: `grep -c "WorkflowExamplesPage" apps/docs-embed-demo/src/App.tsx` returns 0). The file is never rendered. `App.tsx` does redirect the legacy `/examples` path to `/viewer`, but that is unrelated to this component. The dead file will be bundled or silently excluded by Vite; either way it represents stale code that could mislead a maintainer.
- **Evidence:**
  `WorkflowExamplesPage.tsx` contains a full `export function WorkflowExamplesPage()` component. No import of it exists in `App.tsx` or any other file in `apps/docs-embed-demo/src/`.
- **Recommended fix:**
  Delete `apps/docs-embed-demo/src/pages/WorkflowExamplesPage.tsx` or, if the page is planned for later use, leave a comment saying so.
- **Suggested package owner:** `@cyoda/docs-embed-demo`
- **Confidence:** High

---

## Verified Good / Non-issues

- **All quality gates pass:** `pnpm build` (6/6 packages, ESM + CJS + `.d.ts`), `pnpm typecheck` (6/6 packages, zero errors), `pnpm lint` (ESLint exits 0, no output), `pnpm test` (401 tests across 28 files, all green), `node ./scripts/release-preflight.mjs` (validates all 6 public packages and 2 private packages), `pnpm --filter @cyoda/docs-embed-demo build` (Vite build succeeds).
- **BLOCKER-001 from prior review (Monaco lifecycle) is fixed.** `WorkflowJsonEditor` mount effect now depends only on `[monaco, modelUri]` (line 169). Callbacks are accessed through stable refs (`onPatchRef`, `onStatusChangeRef`, `onSelectionChangeRef`). The editor instance is not recreated on document or patch changes.
- **HIGH-001 from prior review (Monaco peer range) is fixed.** `@cyoda/workflow-monaco` now declares `"monaco-editor": ">=0.45 <0.53"`, covering the `0.52.2` version used by the demo.
- **HIGH-002 from prior review (JSON editor props undocumented) is fixed.** Both the root README and `packages/workflow-react/README.md` now document `enableJsonEditor`, `jsonEditorPlacement`, `jsonEditor`, and `onJsonStatusChange`, with a minimal usage example and types description.
- **HIGH-003 from prior review (edgeAnchors/viewports lost in localStorage) is fixed.** The write-back now stores `toStore[wfName] = ui` (the full `WorkflowUiMeta` object), and the read-back uses `merged[wfName] = { ...(merged[wfName] ?? {}), ...ui }`, covering all fields including `edgeAnchors` and `viewports`.
- **MEDIUM-003 from prior review (readOnly spread order) is fixed.** `WorkflowJsonEditor` now spreads `editorOptions` first and enforces `readOnly: readOnlyRef.current` last, so the editor-level read-only intent always wins.
- **Viewer package dependency hygiene is clean.** No `reactflow` or `monaco-editor` imports exist anywhere in `packages/workflow-viewer/src/`. The viewer depends only on `@cyoda/workflow-core` and `@cyoda/workflow-graph`.
- **Metadata exclusion from exported workflow JSON is verified.** `packages/workflow-core/tests/patch/serialization-clean.test.ts` (6 tests) explicitly covers layout positions, comments, edge anchors, viewport state, and round-trip identity. `cleanupWorkflowUi` runs after `replaceSession` to scrub stale entries.
- **Private packages remain private.** Root `cyoda-workflow-editor` and `@cyoda/docs-embed-demo` both have `"private": true`. `.changeset/config.json` explicitly ignores `@cyoda/docs-embed-demo`.
- **All 6 public packages pass preflight.** Names, license (`Apache-2.0`), `publishConfig.access: "public"`, `publishConfig.provenance: true`, `repository.url`, `homepage`, `bugs.url`, `files` array, export paths, `README.md`, and `LICENSE` all validated by `scripts/release-preflight.mjs`.
- **Release infrastructure is clean.** `ci.yml` runs install/typecheck/build/test. `release.yml` uses `changesets/action@v1` with `id-token: write` (OIDC/provenance ready); publishes only on main or via `workflow_dispatch`. `release-preflight.yml` is wired to release branches and PRs. No `npm publish` from developer machines.
- **Visual regression baselines exist** for `alert-triage`, `capability-showcase` (editor, layout, Monaco), and `node-drag` (uses DOM assertions, no screenshots needed). `criteria-editor.spec.ts` contains no `toHaveScreenshot` calls so it needs no baselines.
- **Demo app builds clean.** `pnpm --filter @cyoda/docs-embed-demo build` completes with no errors. The large bundle (5.5 MB index chunk) is expected given Monaco bundling; this is the internal demo, not a distributed package.
- **Changeset coverage is complete** for all shipped packages: `full-editor-mvp.md` covers all 6 public packages; `editor-release-polish.md`, `criterion-wrap-and-group.md`, and `contextual-workflow-inspector.md` each add additional `@cyoda/workflow-react` bumps. `@cyoda/docs-embed-demo` is correctly excluded from all changesets.

---

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `pnpm build` | PASS | 6/6 packages; ESM + CJS + `.d.ts` via tsup. |
| `pnpm typecheck` | PASS | 6/6 packages, zero TypeScript errors. |
| `pnpm lint` | PASS | ESLint exits 0, no output. |
| `pnpm test` | PASS | 401 tests / 28 files across 6 packages, all green. |
| `node ./scripts/release-preflight.mjs` | PASS | All 6 public packages and 2 private packages validated. |
| `pnpm bench` | FAIL | `@cyoda/workflow-graph` bench script has no bench files; Vitest exits 1. See BLOCKER-001. |
| `pnpm --filter @cyoda/docs-embed-demo build` | PASS | Vite build clean; 5.5 MB index chunk expected (Monaco). |
| `pnpm --filter @cyoda/docs-embed-demo test:visual` | Not run | Requires running dev server; browser interaction excluded from this review. Baselines for `capability-showcase` and `alert-triage` specs exist. |

---

## Package Impact

| Package | Changed? | Public API affected? | Release concern |
|---|---:|---:|---|
| `@cyoda/workflow-core` | Yes (minor) | Yes | Additive API bump per `full-editor-mvp.md`. Tests cover inverses, serialization-clean, and round-trip. No blockers. |
| `@cyoda/workflow-graph` | Patch (docs) | No | BLOCKER-001: `bench` script has no bench files. |
| `@cyoda/workflow-layout` | Patch | No | Clean. |
| `@cyoda/workflow-monaco` | Patch | No | Peer range fix from prior review applied. Clean. |
| `@cyoda/workflow-react` | Yes (minor + 3 patches) | Yes (large) | HIGH-002: `developerMode` and `hintProvider` undocumented. MEDIUM-002: toolbar label copy stale. Otherwise clean; prior blocker and highs resolved. |
| `@cyoda/workflow-viewer` | Patch | No | No editor deps. Clean. |
| `cyoda-workflow-editor` (root, private) | — | — | Private; excluded from publish. |
| `@cyoda/docs-embed-demo` (private) | — | — | Private; MEDIUM-003 (missing `/criteria` in README) and MEDIUM-004 (dead `WorkflowExamplesPage.tsx`). |

---

## Public API and Package Hygiene

- **Package names:** All 6 public packages use `@cyoda/` scope. Names match `preflight` expectations.
- **Exports maps:** All packages use explicit `exports` with `types`/`import`/`require` conditions. `@cyoda/workflow-viewer` correctly exports a secondary `./theme` entry. No wildcard re-exports.
- **Peer dependencies:** `@cyoda/workflow-react` declares `reactflow: ^11`, `react: ^18.3.1`, `react-dom: ^18.3.1`. `@cyoda/workflow-monaco` declares `monaco-editor: >=0.45 <0.53` (fixed from prior review) with `react`/`react-dom` as optional peers. `@cyoda/workflow-viewer` declares `react`/`react-dom` as required peers.
- **Dev vs runtime dependencies:** `immer`, `uuid`, `zod` are runtime deps in `workflow-core`. `elkjs` is a runtime dep in `workflow-layout`. All `@testing-library`, `jsdom`, and `vitest` dependencies are devDependencies. No test tooling leaks into runtime.
- **Package descriptions:** All present and accurate.
- **Type declarations:** All packages ship `.d.ts` and `.d.cts` via tsup. `types` field in `package.json` and `exports.types` both point to `./dist/index.d.ts`.
- **ESM/CJS output:** All packages ship both. `"type": "module"` is set correctly.
- **No private source path imports between packages:** All cross-package imports use `@cyoda/workflow-*` scoped names, never relative `../../` paths across package boundaries.
- **No accidental editor deps in viewer:** Confirmed (see Verified Good).
- **No accidental Monaco dep in core/viewer:** Confirmed. Monaco is only in `workflow-monaco` and `workflow-react`.
- **No accidental React Flow dep in viewer:** Confirmed.
- **Private packages remain private:** Confirmed (see Verified Good).
- **`files` entries:** All packages include `dist`, `README.md`, `LICENSE`.
- **License metadata:** `Apache-2.0` in all 6 public packages. `LICENSE` file present in each.
- **`workspace:*` protocol:** Used for all intra-monorepo deps; Changesets handles replacement on publish.

---

## Documentation Review

- **Root README:** Accurate on package structure, dependency graph, install commands, and editor capabilities. The JSON editor section (`enableJsonEditor`, `jsonEditorPlacement`, `jsonEditor`, `onJsonStatusChange`) is complete and includes a working example. **Stale:** test count table (HIGH → MEDIUM-001), performance budgets (HIGH-001), toolbar label copy (MEDIUM-002), missing `developerMode`/`hintProvider` props (HIGH-002).
- **`packages/workflow-react/README.md`:** Install command, capabilities, and JSON editor section are accurate and include a working snippet. Props table is complete for the documented props but missing `developerMode` and `hintProvider` (HIGH-002). Keyboard shortcuts table uses stale label names (MEDIUM-002).
- **Package READMEs (core, graph, layout, viewer, monaco):** All present and accurately describe their respective APIs. License section present in each.
- **`apps/docs-embed-demo/README.md`:** Routes section is missing `/criteria` (MEDIUM-003). Visual regression section is accurate for the four routes listed; `criteria-editor.spec.ts` needs no snapshot.
- **`RELEASE.md`:** References `ai/npm-release-mechanism.md` which exists. Quick rules are accurate.
- **`AGENTS.md`:** Accurate. Release rules match current CI and Changesets config.
- **`.changeset/config.json`:** Correct: `baseBranch: "main"`, `access: "public"`, `ignore: ["@cyoda/docs-embed-demo"]`.
- **Unreleased changesets:** Four changesets are present (not yet versioned). All describe real shipped behaviour. The `full-editor-mvp.md` bullet about `L` / `Shift+L` keyboard shortcuts is positionally ambiguous (it reads "Reset Layout / Auto Layout toolbar buttons; `L` / `Shift+L` keyboard shortcuts" which could imply L=Reset), but this is a changeset that becomes a `CHANGELOG.md` entry. The actual README keyboard tables are also stale (MEDIUM-002), so fixing the READMEs also resolves the ambiguity in the public-facing label copy.
- **Deferred work section in root README:** Accurately lists ELK worker offload, Storybook, `workflow-svg-export`, visual baselines, and arrow-key navigation. These match the repo state.
- **OpenAPI/runtime contract:** `ai/cyoda-go-openapi.json` is present. Processor types `externalized` and `scheduled` match the documented contract in the README and the implemented schema in `ProcessorSchema`. Execution modes (`SYNC`, `ASYNC_SAME_TX`, `ASYNC_NEW_TX`, `COMMIT_BEFORE_DISPATCH`) match `ExecutionModeSchema`.

---

## Editor Behaviour Review

Reviewed from source; no browser interaction performed.

- **State add/rename/delete/set-initial:** `AddStateModal`, `StateForm`, `DeleteStateModal` all present and wired. Rename collision guard exists in `StateForm`. Delete counts incoming+outgoing transitions and requires confirmation.
- **Transition add/rename/retarget/move-source/reorder/delete:** All implemented. Drag-connect via `DragConnectModal`. Retarget via inspector dropdown. `moveTransitionSource` patch wired. Manual/disabled toggles present.
- **Anchor dropdown:** `anchorInspector.test.tsx` tests 5 scenarios. Inspector writes `setEdgeAnchors` patch. Anchors now persist across page reload (HIGH-003 fix verified).
- **Criteria editor:** `CriterionForm.tsx` (2116 lines) implements all five criterion types (`simple`, `group`, `function`, `lifecycle`, `array`) with recursive group editing. Draft editing: Apply commits patch, Cancel discards. Raw JSON escape hatch present. `criterionArray.test.tsx`, `criterionFunction.test.tsx`, `criterionGroup.test.tsx`, `criterionLifecycle.test.tsx`, `criterionSimple.test.tsx`, `criterionModal.test.tsx` all pass.
- **Processor editor:** `ProcessorForm.tsx` (833 lines) covers `externalized` and `scheduled` processor types with full field coverage. Draft editing pattern identical to criteria. `processorModal.test.tsx` and `processorUndo.test.tsx` pass.
- **JSON editor sync:** `jsonEditorIntegration.test.tsx` (7 tests) covers graph-to-JSON and JSON-to-graph sync. Monaco lifecycle is now stable (prior BLOCKER-001 fixed).
- **Invalid JSON handling:** `attachWorkflowJsonController` isolates invalid JSON from the canonical document. `onJsonStatusChange` reports state. Tested in `jsonEditorIntegration.test.tsx`.
- **Undo/redo:** `UndoEntry` uses `patches[]`/`inverses[]` arrays. `dispatchTransaction` for atomic multi-patch undo. `keyboardShortcuts.test.tsx` covers Ctrl+Z and Ctrl+Shift+Z.
- **Validation/issues display:** Toolbar pills and inline inspector errors. `issueBadge.test.tsx` covers badge rendering and jump-to navigation (new from `editor-release-polish.md`).
- **Save/import flow:** `saveFlow.test.tsx` (6 tests) covers MERGE/REPLACE/ACTIVATE modes and conflict handling.
- **Selection sync:** `inspectorSelectionSync.test.tsx` (7 tests).
- **Empty inspector:** `contextual-workflow-inspector.md` changeset hides inspector when there is no editable selection.
- **Canvas clipping:** Prior review noted viewport fit padding fix. `viewport.test.tsx` (4 tests) covers fit padding.
- **developerMode:** `developerMode.test.tsx` (3 tests) verify the JSON tab is hidden by default and visible when `developerMode={true}`.
- **Automated transition ordering:** `automatedOrderingInspector.test.tsx` (1 test), `automatedOrdering.test.ts` (7 tests).

---

## Core Model Review

- **Parse/normalize/serialize round-trip:** `roundtrip.test.ts` (4 property-based tests using fast-check). `serialization-clean.test.ts` (6 tests) verifies metadata exclusion.
- **Deterministic serialization:** Tested. `serializeImportPayload` output is documented as byte-stable.
- **Patch/inverse correctness:** `exact-inverses.test.ts` (12 tests), `transaction.test.ts` (4 tests), `rename-collision.test.ts` (5 tests).
- **Metadata exclusion:** Confirmed in source (`serializeImportPayload` checks `meta.workflowUi` is excluded) and in tests.
- **Validation issue targeting:** `semantic.test.ts` (11 tests).
- **OpenAPI/runtime alignment:** Processor types, execution modes, and scheduled config fields match `ai/cyoda-go-openapi.json`. `processor-contract.test.ts` (7 tests) validates round-trip for `externalized` and `scheduled` types.
- **Criteria operators:** `operators.test.ts` (7 tests), `normalize.test.ts` (9 tests), `jsonPathSubset.test.ts` (19 tests), `describe.test.ts` (9 tests).
- **Golden fixtures:** `golden/runner.test.ts` (5 tests) validates fixture-driven parse/serialize.
- **Migration registry:** `findMigrationPath`, `migrateSession`, `registerMigration` exported. `migrate/` directory present.

---

## Demo App Review

- **Routes:** `/`, `/viewer`, `/layout`, `/editor`, `/criteria`, `/monaco`, `/save-flow`, `/utilities`, `/embed` — all wired in `App.tsx`. `/examples` redirects to `/viewer`.
- **Private status:** `"private": true`. Not publishable. Not in any changeset.
- **Fixture coverage:** Demo uses valid, warning-heavy, multi-workflow, and invalid payloads based on `src/examples/` and `src/lib/` structure.
- **Debug panels:** Demo pages surface canonical JSON, lift results, patches, and migration output. These are appropriate for the internal regression harness role.
- **Stale dead code:** `WorkflowExamplesPage.tsx` is unreachable (MEDIUM-004).
- **Missing route in README:** `/criteria` (MEDIUM-003).
- **Visual baselines:** Present for `capability-showcase` (editor, layout, Monaco) and `alert-triage`. `criteria-editor.spec.ts` uses functional assertions only, so no baseline is needed.
- **Bundle:** Vite build clean, 5.5 MB Monaco bundle expected and appropriate for a demo.

---

## Test Coverage Review

**Adequate for release:**
- Core patch/inverse logic: comprehensive (12 inverse tests, 4 transaction tests, 5 collision tests).
- Deterministic serialization: covered (6 tests).
- Metadata exclusion: covered (6 tests).
- Criteria editor flows: well covered (5 type-specific test files + modal + lifecycle = ~66 criteria tests).
- Processor editor flows: covered (`processorModal.test.tsx` 9 tests, `processorUndo.test.tsx` 2 tests).
- JSON editor sync: covered (7 tests).
- Node dragging and edge redraw: covered (`nodeDrag.test.tsx` 17 tests, `dragConnect.test.tsx` 10 tests).
- Anchor dropdown: covered (`anchorInspector.test.tsx` 5 tests).
- Issue badge navigation: covered (`issueBadge.test.tsx` 4 tests).
- Viewer dependency hygiene: confirmed by grep (no reactflow/monaco imports in viewer source).
- State editing: covered (`state-editing.test.tsx` 11 tests, `stateDeletePersistence.test.tsx` 1 test).

**Gaps (not blocking release, but worth tracking):**
- No unit test asserting that `localStorage` correctly persists and restores `edgeAnchors` and `viewports` across a simulated component remount. The fix is in source but has no regression test.
- No unit test verifying `developerMode={false}` hides the JSON tab and `developerMode={true}` shows it in the inspector (partially covered by `developerMode.test.tsx` but the inspector-level JSON tab visibility is not explicitly asserted).
- Demo smoke tests (Playwright) are not run in CI; the `ci.yml` workflow does not include a step for Playwright. Visual baselines are darwin-platform snapshots that would fail on Linux CI.

---

## Release Process Review

- **Changesets presence:** Four changesets pending (none versioned yet). All target correct public packages. `@cyoda/docs-embed-demo` correctly excluded.
- **Semver levels:** `workflow-core` minor (additive API), `workflow-react` minor (multiple new public props and behaviours). Graph/layout/viewer/monaco patch. Levels are correct.
- **Private package exclusions:** Root and demo are private; changeset config `ignore` array and `private: true` both guard this.
- **CI publishing model:** `release.yml` uses `changesets/action@v1`. Only `main` branch triggers automated version PR creation and publish. `workflow_dispatch` enables manual branch publish (for prereleases). No laptop-driven `npm publish` path exists.
- **Release preflight:** `release-preflight.mjs` validates all public package metadata, export path existence, and `npm pack --dry-run`. Passes cleanly.
- **Provenance:** `publishConfig.provenance: true` on all public packages. Release workflow has `id-token: write` permission. OIDC-based trusted publishing is configured.
- **No local `npm publish` workflow:** Confirmed. `package.json` `release` script delegates to `node ./scripts/release-publish.mjs` which uses `pnpm exec changeset publish`.
- **Lint not in CI:** `ci.yml` does not run `pnpm lint`. Lint passes locally (verified this session) but is not a CI gate. This is a pre-existing condition and not blocking release, but it means lint regressions can reach main undetected.

---

## Recommended Fix Order

1. **BLOCKER-001** — Remove the `bench` script from `packages/workflow-graph/package.json` (or add `--passWithNoTests`). This makes `pnpm bench` pass as documented.
2. **HIGH-002** — Add `developerMode` and `hintProvider` to the `WorkflowEditorProps` tables in both `README.md` and `packages/workflow-react/README.md`. Include a note that `developerMode` defaults to `false` and the inspector JSON tab requires opt-in.
3. **HIGH-001** — Align the root README performance budget for 500-state parse with the bench file (`< 250 ms`, not `< 150 ms`). Investigate why the actual measured mean (629 ms on M1 Pro) exceeds even the corrected budget and either fix the bench generator, the implementation, or the stated budget.
4. **MEDIUM-002** — Update both README keyboard shortcut tables and capability descriptions to use `Auto-arrange` and `Reset positions` to match the shipped i18n strings.
5. **MEDIUM-001** — Refresh the test count table in `README.md` to `workflow-core 140`, `workflow-graph 13`, `workflow-viewer 9`, `workflow-layout 24`, `workflow-react 203`, `workflow-monaco 12`, total `401` — or replace with a sentence directing users to `pnpm test`.
6. **MEDIUM-003** — Add the `/criteria` route entry to `apps/docs-embed-demo/README.md`.
7. **MEDIUM-004** — Delete `apps/docs-embed-demo/src/pages/WorkflowExamplesPage.tsx`.

---

## Final Recommendation

Fix BLOCKER-001 (the `pnpm bench` failure) before tagging the release — it is a one-line removal that has a direct impact on any contributor following the documented workflow. While in a fix PR, also ship HIGH-002 (document `developerMode` and `hintProvider`) and HIGH-001 (align the perf budget numbers). These three together close the gaps that matter for a first-impression public release. The remaining medium items are documentation corrections that can land in the same PR at low risk. All four blockers and highs from the 10 May review have been resolved, and the core quality gates (build, typecheck, lint, test, preflight) are all green. The release infrastructure is solid and the serialization contract (metadata exclusion, deterministic round-trip) is well-tested. The project is one small PR away from being in a clean state to publish.
