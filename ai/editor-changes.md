
You are working in the `cyoda-workflow-editor` repo.
Read:
- WORKFLOW_EDITOR_USE_CASE_API_REVIEW.md
Goal:
Implement the first non-breaking API pass from the review. Do not do the full migration or breaking cleanup. Add explicit product-surface/layout support and toolbar slots so the package has clear integration paths for:
1. website/documentation viewer
2. Dev Console editor
3. Ops/environment read-only viewer
Do not change workflow JSON semantics.
Do not remove existing props.
Do not remove existing demo routes.
Do not remove `chrome`.
Do not remove `mode="playground"` yet.
Do not break current consumers.
Do not add break-glass editing UI inside the package.
Do not make the viewer depend on React Flow or Monaco.
Required changes:
## 1. Add surface/layout props to WorkflowViewer
Update `@cyoda/workflow-viewer`.
Add high-level props:
```ts
type WorkflowViewerSurface = "website" | "ops-console";
type WorkflowViewerLayout = "embedded" | "fullWidth";
type WorkflowViewerInteraction =
  | "none"
  | "select"
  | "hover-highlight"
  | "hover-path";

Add to WorkflowViewerProps:

surface?: WorkflowViewerSurface;
layout?: WorkflowViewerLayout;
interaction?: WorkflowViewerInteraction;

Defaults:

* surface="website"
* layout="embedded"
* interaction="hover-highlight"

Behaviour:

* No edit controls ever.
* Website surface remains lightweight and embeddable.
* Ops surface remains read-only, but should use full-width-friendly classes/defaults.
* Do not import React Flow.
* Do not import Monaco.

If easy and safe, allow document?: WorkflowEditorDocument as an alternative to graph?: GraphDocument, and project internally with projectToGraph. Keep graph working for advanced callers.

If adding document creates package-boundary or bundle concerns, do not implement it yet. Instead document it as a follow-up.

2. Add basic hover/path inspection API

Add a lightweight inspection API, preferably in workflow-graph helpers if reusable.

Minimum implementation:

* For hovered state:
    * return adjacent incoming/outgoing transitions.
    * return neighbouring states.
* For hovered transition:
    * return source and target state.

Add optional viewer prop:

onInspect?: (inspection: WorkflowInspection | null) => void;

Define a small type such as:

type WorkflowInspection = {
  focusedId: string;
  kind: "state" | "transition";
  workflow?: string;
  stateCode?: string;
  transitionName?: string;
  adjacentTransitions?: Array<{
    id: string;
    name: string;
    direction: "incoming" | "outgoing";
    sourceState: string;
    targetState: string;
  }>;
};

For interaction="hover-path":

* call onInspect on hover.
* visually highlight the same adjacent path already highlighted today, or extend it if trivial.
* Do not implement full STP path inference unless graph data already supports it.
* Add TODO/docs that explicit STP/representative path support should come later through a pathProvider.

3. Add surface/layout props and toolbar slots to WorkflowEditor

Update @cyoda/workflow-react.

Add:

type WorkflowEditorSurface = "dev-console";
type WorkflowEditorLayout = "embedded" | "fullWidth";

Add to WorkflowEditorProps:

surface?: WorkflowEditorSurface;
layout?: WorkflowEditorLayout;
toolbarStart?: React.ReactNode;
toolbarCenter?: React.ReactNode;
toolbarEnd?: React.ReactNode;

Defaults:

* existing behaviour remains unchanged if props are not passed.
* surface="dev-console" should imply full editor controls are intended.
* layout="fullWidth" should apply full-width/full-height-friendly classes or data attributes.

Toolbar slots:

* Host toolbar slots must be additive.
* Do not require hosts to set chrome={{ toolbar: false }} to add file controls.
* Existing editor-owned controls must remain visible:
    * Undo
    * Redo
    * Add State
    * Add Note
    * Auto-arrange
    * Reset positions
    * diagnostics/issue badges
    * Save if onSave is supplied and not otherwise configured

Implementation options:

* Add slots to the existing Toolbar component.
* Place toolbarStart, toolbarCenter, toolbarEnd around existing editor controls in a sensible order.
* If Save duplication is a concern for local file editor, do not invent a big API yet. Prefer keeping editor Save visible for now, or add a small targeted option only if necessary:
    * showSaveButton?: boolean
        but avoid broad new chrome complexity.

4. Update LocalFileEditorPage to stop hiding editor toolbar

File:

* apps/docs-embed-demo/src/pages/LocalFileEditorPage.tsx

Current issue:

* The route uses host file controls and hides package toolbar with chrome={{ toolbar: false }}.
* This removes editor-owned controls and creates the visible inconsistency.

Required:

* Remove chrome={{ toolbar: false }} unless absolutely necessary.
* Use the new toolbar slots to inject local file actions.
* Keep local file actions:
    * Back
    * Open workflow file
    * current file name
    * dirty indicator
    * Save
    * Save as
    * Reload from disk
* Preserve editor-owned controls.
* Preserve local file save/reload/overwrite behaviour.
* Saved JSON must still use serializeImportPayload.
* Do not save editor metadata into workflow JSON.

If the toolbar becomes crowded:

* keep only core file status in the editor toolbar slots;
* move secondary file actions to a compact menu;
* do not hide editor controls.

5. Add canonical Ops viewer demo route

Add route:

* /ops-viewer

Purpose:
Demonstrate Ops/environment console read-only workflow viewing.

Requirements:

* Use WorkflowViewer surface="ops-console" layout="fullWidth".
* No edit controls.
* Show runtime-style host chrome outside viewer:
    * environment label, e.g. Environment: local-dev
    * Export JSON
    * Compare with source disabled/mock
    * optional Break-glass edit disabled/mock with warning copy
* The warning copy should make clear:
    Directly editing workflow configuration on a running system is not best practice. Prefer source-controlled changes and normal deployment.
* Do not implement actual break-glass editing.
* Do not mount WorkflowEditor on this route.

6. Clarify demo route labels

Update demo navigation/page copy so routes are clearly classified:

Canonical examples:

* Website viewer / embed
* Dev Console local file editor
* Ops Console viewer

Developer harnesses:

* Editor showcase
* Criteria editor
* Monaco playground
* Save-flow harness
* Layout showcase
* Developer utilities

Do not remove harnesses.
Just label them so consumers do not mistake all routes for product integration patterns.

7. Tests

Add/update tests:

Viewer:

* WorkflowViewer surface="website" renders no edit controls.
* WorkflowViewer surface="ops-console" renders no edit controls.
* interaction="hover-path" calls onInspect with state/transition inspection payload.
* Viewer remains free of React Flow/Monaco imports if there is an existing dependency hygiene test.

Editor:

* WorkflowEditor surface="dev-console" renders standard editor controls.
* Toolbar slots render without hiding editor controls.
* Existing chrome behaviour still works for advanced/harness use.

Demo:

* Local file editor renders file controls and editor controls.
* Ops viewer route renders read-only viewer and no edit controls.
* Website/embed route renders viewer and no edit controls.

8. Docs

Update:

* root README if it documents usage
* packages/workflow-viewer/README.md
* packages/workflow-react/README.md
* demo app README if present

Document the three canonical use cases:

Website:

<WorkflowViewer
  document={document}
  surface="website"
  layout="embedded"
  interaction="hover-path"
/>

Dev Console:

<WorkflowEditor
  document={document}
  surface="dev-console"
  layout="fullWidth"
  developerMode
  enableJsonEditor
  onChange={setDocument}
  onSave={saveWorkflow}
  toolbarStart={fileActions}
/>

Ops Console:

<WorkflowViewer
  document={document}
  surface="ops-console"
  layout="fullWidth"
/>

If document input is not implemented for WorkflowViewer, show the current projectToGraph path clearly.

Quality gates

Run:

* pnpm –filter @cyoda/workflow-viewer test
* pnpm –filter @cyoda/workflow-react test
* pnpm –filter @cyoda/docs-embed-demo test
* pnpm typecheck
* pnpm lint
* pnpm test
* pnpm build

Final report

Return:

* files changed
* new public props/types
* how toolbar slots work
* how local file editor changed
* how Ops viewer demo works
* whether WorkflowViewer document input was implemented or deferred
* tests added/updated
* commands run and results
* remaining limitations

## One thing I would **not** do yet
Do not create a third component like `WorkflowEnvironmentViewer` yet. The review says the same thing: keep `WorkflowViewer` and `WorkflowEditor` as the two core public components. Ops can start as `WorkflowViewer surface="ops-console"`; if it later needs a richer runtime-specific wrapper, that can live in the Ops Console app, not the workflow package.  
