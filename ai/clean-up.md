
You are working in the `cyoda-workflow-editor` repo.
Task:
Analyse and propose changes to the public API, toolbar/chrome model, and demo routes based on the three real product use cases for the workflow editor package.
Do not implement changes yet.
Create a Markdown report only.
Background:
The current demo routes show inconsistent toolbar controls. Some routes show Undo/Redo/Add State/Add Note/Auto-arrange/Reset positions/Save. Others hide some or all of these controls.
This should not be solved by blindly forcing the same toolbar everywhere.
There are three distinct real use cases:
1. Website / documentation / marketing viewer
- Shows representative workflows visually.
- Read-only.
- No editing.
- No save.
- No file controls.
- Should support rich hover/inspect behaviour, including showing the STP path or representative path when hovering over a state.
- Suitable for fixed-width embedded layouts on websites.
2. Dev Console editor
- Desktop/local project tool.
- Opens workflow files from a local project directory.
- Lists workflow files discovered by the wrapper app.
- Lets users edit workflows during the AI/build phase.
- Saves clean workflow JSON back to project files.
- Full-width / full-window layout.
- Full editor controls should be visible:
  - Undo
  - Redo
  - Add State
  - Add Note
  - Auto-arrange
  - Reset positions
  - issue badges
  - JSON/developer surfaces where enabled
- File controls are host/wrapper controls:
  - Open workflow file
  - Save
  - Save as
  - Reload from disk
  - dirty indicator
  - overwrite warning
- The package should not force the host to hide the entire editor toolbar just to add file controls.
3. Ops / Environment Console viewer
- Connects to a running Cyoda server/environment.
- Primary function is read-only inspection of workflows in the running system.
- It is not best practice to directly edit workflow code/configuration on a running system.
- Changes should normally go through source control / Git and deployment pipeline.
- The default UI must be read-only.
- A future break-glass edit mode may exist, but it must be hidden behind explicit warnings and confirmations.
Goal:
Determine how the workflow editor package should expose a simple, safe, and consistent API for these three use cases.
Important:
- Do not confuse “consistent” with “identical”.
- The website viewer, Dev Console editor, and Ops Console viewer should have different chrome.
- The package should make those differences intentional and easy to use.
- Avoid a proliferation of low-level props that cause accidental inconsistent UI.
- Avoid route-specific toolbar hacks in the demo app.
Analyse:
1. Existing components and modes
Inspect:
- `WorkflowViewer`
- `WorkflowEditor`
- any `mode`, `readOnly`, `chrome`, `developerMode`, `enableJsonEditor`, `jsonEditorPlacement`, `layoutOptions`, `localStorageKey`, `onSave`, `onChange` props
- demo routes that use these components
Answer:
- What current component should be used for each of the three use cases?
- Is `WorkflowEditor mode="viewer"` redundant or confusing when `WorkflowViewer` exists?
- Is `mode="playground"` a real product mode or just a demo harness mode?
- Are `chrome` options too low-level for normal consumers?
2. Toolbar/chrome model
Analyse:
- Which controls belong to the editor package?
- Which controls belong to the host application?
- Why did the local file editor hide the editor toolbar?
- How should a host add file controls without removing editor controls?
- Should the toolbar be split into:
  - editor actions
  - host actions
  - diagnostics/issues
  - developer actions?
- Should the package offer slots/render props for host toolbar content?
3. Use-case presets or high-level modes
Recommend whether the public API should use:
Option A: separate components:
- `WorkflowViewer`
- `WorkflowEditor`
- `WorkflowEnvironmentViewer` or similar
Option B: presets:
- `presentation="website"`
- `presentation="dev-console"`
- `presentation="ops-console"`
Option C: high-level mode/layout props:
- `mode="viewer" | "editor"`
- `surface="website" | "dev-console" | "ops-console"`
- `layout="embedded" | "fullWidth"`
Evaluate pros/cons and recommend one.
The target outcome should let consumers write something close to:
Website:
```tsx
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
  onChange={setDocument}
  onSave={saveLocalWorkflow}
/>

Ops Console:

<WorkflowViewer
  document={document}
  surface="ops-console"
  layout="fullWidth"
  runtimeContext={...}
  allowBreakGlassEdit={false}
/>

4. Website viewer STP/path hover
    Investigate existing viewer/editor capabilities for hover/selection.

Answer:

* Does the current graph model include enough information to show the STP path or representative path on state hover?
* Is there existing path/highlight support?
* If not, what API should be added?
* Should hover behaviour live in workflow-viewer, workflow-react, or a shared graph helper?
* How should this work without making the website viewer heavy?

5. Dev Console integration
    Define the recommended integration contract:

* document loading;
* local file save;
* dirty state;
* overwrite warning;
* editor metadata not saved to workflow JSON;
* full-width layout;
* JSON editor/developer mode;
* local layout metadata persistence;
* file controls outside editor, but editor controls inside package.

Answer:

* What props/API are needed to avoid route-specific hacks?
* Should the editor expose a toolbarHostSlot or fileActionsSlot?
* Should Save be separable from edit controls?

6. Ops Console integration and break-glass
    Define the recommended integration contract:

* read-only by default;
* no edit controls;
* export JSON;
* compare with source;
* optional break-glass edit mode.

Answer:

* Should break-glass use WorkflowEditor after confirmation, rather than WorkflowViewer?
* How should warning/confirmation be represented?
* Should the package include break-glass UI, or should the Ops Console host own it?
* What should the package expose to make break-glass safe?

7. Demo app cleanup
    Classify current routes into:

* canonical website viewer demo;
* canonical dev-console editor demo;
* canonical ops-console viewer demo;
* developer harnesses.

Recommend changes:

* Which route should demonstrate website viewer?
* Which route should demonstrate Dev Console editor?
* Which route should demonstrate Ops Console read-only viewer?
* Which routes should be clearly labelled as harnesses?
* Which routes should not be used as examples for consumers?

8. Public API simplification
    Recommend a minimal public API.

Include:

* components;
* props;
* defaults;
* deprecated/confusing props;
* advanced-only props;
* breaking changes to defer.

9. Tests
    Recommend tests for:

* website viewer has no edit controls and supports hover/path inspection;
* dev-console editor has full edit controls and host file controls can be added without hiding them;
* ops-console viewer has no edit controls;
* break-glass path only enables editing after explicit host-controlled state change;
* local file save uses clean serialization;
* editor metadata excluded from workflow JSON;
* demo routes reflect the three canonical use cases.

Output:
Create:

WORKFLOW_EDITOR_USE_CASE_API_REVIEW.md

Use this structure:

Workflow Editor Use Case API Review

Executive Summary

* What should change?
* What should not change?
* Why the toolbar inconsistency exists.
* Top 5 recommendations.

The Three Product Use Cases

Website / Documentation Viewer

Dev Console Editor

Ops / Environment Console Viewer

Current API Fit For Each Use Case

Toolbar and Chrome Ownership

Recommended Public API

Recommended Component/Mode/Surface Model

Website Hover / STP Path Requirement

Dev Console Integration Contract

Ops Console Integration Contract

Break-glass Editing Recommendation

Demo App Cleanup Plan

Tests To Add

Migration Plan

* non-breaking changes first
* docs/demo updates
* possible later breaking cleanup

Open Questions

Only include questions that cannot be answered from source.

Rules:

* Do not implement changes.
* Do not modify any files except creating the report.
* Be specific and cite files/components.
* Separate package API issues from demo app issues.
* Do not recommend one identical toolbar for all use cases.
* Viewer must remain lightweight.
* Editor must remain full-featured.
* Ops Console must be read-only by default.
* Break-glass editing must be host-controlled and strongly warned.

## My recommendation after this clarification
The package should move toward **intentional surfaces**, not a generic bag of props:
```text
Website viewer      -> WorkflowViewer, lightweight, hover/inspect path
Dev Console editor  -> WorkflowEditor, full controls, full-width, host file toolbar
Ops Console viewer  -> WorkflowViewer, runtime context, read-only, export/compare
Break glass         -> host switches to WorkflowEditor after explicit confirmation

This also changes the local file editor fix: do not simply “show the same toolbar as every other route”. Instead, make sure the Dev Console editor surface has both:

* host file controls, and
* package edit controls.

Those are different toolbars with different responsibilities.
