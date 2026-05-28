# Release Review: cyoda-workflow-editor

## Executive Summary

- **Release recommendation:** `Ready after fixes`
- **Blockers:** 1
- **High-priority issues:** 3
- **Medium-priority issues:** 4
- **Commands run:** `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `node ./scripts/release-preflight.mjs` — **all passed**

Quality gates are green and the release pipeline (Changesets + CI publishing + provenance + preflight) is intact. There is one release‑blocking front‑end bug in the new in‑shell JSON editor that destroys and rebuilds the Monaco editor on every parent render, and three documentation/contract gaps that should be closed before tagging `0.2.0`.

The blocker is a real‑world UX failure (cursor/focus loss, Monaco re‑instantiation on every keystroke) that is masked by the current vitest harness. The high‑priority items are a peer‑range mismatch with the version of Monaco the demo and lockfile actually use, a documentation gap for the new JSON‑editor public API, and silent loss of edge‑anchor / viewport state across reloads.

---

## Release-blocking Issues

### [BLOCKER-001] `WorkflowJsonEditor` recreates the Monaco editor on every parent render

- **Severity:** Blocker
- **Area:** editor / Monaco integration
- **Files:**
  - `packages/workflow-react/src/components/WorkflowJsonEditor.tsx:101-156`
- **Problem:**
  The mount effect that creates the Monaco editor has the dependency array
  `[config, document, issues, onPatch, onSelectionChange, onStatusChange, readOnly]`. Three of those (`onPatch`, `onSelectionChange`, `onStatusChange`) are inline / non‑memoised callbacks supplied by `WorkflowEditor`:
  - `WorkflowEditor.tsx:198` — `const dispatch = (patch) => actions.dispatch(patch);` (new reference every render — passed as `onPatch={dispatch}` at line 636)
  - `WorkflowEditor.tsx:638-641` — inline `onStatusChange={(status) => { setJsonStatus(status); onJsonStatusChange?.(status); }}`
  - `handleSelectionChange` is `useCallback` with deps `[actions, state.activeWorkflow, state.document]`, so it changes on every patch as well.

  Because of that, on *every* parent render the cleanup runs, the editor is `dispose()`d, `editorRef.current` is set to `null`, and a brand‑new Monaco editor is created and mounted inside the same `<div>`. A separate, correctly‑scoped sync effect at lines 158‑165 already handles `document` / `issues` / `readOnly` updates, so the mount effect should depend only on `config` (and possibly `readOnly` for the initial value).

  The companion `MonacoPlaygroundPage.tsx` in the demo uses the same `attachWorkflowJsonController` pattern but with the correct narrow dep list (`[initialDocument, loaded?.text, monaco, selectedFixture.slug]`), confirming the safe shape.

- **Evidence:**
  - The mount effect early‑returns when `editorRef.current` is non‑null (line 102), but the cleanup at lines 145‑155 runs *before* every subsequent invocation, so the guard never actually prevents recreation when deps change.
  - The vitest integration suite (`jsonEditorIntegration.test.tsx`) does not detect this because `createMonacoHarness()` keeps a singleton `lastEditor` / `lastModel` that gets *replaced*, not preserved — all four tests pass even with constant re‑mounting.
  - Real Monaco mount is heavy (model creation, schema registration, listener attach, DOM nodes); doing it on every keystroke‑driven `replaceSession` patch will flash the editor, drop focus, reset cursor position, and bleed CPU.
- **User impact:**
  - The graph + JSON split view (`EditorShowcasePage` `jsonEditorPlacement="split"`) becomes unusable: typing JSON loses focus on the first patch.
  - Tab‑mode users see Monaco visually flicker after every visual edit because each `onChange` triggers Monaco teardown.
  - Bad first impression for the public release showcase, which explicitly invites users to try graph⇄JSON sync.
- **Recommended fix:**
  Either (a) memoise the callbacks at the `WorkflowEditor` level (`useCallback` for `dispatch` and the status handler, stable identity for `onSelectionChange`) **and** narrow the mount effect deps to `[config]`, or (b) move the Monaco lifecycle into a `useRef`‑driven imperative attach/detach that does not key on caller props. Option (a) is small and matches the pattern already used in `MonacoPlaygroundPage.tsx`.
  Add a regression test that asserts `harness.getLastEditor()` identity is stable across `onChange` (e.g. capture `lastEditor` after the first render, then assert it is the same instance after a patch).
- **Suggested owner package:** `@cyoda/workflow-react`
- **Confidence:** High

---

## High-priority Issues

### [HIGH-001] `monaco-editor` peer range is narrower than the version the demo (and lockfile) actually use

- **Severity:** High
- **Area:** package / dependency hygiene
- **Files:**
  - `packages/workflow-monaco/package.json` (peerDependencies)
  - `apps/docs-embed-demo/package.json` (dependencies)
  - `pnpm-lock.yaml`
- **Problem:**
  `@cyoda/workflow-monaco` declares
  `"monaco-editor": "^0.45.0 || ^0.46.0 || ^0.47.0 || ^0.48.0 || ^0.49.0 || ^0.50.0"`,
  but `apps/docs-embed-demo` pins `monaco-editor: ^0.52.2` and the workspace lockfile resolves that. The demo therefore runs against a version of Monaco the published peer range explicitly excludes, while still being used as the canonical capability showcase. External users installing the latest Monaco (≥ 0.51) will get `ERESOLVE` / peer warnings on npm and yarn, and a `--strict-peer-dependencies` consumer will fail to install entirely.
- **Evidence:**
  - `pnpm-lock.yaml` contains two `monaco-editor` specs: `^0.52.2` (demo) and `^0.50.0` (workflow-monaco devDep) — confirms the demo deliberately ships outside the declared peer range.
  - The package README (`packages/workflow-monaco/README.md`) does not state any version constraint, only “consumers supply their own Monaco build”, so the narrow range is also undocumented.
  - The structural `MonacoLike` / `TextModelLike` / `EditorLike` interfaces in `packages/workflow-monaco/src/types.ts` do not change across these versions; the demo running on 0.52 demonstrates this.
- **User impact:** Install friction for any consumer on Monaco ≥ 0.51 (current default). Reviewers will treat the warning as a release‑quality smell.
- **Recommended fix:** Widen the peer range to include the actively‑tested versions, e.g.
  `"monaco-editor": "^0.45.0 || ^0.46.0 || ^0.47.0 || ^0.48.0 || ^0.49.0 || ^0.50.0 || ^0.51.0 || ^0.52.0"`,
  or collapse to `">=0.45 <0.53"`. Bump `workflow-monaco` to a `patch` in the existing changeset to reflect the metadata change. Optionally bump the devDep `monaco-editor` to match the demo so CI tests against the same version users will get.
- **Suggested owner package:** `@cyoda/workflow-monaco`
- **Confidence:** High

### [HIGH-002] Public JSON‑editor props are exported but undocumented

- **Severity:** High
- **Area:** documentation / public API
- **Files:**
  - `README.md` (root) — `WorkflowEditorProps` table at lines ~180–192
  - `packages/workflow-react/README.md` — `Props` table
  - `packages/workflow-react/src/components/WorkflowEditor.tsx:71-78`
- **Problem:**
  `WorkflowEditorProps` now publicly accepts `enableJsonEditor`, `jsonEditorPlacement`, `jsonEditor`, and `onJsonStatusChange`, and `index.ts` re‑exports `JsonEditStatus`, `WorkflowJsonEditorConfig`, `WorkflowJsonEditorInstance`, `WorkflowJsonModelLike`, and `WorkflowJsonMonacoRuntime`. None of these props or types appear in either README. The only documentation trail is the unreleased changeset bullet list. A first‑time user opening the released `@cyoda/workflow-react` README will not know the JSON surface exists.
- **Evidence:** `grep -n "JsonEditor\|enableJsonEditor\|jsonEditorPlacement" README.md` returns no hits; same for `packages/workflow-react/README.md`.
- **User impact:** Public API discoverability for the headline new capability is zero. Anyone wanting to wire Monaco into `WorkflowEditor` must read the source.
- **Recommended fix:** Add a `### JSON editing surface` section to both READMEs that documents the four props, the host‑supplied `WorkflowJsonEditorConfig`, and a minimal example mirroring `EditorShowcasePage.tsx`. Cross‑reference the package‑level `@cyoda/workflow-monaco` setup.
- **Suggested owner package:** `@cyoda/workflow-react` (docs)
- **Confidence:** High

### [HIGH-003] `edgeAnchors` and saved `viewports` are silently dropped by localStorage persistence

- **Severity:** High
- **Area:** editor / persistence
- **Files:**
  - `packages/workflow-react/src/components/WorkflowEditor.tsx:127-145` (initial merge)
  - `packages/workflow-react/src/components/WorkflowEditor.tsx:166-183` (write‑back)
- **Problem:**
  Both the write‑back effect and the on‑mount merge only handle `layout` and `comments`:
  ```ts
  toStore[wfName] = { layout: ui.layout, comments: ui.comments };
  // ...
  merged[wfName] = { ...(merged[wfName] ?? {}), layout: ui.layout, comments: ui.comments };
  ```
  Anything else stored in `WorkflowUiMeta` (notably `edgeAnchors` and `viewports`, both written by user actions) is in‑memory only and lost on reload. The write gate `if (ui.layout || ui.comments)` further means that *only* anchor or viewport changes don’t even trigger a write.
- **Evidence:**
  - `setEdgeAnchors` patch is wired through `Inspector.tsx:121` (anchor dropdowns) and `WorkflowEditor.tsx:842-911` (drag‑reconnect).
  - `viewports[orientation]` is read at `WorkflowEditor.tsx:498-501` and written via `handleViewportChange` at `WorkflowEditor.tsx:509-539`.
  - The root README at the section “Editor metadata: what stays out of exported JSON” says *“Layout positions, comments, edge anchors, and viewport state are stored in `WorkflowEditorDocument.meta.workflowUi`”*, implying full‑class persistence, while the “Local metadata persistence” paragraph only mentions layout and comments. The two paragraphs disagree.
- **User impact:** A user who fixes transition routing with the anchor dropdown / drag handle and reloads will see anchors revert to defaults. Same for the saved camera viewport. Reported as a clear regression once a user notices.
- **Recommended fix:** Either persist the entire `WorkflowUiMeta` (preferred — it’s already strictly editor‑side, never reaches export JSON), or explicitly state in both READMEs that only `layout` and `comments` survive localStorage and that hosts must use `layoutMetadata` / `onLayoutMetadataChange` for the rest. The former is a one‑line shape change in both the read and write paths.
- **Suggested owner package:** `@cyoda/workflow-react`
- **Confidence:** High

---

## Medium-priority Issues

### [MEDIUM-001] README test counts and totals are stale

- **Severity:** Medium
- **Area:** documentation
- **Files:** `README.md` (Testing and quality gates section)
- **Problem:** The README lists `workflow-core 63`, `workflow-viewer 8`, `workflow-react 66`, total `186`. Actual `pnpm test` output: core `65`, viewer `9`, react `85`, total **208**.
- **Evidence:** `pnpm test` aggregate from this session — see Commands Run.
- **Recommended fix:** Either refresh the counts or replace the table with a single sentence like “All packages ship with vitest suites; run `pnpm test` for current counts.” The latter avoids ongoing drift.
- **Confidence:** High

### [MEDIUM-002] Changeset description for L / Shift+L can be misread

- **Severity:** Medium
- **Area:** docs / changeset
- **Files:** `.changeset/full-editor-mvp.md`
- **Problem:** The bullet reads *“Reset Layout / Auto Layout toolbar buttons; `L` / `Shift+L` keyboard shortcuts.”* A reader can pair them positionally (`L` = reset, `Shift+L` = auto). The actual mapping (code + README + Toolbar tooltips) is `L` = auto layout, `Shift+L` = reset layout. The READMEs are unambiguous; only the changeset is ambiguous and will show up in the published `CHANGELOG.md` for `@cyoda/workflow-react`.
- **Recommended fix:** Change the changeset wording to e.g. *“`L` re‑runs auto‑layout; `Shift+L` resets manual positions.”*
- **Confidence:** High

### [MEDIUM-003] `WorkflowJsonEditor` editor‑creation effect ignores `editorOptions.readOnly` precedence

- **Severity:** Medium
- **Area:** editor / Monaco integration
- **Files:** `packages/workflow-react/src/components/WorkflowJsonEditor.tsx:109-119`
- **Problem:** The Monaco `create()` call sets `readOnly` and then spreads `...editorOptions`, so a host that passes `editorOptions: { readOnly: false }` while the editor is in `mode="viewer"` would silently override the read‑only intent at create time. The follow‑up `editor.updateOptions?.({ readOnly })` effect would then override back, producing a brief writable flash. Low frequency but inconsistent.
- **Recommended fix:** Spread `editorOptions` first and then enforce `readOnly` last, or filter `readOnly` out of incoming `editorOptions`.
- **Confidence:** Medium

### [MEDIUM-004] Canvas `baseNodes` memo recomputes on every selection change

- **Severity:** Medium
- **Area:** editor / performance
- **Files:** `packages/workflow-react/src/components/Canvas.tsx:575-581`
- **Problem:** `baseNodes` lists `selection` in its dep array because the per‑node `selected` flag derives from it. Selection clicks therefore rebuild every node object and trigger `reconcileNodes`. Functional behaviour is correct; this is just a minor unnecessary churn that scales with state count.
- **Recommended fix:** Drop `selection` from `baseNodes` deps and propagate `selected` via a downstream cheap `nodes.map` keyed on `selection`, or set `selected` in `handleNodeClick` via React Flow’s `applyNodeChanges` selection event. Not blocking; revisit when adding > 100‑state graphs.
- **Confidence:** Medium

---

## Non-issues / Verified Good

- `@cyoda/workflow-viewer/src/**` does not import `reactflow` or `monaco-editor` (verified by grep). Viewer remains read‑only and lightweight.
- `@cyoda/workflow-react` correctly declares `reactflow ^11` as a peer dep, and `@cyoda/workflow-monaco` declares Monaco as a peer (range issue noted above).
- Private packages remain private: root `cyoda-workflow-editor` and `@cyoda/docs-embed-demo` both have `"private": true`. `.changeset/config.json` explicitly `ignore`s `@cyoda/docs-embed-demo`.
- All six public packages have correct `name`, `description`, `license: Apache-2.0`, `repository`, `homepage`, `bugs`, `exports`, `files`, `publishConfig.access: public`, `publishConfig.provenance: true`. Verified by `node ./scripts/release-preflight.mjs` — passes.
- LICENSE file present in every public package directory.
- Serializer excludes all editor metadata from exported workflow JSON. Proven by `packages/workflow-core/tests/patch/serialization-clean.test.ts` (5 dedicated tests covering layout positions, comments, edge anchors, and round‑trip identity).
- `cleanupWorkflowUi` is called from `applyPatch` after `replaceSession` (`packages/workflow-core/src/patch/apply.ts:236`), so stale layout / comment / edgeAnchor entries are scrubbed when JSON edits delete states/transitions.
- CI workflows preserve the documented release model: `ci.yml` runs typecheck/build/test; `release.yml` uses `changesets/action@v1` with `id-token: write` (OIDC/provenance ready); `release-preflight.yml` is wired to release branches and PRs.
- No tracked debug artefacts, absolute paths, `.env*`, `*.tmp`, `node_modules` snapshots, or `dist/` content in the working tree. `.gitignore` covers the usual suspects.
- Visual baselines exist where `toHaveScreenshot` is used (`alert-triage.spec.ts-snapshots/`, `capability-showcase.spec.ts-snapshots/`). `node-drag.spec.ts` uses path‑attribute assertions and needs no baselines.
- `pnpm build` produces `175.24 KB` ESM for `workflow-react` and `< 5 KB` `.d.ts` per smaller package — bundle sizes are healthy.

---

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `pnpm build` | pass | 6/6 packages built clean; tsup ESM + CJS + d.ts. |
| `pnpm typecheck` | pass | 6/6 packages, `tsc --noEmit`. |
| `pnpm lint` | pass | ESLint over `packages` and `apps`, exit 0, no output. |
| `pnpm test` | pass | 208 tests / 32 test files across 6 packages, all green. |
| `node ./scripts/release-preflight.mjs` | pass | Validates name/license/exports/files/private flags for all 6 public packages and confirms 2 private packages remain private. |
| Playwright (`pnpm --filter @cyoda/docs-embed-demo test:visual`) | not run | Requires the demo dev server; baselines for two of three specs exist (`alert-triage`, `capability-showcase`); the third (`node-drag`) uses non‑screenshot assertions. |
| `pnpm --filter @cyoda/docs-embed-demo dev` | not run | Browser interaction is out of scope for this review. |

---

## Package Impact

| Package | Changed? | Public API affected? | Release concern |
|---|---:|---:|---|
| `@cyoda/workflow-core` | Yes (minor) | Yes | Coherent additive bump per changeset; tests cover inverses + serialization‑clean. No blockers. |
| `@cyoda/workflow-graph` | No code change | No | Patch bump is documentation only. OK. |
| `@cyoda/workflow-layout` | No code change | No | Patch bump. OK. |
| `@cyoda/workflow-monaco` | Patch | No (peer range only candidate) | HIGH‑001 peer range mismatch. |
| `@cyoda/workflow-react` | Yes (minor) | Yes (large) | BLOCKER‑001 (Monaco re‑mount), HIGH‑002 (docs), HIGH‑003 (anchor/viewport persistence). |
| `@cyoda/workflow-viewer` | Patch | No | Lint‑only fix per changeset. Confirmed no editor deps. |
| `cyoda-workflow-editor` (root, private) | – | – | Private; excluded from publish. |
| `@cyoda/docs-embed-demo` (private) | – | – | Private; pinned Monaco 0.52.2 — see HIGH‑001. |

---

## Recommended Fix Order

1. **BLOCKER‑001** — stabilise `WorkflowJsonEditor` lifecycle. Memoise `dispatch` / `onStatusChange` at `WorkflowEditor.tsx`, narrow the mount‑effect deps in `WorkflowJsonEditor.tsx:101-156` to `[config]` (or use an imperative attach), add a regression test asserting editor‑instance identity is stable across `onChange`.
2. **HIGH‑001** — widen `@cyoda/workflow-monaco` peer range to include `0.51` and `0.52`; add a one‑line note to its README about the supported Monaco range. Add a patch bump in the existing changeset.
3. **HIGH‑003** — extend localStorage persistence to write/read the full `WorkflowUiMeta` shape (or document the limit). Update the read‑back at `WorkflowEditor.tsx:127-145` and the write at lines 166‑183. Reflect in `packages/workflow-react/README.md`.
4. **HIGH‑002** — document the JSON editing surface (`enableJsonEditor`, `jsonEditorPlacement`, `jsonEditor`, `onJsonStatusChange`) in both READMEs with a minimal usage snippet.
5. **MEDIUM‑002** — clarify the L / Shift+L wording in `.changeset/full-editor-mvp.md` so the generated CHANGELOG is unambiguous.
6. **MEDIUM‑003** — flip the spread order in `WorkflowJsonEditor.tsx:109-119` so editor‑level `readOnly` wins at create time.
7. **MEDIUM‑001** — refresh or replace the README test count table.
8. **MEDIUM‑004** — optional perf clean‑up of `Canvas.tsx` `baseNodes` dep array.

---

## Final Recommendation

Fix **BLOCKER‑001** before tagging the `@cyoda/workflow-react` `0.2.0` release; the in‑shell JSON editor is one of the headline features of this MVP and currently re‑instantiates Monaco on every parent render in real usage. While you are in that file, ship **HIGH‑001** (peer range), **HIGH‑002** (README), and **HIGH‑003** (anchor/viewport persistence) in the same release PR — they are all small and they together make up the first‑run experience external users will judge. Everything else is genuinely Medium and can either be in the same patch wave or follow in a `0.2.1`. The release infrastructure (Changesets, CI publishing, preflight, private‑package guarding) is in solid shape and needs no changes.
