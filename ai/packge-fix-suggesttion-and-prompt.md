The results are clear: the package capabilities are mostly fine, but the consumer API and demo composition are too loose. The inconsistency is not because + State, Undo, Auto-arrange, etc. are missing from the editor. It is because different demo routes are composing the editor differently, especially the local file editor route, which hides the built-in editor toolbar and replaces it with a file toolbar.  ￼

The report’s key conclusion is the right one:

Treat WorkflowViewer as the only recommended viewer, and WorkflowEditor as the only recommended editor. Keep the standard editor toolbar visible in editor mode. Add a higher-level layout/API contract so consumers do not have to stitch together mode/chrome/layout/save options manually.  ￼

What I would do next

Do not ask Codex to do a broad refactor in one pass. Split it into three implementation tasks.

Task 1: Standardise the demo routes and toolbar behaviour

Fix the visible inconsistency first.

Goal:
Make all editor-mode demo routes show the same core editor toolbar unless explicitly labelled as a developer harness.
Rules:
- Editor mode shows Undo, Redo, + State, + Note, Auto-arrange, Reset positions, validation pills, and Save when onSave exists.
- Viewer surfaces never show edit controls.
- Local file editor must keep file controls, but must not hide core editor controls unless it provides an equivalent editor toolbar.
- Developer harness routes may hide or alter chrome, but must be labelled as harnesses.

This addresses the immediate screenshots.

Task 2: Add simple public layout/viewer API

This should reduce future Dev Console/Ops Console integration complexity.

Target API:

<WorkflowViewer
  document={document}
  layout="embedded"
  height={480}
/>
<WorkflowEditor
  document={document}
  onChange={setDocument}
  onSave={save}
  layout="fullWidth"
  developerMode
  enableJsonEditor
/>

The report confirms that today WorkflowViewer is clean and lightweight, but consumers have to parse/project manually before rendering. That is fine for advanced use, but not ideal for the recommended simple path.  ￼

Task 3: Update docs and tests around canonical usage

Add tests proving:

* editor mode always shows standard edit controls;
* viewer mode never shows edit controls;
* local file editor uses the canonical editor integration;
* full-width layout fills the container;
* embedded layout works without route-specific page chrome;
* Save appears only when onSave exists and behaves consistently.

The report explicitly calls out these missing tests.  ￼

Prompt for Codex: implementation pass 1

Use this as the next prompt:

You are working in the `cyoda-workflow-editor` repo.
Read `WORKFLOW_EDITOR_API_AND_DEMO_REVIEW.md`.
Goal:
Fix the visible demo/editor toolbar inconsistency without doing a broad public API refactor yet.
Do not change workflow JSON semantics.
Do not rewrite the package architecture.
Do not remove existing demo routes unless clearly redundant and agreed.
Do not break `WorkflowViewer`.
Do not change `workflow-core`.
Problem:
The demo app currently makes the workflow editor look inconsistent. Some routes show the full editor toolbar, while others hide Add State, Undo, Redo, Auto-arrange, and Reset positions. The analysis shows this is mostly because demo routes compose the editor differently, especially `LocalFileEditorPage`, which hides the package toolbar with `chrome={{ toolbar: false }}` and replaces it with a file toolbar.
Required behaviour:
1. Canonical editor mode
In every route intended to demonstrate the full editor, the standard editor controls must be visible:
- Undo
- Redo
- + State
- + Note
- Auto-arrange
- Reset positions
- validation issue pills
- Save when `onSave` is supplied
2. Local file editor route
The local file editor may keep its file toolbar:
- Back
- Open workflow file
- filename
- dirty indicator
- Save
- Save as
- Reload from disk
But it must not hide the core editor controls unless it provides an equivalent editor toolbar.
Preferred fix:
- Keep the file toolbar as host chrome.
- Render the standard `WorkflowEditor` toolbar inside the editor surface.
- Avoid duplicate Save buttons if possible. If duplicate Save would be confusing, make the editor toolbar Save optional through a clearly named prop or keep Save only in host chrome while preserving all edit/layout controls.
Do not simply remove the built-in toolbar and copy buttons into the route unless there is no better option.
3. Demo route labelling
Routes that are developer harnesses should be labelled as such in page copy:
- Monaco playground
- Layout showcase
- Save-flow harness
- Developer utilities
- Any route that intentionally hides or overrides package chrome
Routes that should be product-like:
- Editor showcase
- Criteria editor clean route
- Local file editor
4. Viewer routes
Viewer routes should continue to use `WorkflowViewer` and should not show edit controls.
5. Save-flow harness
Do not force the save-flow harness to look like the canonical editor if it is intentionally testing `useSaveFlow`. But label it clearly as a harness and document why save controls are external.
Files to inspect:
- apps/docs-embed-demo/src/pages/LocalFileEditorPage.tsx
- apps/docs-embed-demo/src/pages/EditorShowcasePage.tsx
- apps/docs-embed-demo/src/pages/CriteriaEditorPage.tsx
- apps/docs-embed-demo/src/pages/SaveFlowHarnessPage.tsx
- apps/docs-embed-demo/src/pages/ViewerPlaygroundPage.tsx
- apps/docs-embed-demo/src/pages/LayoutShowcasePage.tsx
- apps/docs-embed-demo/src/pages/EmbedViewerPage.tsx
- packages/workflow-react/src/components/WorkflowEditor.tsx
- packages/workflow-react/src/toolbar/Toolbar.tsx
- packages/workflow-react/tests/*
Acceptance criteria:
- Editor showcase shows the standard editor toolbar in editor mode.
- Criteria editor clean mode shows the standard editor toolbar.
- Local file editor shows the standard editor edit/layout controls.
- Local file editor still has file open/save/save-as/reload controls.
- Viewer/embed/layout routes do not show edit controls.
- Save-flow harness is clearly labelled as a save-flow harness if it keeps custom save controls.
- No route unintentionally hides Add State / Undo / Redo / Auto-arrange / Reset positions.
- Existing tests pass.
Tests:
Add or update tests for:
1. `WorkflowEditor mode="editor"` renders Undo, Redo, + State, + Note, Auto-arrange, Reset positions.
2. `WorkflowEditor mode="viewer"` does not render edit controls.
3. Local file editor route renders core edit/layout controls and file controls.
4. Viewer/embed route does not render edit controls.
5. Save button behaviour remains:
   - visible when `onSave` is supplied;
   - absent or disabled according to existing contract when not supplied/read-only/invalid.
Run:
- pnpm --filter @cyoda/workflow-react test
- pnpm --filter @cyoda/docs-embed-demo test
- pnpm typecheck
- pnpm lint
- pnpm test
Final report:
- files changed
- why controls were inconsistent
- what standardisation was applied
- which routes are canonical product demos
- which routes are developer harnesses
- tests added/updated
- commands run and results
- remaining limitations

One design decision to make before the next pass

For the local file editor, decide whether there should be one Save button or two.

My recommendation:

* Keep file Save / Save as / Reload in the outer file toolbar.
* Keep editor edit/layout controls in the editor toolbar.
* Hide only the editor toolbar’s Save button if necessary, but do not hide the whole toolbar.

That implies the package may need a more precise chrome option later:

chrome={{
  toolbar: true,
  saveButton: false
}}

instead of the current all-or-nothing:

chrome={{ toolbar: false }}

That would solve the local file editor problem without duplicating edit controls in the route.
