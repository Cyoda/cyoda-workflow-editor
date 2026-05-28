
You are working in the `cyoda-workflow-editor` repo.
Task:
Analyse the project structure, public API, demo usage, and editor/viewer configuration model. Do not implement changes yet. Produce a Markdown report that explains why the demo/test windows currently show inconsistent toolbar controls and whether the package usage/API has become unnecessarily complex.
Context:
While testing the workflow editor package, several demo/test routes show inconsistent controls:
- Some screens show Undo / Redo / + State / + Note / Auto-arrange / Reset positions / Save.
- Some screens are missing Add State, Auto-arrange, Undo, Redo, or Reset positions.
- The local file editor route has a different top toolbar from the editor showcase / criteria editor routes.
- The visual appearance suggests there may be too many usage modes, route-specific wrappers, or configuration options.
Product expectation:
The package should be simple to consume.
There should probably be:
1. One **viewer** mode:
   - read-only workflow display
   - suitable for websites, docs, embeds, and Ops Console read-only usage
   - optional fixed-width / embedded layout
2. One **editor** mode:
   - full workflow editing
   - state add/edit/delete
   - transition add/edit/delete/reconnect
   - criteria/processors/comments/layout editing
   - undo/redo
   - auto-arrange
   - reset positions
   - save integration
   - suitable for Dev Console full-width usage
And layout should be configurable through a small number of high-level options:
- `layout="embedded"` or `layout="fullWidth"` or equivalent
- `mode="viewer"` or `mode="editor"`
- `developerMode` for JSON/debug surfaces
- `readOnly` only where it is genuinely different from viewer mode
Current observed issue:
The package appears to have multiple demo routes and wrappers using different combinations of props/options, which may be producing inconsistent UI and making integration harder than necessary.
Important:
Do not change source code.
Do not refactor.
Do not fix UI.
Do not update tests.
Only inspect and report.
Analyse these areas:
1. Package structure
Inspect:
- packages/workflow-core
- packages/workflow-graph
- packages/workflow-layout
- packages/workflow-viewer
- packages/workflow-react
- packages/workflow-monaco
- apps/docs-embed-demo
Answer:
- What is the intended responsibility of each package?
- Are package boundaries still clean?
- Does `workflow-viewer` remain a true lightweight read-only viewer?
- Does `workflow-react` own all editor-only logic?
- Are demo routes importing lower-level internals instead of public APIs?
2. Public API surface
Inspect exported APIs from:
- packages/workflow-react/src/index.ts
- packages/workflow-viewer/src/index.ts
- packages/workflow-core/src/index.ts
- packages/workflow-monaco/src/index.ts
Answer:
- What is the current public API?
- Which component should external consumers use for viewing?
- Which component should external consumers use for editing?
- Are there too many props?
- Are mode/readOnly/developer/json/layout/save props coherent?
- Are low-level props leaking implementation complexity?
- Is there a clear “simple path” for a new consumer?
3. Current editor/viewer modes
Find all places where `WorkflowEditor` and `WorkflowViewer` are used.
Likely locations:
- apps/docs-embed-demo/src/pages/EditorShowcasePage.tsx
- apps/docs-embed-demo/src/pages/CriteriaEditorPage.tsx
- apps/docs-embed-demo/src/pages/LocalFileEditorPage.tsx
- apps/docs-embed-demo/src/pages/ViewerPlaygroundPage.tsx
- apps/docs-embed-demo/src/pages/LayoutShowcasePage.tsx
- apps/docs-embed-demo/src/pages/EmbedViewerPage.tsx
- tests that mount editor/viewer components
For each usage, report:
- component used
- props passed
- toolbar controls visible
- save behaviour
- layout mode/fixed height/full width
- JSON editor enabled/disabled
- developer mode enabled/disabled
- readOnly/mode setting
- any custom wrapper toolbar outside the package
Create a table:
| Route/Page | Component | Mode/readOnly | Layout | Toolbar controls | Save integration | Notes |
|---|---|---|---|---|---|---|
4. Toolbar/control inconsistencies
Find the source of toolbar controls.
Inspect:
- packages/workflow-react/src/components/WorkflowEditor.tsx
- packages/workflow-react/src/toolbar/*
- packages/workflow-react/src/components/*
- apps/docs-embed-demo route wrappers
Answer:
- Which toolbar controls are built into `WorkflowEditor`?
- Which controls are added by demo pages outside the package?
- Why do some demo pages lack `+ State`, `Undo`, `Redo`, `Auto-arrange`, or `Reset positions`?
- Are controls hidden by props?
- Are controls hidden by `readOnly`, `mode`, `developerMode`, or missing callbacks?
- Are controls missing because route wrappers build their own toolbar?
- Are there multiple toolbar implementations?
5. Save/load model
Inspect:
- useSaveFlow
- SaveConfirmModal
- LocalFileEditorPage
- save-flow harness page
- WorkflowEditor props around save/onChange/onPatch
Answer:
- Is save built into the editor, or expected to be supplied by the host?
- Is the local file editor wrapping save correctly?
- Does save availability affect toolbar rendering?
- Is there a consistent dirty-state contract?
- Is there a clear integration path for Dev Console local file save?
- Is there a clear integration path for Ops Console read-only view?
6. Layout model
Inspect layout-related props and behaviour.
Answer:
- How are fixed-height embedded layouts currently implemented?
- How are full-width/full-window layouts implemented?
- Is the layout controlled by package props or by demo CSS?
- Is there a clean way to use the editor full-width in a console?
- Is there a clean way to embed a fixed-width/fixed-height viewer in a website?
- Are demo pages using inconsistent CSS that makes the package look inconsistent?
- Does React Flow resize correctly when inspector appears/disappears?
7. Recommended simplification
Based on the inspection, recommend a simpler consumer API.
Explore whether the package should expose only a few high-level components, for example:
```ts
<WorkflowViewer
  document={document}
  layout="embedded" | "fullWidth"
  height={...}
  showMiniMap={...}
/>
<WorkflowEditor
  document={document}
  onChange={...}
  onSave={...}
  mode="editor"
  layout="embedded" | "fullWidth"
  developerMode={false}
  enableJsonEditor={...}
/>

Or whether it should expose presets:

<WorkflowEditor preset="website-embed" />
<WorkflowEditor preset="dev-console" />
<WorkflowEditor preset="demo" />

Answer:

* Which approach is better?
* What props should be public?
* What props should become internal?
* What defaults should be used?
* How should toolbar controls be standardised?
* Should the editor always show all edit controls in editor mode?
* Should the viewer never show edit controls?
* How should demo/test routes avoid overriding package chrome?

8. Demo app cleanup proposal
    The demo app should show capabilities, not create confusing divergent product variants.

Recommend a simplified demo structure:

* Viewer demo
* Editor demo
* Local file editor demo
* Criteria/processors demo if still needed
* Developer/debug demo

Answer:

* Which current demo routes are redundant?
* Which should be merged?
* Which should be renamed?
* Which should explicitly be labelled “developer harness”?
* Which route should be the canonical demo for future Dev Console integration?
* Which route should be the canonical demo for website/Ops read-only usage?

9. Dev Console and Ops Console integration implications
    Given:

* Dev Console needs a full-width editor for local file editing.
* Ops Console needs primarily read-only workflow viewing.
* Websites/docs need fixed-width or embedded viewer layouts.

Answer:

* What exact component and props should Dev Console use?
* What exact component and props should Ops Console use?
* What exact component and props should a website/docs embed use?
* Are any required features missing from the public API?
* Are there package changes needed before integrating into Dev Console?

10. Tests that should exist
    Recommend tests to enforce consistency:

* editor mode always shows standard edit toolbar controls
* viewer mode never shows edit controls
* embedded layout renders without full-width chrome
* full-width layout fills container
* local file editor route uses canonical editor preset
* criteria editor route does not accidentally hide core editor controls unless intentionally scoped
* toolbar controls are controlled by one source of truth
* public API smoke tests for simple viewer and simple editor usage

Output:
Create a Markdown file:

WORKFLOW_EDITOR_API_AND_DEMO_REVIEW.md

Use this structure:

Workflow Editor API and Demo Review

Executive Summary

Include:

* is the package API too complex?
* why toolbar controls are inconsistent
* biggest integration risk
* top 5 recommended changes

Package Boundary Review

Public API Review

Current Usage Matrix

Include the route/component table.

Toolbar and Control Analysis

Save/Load Contract Analysis

Layout Contract Analysis

Viewer vs Editor Mode Analysis

Demo App Cleanup Recommendations

Recommended Public API Simplification

Recommended Presets or Modes

Dev Console Integration Recommendation

Ops Console / Website Embed Recommendation

Tests To Add

Implementation Plan

Phase the work:

1. analysis-only cleanup of docs/types
2. toolbar standardisation
3. public API simplification
4. demo route cleanup
5. integration presets
6. tests/docs

Open Questions

Only include questions that cannot be answered from source inspection.

Rules:

* Be specific.
* Cite exact files and component names.
* Do not guess where source can answer.
* Do not implement anything.
* Do not modify files except creating WORKFLOW_EDITOR_API_AND_DEMO_REVIEW.md.
* Separate package issues from demo-app issues.
* Separate real integration problems from demo harness inconsistency.
* If current behaviour is intentional for a demo route, say so.
* If a route is a test harness, label it as such.
* If a prop is confusing or redundant, propose a replacement.
* If a breaking API change is recommended, say whether it should wait until the next minor/major release.

My view before the analysis: the screenshots strongly suggest the **demo app is mixing capability demos with product-like editor screens**, and the controls are probably inconsistent because each route is composing the editor differently. That does not necessarily mean the package is fundamentally wrong, but it does mean the public usage story probably needs tightening before it becomes the Dev Console’s core workflow surface.
