# Workflow Editor Use Case API Review

## Executive Summary

### What should change?

The package should expose intentional product-surface presets on top of the
existing `WorkflowViewer` and `WorkflowEditor` components:

- `WorkflowViewer` should be the public component for website/documentation and
  ops/environment read-only surfaces.
- `WorkflowEditor` should be the public component for Dev Console editing and
  any future explicit break-glass edit path.
- Add high-level `surface`, `layout`, and interaction presets instead of making
  normal consumers assemble toolbar behavior from `chrome` booleans.
- Add toolbar slots/render props so host-owned controls, such as local file
  open/save/reload, can live in the same top chrome without suppressing editor
  controls.
- Add a lightweight viewer hover/inspect API for state path inspection.

### What should not change?

- Do not collapse the repo into one component or one mode.
- Do not make the website viewer, Dev Console editor, and ops console viewer
  look identical.
- Do not make the editor package own local filesystem controls, environment
  deployment controls, or break-glass authorization policy.
- Do not make `chrome` the primary integration API for product consumers.
- Do not use route-specific demo hacks as the consumer-facing model.

### Why the toolbar inconsistency exists.

The current components mix product intent and low-level chrome toggles. The
read-only SVG `WorkflowViewer` has no toolbar by design. The React Flow
`WorkflowEditor` has a top diagnostics/save toolbar plus canvas controls for
undo/redo, fit/fullscreen, auto-arrange, and add-state surface tabs. Demo routes
then independently choose whether to show or hide pieces of that chrome.

The local file editor route adds a host toolbar for file actions, but the editor
does not expose a clean slot for host file controls. That makes the host choose
between two imperfect options: render a second toolbar above the editor, or hide
the editor toolbar and accidentally lose package-owned diagnostics/save chrome.

### Top 5 recommendations.

1. Keep `WorkflowViewer` and `WorkflowEditor` as the two core public components.
2. Add high-level surfaces: `surface="website" | "dev-console" | "ops-console"`
   with safe defaults.
3. Add toolbar regions or slots: editor actions, host actions, diagnostics, and
   developer actions.
4. Treat `mode="playground"` as a demo/harness mode and remove it from the
   recommended public API.
5. Add viewer hover/path inspection in a shared graph helper, surfaced through
   `WorkflowViewer` without pulling React Flow or Monaco into website embeds.

## The Three Product Use Cases

## Website / Documentation Viewer

This surface is a read-only visual embed. It should show representative
workflows, support hover and lightweight inspection, fit fixed-width website
layouts, and never expose editing, save, local file, or developer controls.

Recommended component:

```tsx
<WorkflowViewer
  document={document}
  surface="website"
  layout="embedded"
  interaction="hover-path"
/>
```

The current `WorkflowViewer` is the right foundation because it is a slim SVG
renderer with selection and hover highlighting, no React Flow edit affordances,
and no save path.

## Dev Console Editor

This surface is a full-window project tool. The host application discovers
workflow files, opens one, tracks dirty state, warns before overwrite/reload,
and writes clean workflow JSON back to disk. The editor package should own
workflow editing controls, diagnostics, layout metadata, JSON/developer
surfaces, undo/redo, add state, add note, auto-arrange, reset positions, and
validation issue badges.

Recommended component:

```tsx
<WorkflowEditor
  document={document}
  surface="dev-console"
  layout="fullWidth"
  developerMode
  onChange={setDocument}
  onSave={saveLocalWorkflow}
  toolbarStart={fileActions}
  toolbarEnd={dirtyIndicator}
/>
```

The current `WorkflowEditor` is the right foundation, but it needs slots so the
host can add file controls without hiding or duplicating editor chrome.

## Ops / Environment Console Viewer

This surface connects to a running Cyoda environment and should default to
read-only inspection. Direct editing of running workflow configuration should
not be normal UI; changes should go through source control and deployment.

Recommended component:

```tsx
<WorkflowViewer
  document={document}
  surface="ops-console"
  layout="fullWidth"
  runtimeContext={runtimeContext}
  allowBreakGlassEdit={false}
/>
```

The default should expose inspection, export JSON, compare-with-source hooks,
and runtime context, but no edit controls. Break-glass edit should be a
host-controlled state transition into `WorkflowEditor`, after explicit warnings
and confirmations.

## Current API Fit For Each Use Case

### Website / Documentation Viewer

Current fit: mostly good.

`packages/workflow-viewer/src/components/WorkflowViewer.tsx` accepts a projected
`GraphDocument`, optional layout, width/height, selected id, selection callback,
and class name. It renders an SVG, computes fallback layout, highlights hovered
or selected adjacent nodes/edges, and has no edit chrome.

Gaps:

- It accepts `graph`, not `document`, so consumers must know to call
  `projectToGraph`.
- Hover behavior is hardcoded to adjacent node/edge highlighting.
- There is no public `interaction` option or hover inspect payload.
- There is no first-class embedded/full-width layout preset.

### Dev Console Editor

Current fit: good editing core, weak host-chrome contract.

`packages/workflow-react/src/components/WorkflowEditor.tsx` already covers the
core editor needs: edit mode, `onChange`, `onSave`, JSON editor, developer mode,
layout options, local layout metadata persistence, validation, undo/redo, and
read-only gating when mode is `"viewer"`.

Gaps:

- Host file actions are outside the package, but there is no slot for them.
- `chrome` is a set of low-level booleans that can hide important package-owned
  diagnostics.
- `onSave` currently creates an editor save button and keyboard shortcut, but
  Save can also be a host file action. Those two concepts need clearer naming.
- `mode="playground"` appears in the type but does not represent a real product
  surface.

### Ops / Environment Console Viewer

Current fit: partial.

`WorkflowViewer` is the right default for safe read-only inspection. If ops
needs the React Flow canvas experience, `WorkflowEditor mode="viewer"` can
render read-only, but that is a confusing public recommendation because a
component named `WorkflowEditor` in `mode="viewer"` competes with
`WorkflowViewer`.

Gaps:

- No `surface="ops-console"` preset.
- No runtime/environment context contract.
- No explicit compare/export slots.
- No break-glass contract.

### Is `WorkflowEditor mode="viewer"` redundant or confusing?

It is useful internally and for advanced hosts that want the React Flow shell
without editing. It is confusing as the normal public viewer recommendation
because `WorkflowViewer` already exists and is a better fit for lightweight
read-only rendering.

Recommendation: keep `mode="viewer"` as advanced/internal-compatible behavior,
but stop documenting it as the primary viewer path. Public examples should use
`WorkflowViewer` for website and ops read-only surfaces.

### Is `mode="playground"` a real product mode?

No. The store type has `"viewer" | "playground" | "editor"`, and the editor
showcase route exposes it in the mode dropdown, but the current editor behavior
only gates write operations on `mode === "viewer"`. That makes `"playground"` an
editable demo/harness label, not a separate product mode.

Recommendation: deprecate `mode="playground"` from public docs and move demo
harness behavior into route code or a private/demo-only type.

### Are `chrome` options too low-level for normal consumers?

Yes. `chrome={{ toolbar, tabs, inspector, minimap, controls }}` is useful for
advanced embedding and tests, but it is too easy for normal consumers to create
unsafe or inconsistent combinations. For example, hiding `toolbar` removes
validation issue badges and package save affordances; hiding `controls` removes
fit/fullscreen plus editing controls bundled into the canvas controls group.

Recommendation: keep `chrome` as an advanced escape hatch, but add high-level
surface presets and named toolbar slots for common product integrations.

## Toolbar and Chrome Ownership

### Controls owned by the editor package

The workflow editor package should own controls that operate on the canonical
editor document or graph interaction state:

- Undo.
- Redo.
- Add State.
- Add Note.
- Auto-arrange.
- Reset positions / reset layout.
- Fit view and fullscreen.
- Workflow tabs.
- Inspector open/close behavior.
- Validation issue badges and issue drawer.
- JSON/developer surfaces when enabled.
- Keyboard shortcuts for editor actions.

These controls need access to internal editor state such as undo stacks,
selection, active workflow, validation issues, and layout metadata. Hosts should
not have to reimplement them.

### Controls owned by the host application

The host should own controls that involve external resources, product policy, or
environment-specific side effects:

- Open workflow file.
- Save to local file.
- Save as.
- Reload from disk.
- Dirty indicator.
- Overwrite/discard warnings.
- Environment selector.
- Compare with source/deployed version.
- Export/download JSON.
- Break-glass authorization and confirmation.
- Deployment pipeline links or source-control links.

These controls depend on APIs and permissions outside the package.

### Why did the local file editor hide the editor toolbar?

The route currently renders a host toolbar above the editor with open/save/save
as/reload, dirty state, and issue summary. Since `WorkflowEditor` has no place
for host file actions, the route has to place host controls outside the editor.
That creates duplicated top chrome and makes it tempting to suppress the editor
toolbar. Suppression is the wrong abstraction because it removes diagnostics and
save keyboard behavior along with visual chrome.

### How should a host add file controls without removing editor controls?

`WorkflowEditor` should expose toolbar slots/render props. For example:

```tsx
<WorkflowEditor
  document={document}
  surface="dev-console"
  toolbarStart={<FilePickerActions />}
  toolbarCenter={<DirtyIndicator dirty={dirty} fileName={fileName} />}
  toolbarEnd={<SaveActions />}
/>
```

The editor would still render package-owned editor actions and diagnostics in
their canonical regions. Host slots would be additive, not a reason to disable
the editor toolbar.

### Should the toolbar be split?

Yes. The conceptual regions should be explicit:

- Editor actions: undo, redo, add state, add note, auto-arrange, reset layout.
- Host actions: file open/save/reload, environment actions, export.
- Diagnostics/issues: validation counts and issue drawer.
- Developer actions: JSON tab/split, raw metadata, debug surfaces.

This does not require four visible bars. It requires a structured toolbar model
so presets decide what appears and hosts can inject into known regions.

### Should the package offer slots/render props?

Yes. Slots are the cleanest way to preserve package ownership while allowing
host-specific controls. The slot API should be high-level and sparse:

- `toolbarStart?: ReactNode`
- `toolbarCenter?: ReactNode`
- `toolbarEnd?: ReactNode`
- `renderToolbarHostActions?: (ctx: ToolbarContext) => ReactNode`
- `renderDiagnostics?: (ctx: DiagnosticsContext) => ReactNode` as an advanced
  override only.

The default toolbar should remain fully usable without slots.

## Recommended Public API

### Components

- `WorkflowViewer`: read-only, lightweight, website and ops default.
- `WorkflowEditor`: editable Dev Console and explicit break-glass editor.
- Do not add `WorkflowEnvironmentViewer` now. It would duplicate
  `WorkflowViewer` before the ops-specific runtime contract is proven.

### Recommended props

For `WorkflowViewer`:

```ts
type WorkflowSurface = "website" | "ops-console";
type WorkflowLayout = "embedded" | "fullWidth";
type ViewerInteraction = "none" | "select" | "hover-highlight" | "hover-path";

interface WorkflowViewerProps {
  document?: WorkflowEditorDocument;
  graph?: GraphDocument;
  surface?: WorkflowSurface;
  layout?: WorkflowLayout;
  interaction?: ViewerInteraction;
  runtimeContext?: RuntimeWorkflowContext;
  selectedId?: string;
  onSelectionChange?: (id: string | null) => void;
  onInspect?: (inspection: WorkflowInspection | null) => void;
  pathProvider?: WorkflowPathProvider;
}
```

For `WorkflowEditor`:

```ts
type EditorSurface = "dev-console";
type EditorLayout = "fullWidth" | "embedded";

interface WorkflowEditorProps {
  document: WorkflowEditorDocument;
  surface?: EditorSurface;
  layout?: EditorLayout;
  mode?: "editor" | "viewer";
  developerMode?: boolean;
  onChange?: (doc: WorkflowEditorDocument) => void;
  onSave?: (doc: WorkflowEditorDocument) => void;
  toolbarStart?: React.ReactNode;
  toolbarCenter?: React.ReactNode;
  toolbarEnd?: React.ReactNode;
  enableJsonEditor?: boolean;
  jsonEditorPlacement?: "tab" | "split";
  layoutMetadata?: WorkflowUiMeta;
  onLayoutMetadataChange?: (meta: WorkflowUiMeta) => void;
  localStorageKey?: string | null;
}
```

### Defaults

- `WorkflowViewer surface="website"`: read-only, embedded layout, no edit
  controls, hover highlight enabled.
- `WorkflowViewer surface="ops-console"`: read-only, full-width layout,
  selection/inspection enabled, export/compare left to host slots.
- `WorkflowEditor surface="dev-console"`: edit mode, full editor controls,
  diagnostics visible, inspector enabled, layout persistence enabled by
  explicit host metadata or local storage, JSON disabled unless opted in.

### Deprecated/confusing props

- Public docs should stop recommending `WorkflowEditor mode="viewer"`.
- Deprecate `mode="playground"` as public API.
- Reclassify `chrome` as advanced-only.

### Advanced-only props

- `chrome`
- raw `jsonEditor` Monaco configuration
- `localStorageKey`
- low-level layout options
- diagnostic rendering overrides

### Breaking changes to defer

- Removing `mode="playground"` from the exported `EditorMode` union.
- Replacing `graph` with `document` as the only viewer input.
- Removing `chrome`.
- Renaming `onSave`.

Additive changes can deliver the target model first.

## Recommended Component/Mode/Surface Model

### Option A: separate components

Components:

- `WorkflowViewer`
- `WorkflowEditor`
- `WorkflowEnvironmentViewer`

Pros:

- Strong separation by use case.
- Safe defaults can be baked into each component.
- Clear names for consumers.

Cons:

- `WorkflowEnvironmentViewer` would likely wrap `WorkflowViewer` at first.
- More components increase maintenance and documentation burden.
- Break-glass editing still needs to switch to `WorkflowEditor`.

### Option B: presets

Components stay the same; add presets:

- `surface="website"`
- `surface="dev-console"`
- `surface="ops-console"`

Pros:

- Keeps two real rendering implementations.
- Makes product intent explicit.
- Avoids low-level prop proliferation.
- Allows safe defaults and additive host slots.

Cons:

- Presets need careful documentation.
- Some advanced combinations still need escape hatches.

### Option C: high-level mode/layout props

Use:

- `mode="viewer" | "editor"`
- `surface="website" | "dev-console" | "ops-console"`
- `layout="embedded" | "fullWidth"`

Pros:

- Explicitly separates mutability from product surface and layout density.
- Easy to migrate from current `mode`.
- Works with both public components.

Cons:

- Allows invalid combinations unless constrained by component typing.
- Can drift toward too many axes if not kept small.

### Recommendation

Use a constrained version of Option C, implemented as Option B-style presets on
the two existing components.

Recommended model:

- `WorkflowViewer` accepts `surface="website" | "ops-console"` and
  `layout="embedded" | "fullWidth"`.
- `WorkflowEditor` accepts `surface="dev-console"` and
  `layout="fullWidth" | "embedded"`.
- `mode` remains on `WorkflowEditor` only for compatibility and advanced
  read-only shell use.
- `chrome` remains advanced-only and should not appear in first-run examples.

This gives consumers the target ergonomics without introducing a third
component before the ops surface has unique rendering needs.

## Website Hover / STP Path Requirement

### Does the current graph model include enough information?

Partially.

`GraphDocument` includes state nodes, transition edges, workflow names, state
codes, edge labels, transition summaries, criteria summaries, processor
summaries, roles, and disabled/manual flags. That is enough to show adjacent
transition paths and representative transition labels around a hovered state.

It is not enough to show an authoritative STP path if "STP path" means a
business-specific straight-through-processing path selected from domain rules.
The graph projection does not currently annotate canonical paths, path groups,
or representative journeys.

### Is there existing path/highlight support?

Yes, but it is adjacency-based. Both `WorkflowViewer` and the React Flow canvas
compute a highlight set for the hovered or selected node/edge. A focused state
highlights directly connected transitions and neighboring states. A focused
edge highlights its source and target.

There is no public API for:

- returning hover inspection metadata to the host;
- highlighting a multi-hop path;
- choosing the STP path;
- displaying a state hover card with path details.

### What API should be added?

Add shared path/inspection types:

```ts
interface WorkflowInspection {
  focusedId: string;
  kind: "state" | "transition";
  workflow: string;
  stateCode?: string;
  transitionName?: string;
  adjacentTransitions: Array<{
    id: string;
    name: string;
    direction: "incoming" | "outgoing";
    sourceState: string;
    targetState: string;
  }>;
  paths?: WorkflowPath[];
}

interface WorkflowPath {
  id: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
  kind?: "stp" | "representative" | "exception" | "custom";
}
```

Add viewer props:

```ts
interaction="hover-path"
onInspect={(inspection) => setInspection(inspection)}
pathProvider={(ctx) => computeRepresentativePaths(ctx)}
```

If no `pathProvider` is supplied, the viewer should fall back to adjacent path
inspection only.

### Where should hover behavior live?

The pure graph/path computation should live in `workflow-graph` because both
`workflow-viewer` and `workflow-react` can use it. Rendering hover cards or
visual treatment belongs in `workflow-viewer` and `workflow-react`.

The existing duplicated `computeHighlightSet` logic in viewer and React canvas
should be consolidated into a shared graph helper.

### How should this work without making the website viewer heavy?

Keep the website viewer SVG-only:

- Use `GraphDocument` and optional path metadata.
- Do not import React Flow, Monaco, or editor store code.
- Compute paths with pure helpers.
- Let hosts render rich external hover cards through `onInspect`.
- Provide a small built-in tooltip only for simple labels if needed.

## Dev Console Integration Contract

### Document loading

The host owns file discovery and file selection. It should parse local workflow
JSON through `parseImportPayload` or a wrapper like the demo route's
`parseLocalWorkflowFile`, then pass a `WorkflowEditorDocument` to
`WorkflowEditor`.

The editor should not know about project directories or the File System Access
API.

### Local file save

The host owns writing to disk. The editor should emit document changes and
support a save intent:

- `onChange(nextDocument)` for dirty-state tracking.
- `onSave(currentDocument)` for Ctrl/Cmd+S and editor save intent.
- Host serializes with `serializeImportPayload(currentDocument)` to keep output
  clean.

### Dirty state

The host should compare clean serialized JSON against a saved baseline. This is
what the current local file editor route does with `serializeImportPayload`.

### Overwrite warning

The host owns overwrite, discard, and reload confirmations because the package
does not know whether the save target is local disk, remote storage, source
control, or an environment API.

### Editor metadata not saved to workflow JSON

The editor should continue storing UI metadata in `doc.meta.workflowUi` and
clean serializers should continue excluding layout, comments, edge anchors, and
viewports from Cyoda workflow JSON. Dev Console docs should make
`serializeImportPayload` the recommended save path.

### Full-width layout

Add `layout="fullWidth"` or make it the default for
`surface="dev-console"`. The host should be able to mount the editor in a
full-window container without hiding navigation or file controls.

### JSON editor/developer mode

Keep `developerMode` and `enableJsonEditor` opt-in. For Dev Console, a preset
can recommend enabling both:

```tsx
<WorkflowEditor surface="dev-console" developerMode enableJsonEditor />
```

### Local layout metadata persistence

For a local project tool, prefer host-controlled metadata:

- `layoutMetadata`
- `onLayoutMetadataChange`

Use `localStorageKey` for demos or simple standalone embedding, not as the
primary Dev Console persistence story. If localStorage remains available, docs
should warn that keys must not derive directly from unsanitized user input.

### File controls outside editor, editor controls inside package

File controls are host actions but should be visually integrated through editor
toolbar slots. Editor controls should remain package-owned.

### Props/API needed to avoid route-specific hacks

Add:

- `surface="dev-console"`
- `layout="fullWidth"`
- `toolbarStart`
- `toolbarCenter`
- `toolbarEnd`
- `renderHostActions?: (ctx) => ReactNode`
- `saveAction?: "none" | "button" | "keyboard" | "button-and-keyboard"` if
  more control is needed later.

Do not make hosts hide `chrome.toolbar` just to add file controls.

### Should Save be separable from edit controls?

Yes. Save is often host-owned, while undo/add/auto-layout are editor-owned.
The package should distinguish:

- editor actions;
- save intent;
- host file persistence.

`onSave` can remain as the save intent callback, but the visible button should
be configurable or placeable in a host slot.

## Ops Console Integration Contract

### Read-only by default

Ops Console should default to `WorkflowViewer surface="ops-console"` with no
edit controls. A read-only React Flow shell can remain an advanced option, but
it should not be the canonical API.

### No edit controls

No add state, add note, undo/redo, drag-connect, JSON editing, or save controls
should render in the default ops surface.

### Export JSON

Export is a host action. The viewer can expose an `exportSlot` or generic
toolbar host slot, but the host should decide what is exported and under what
permissions.

### Compare with source

Compare-with-source is host-owned because it needs environment identity, source
repo identity, deployment version, or package artifact metadata. The viewer
should expose selection/inspection context that a host compare panel can use.

### Optional break-glass edit mode

Break-glass should be a host-controlled transition into `WorkflowEditor`, not a
hidden toggle inside `WorkflowViewer`.

The host should:

- show warnings about editing a running environment;
- require confirmation and permission checks;
- fetch or lock the latest runtime version;
- mount `WorkflowEditor` only after explicit confirmation;
- call a host-owned save/apply endpoint;
- log/audit the action.

## Break-glass Editing Recommendation

### Should break-glass use `WorkflowEditor` after confirmation?

Yes. `WorkflowViewer` should stay read-only. Once the host has completed
authorization and confirmation, it can render:

```tsx
<WorkflowEditor
  document={runtimeDocument}
  mode="editor"
  surface="dev-console"
  layout="fullWidth"
  developerMode
  onChange={setDraft}
  onSave={submitBreakGlassChange}
/>
```

This reuses the real editor rather than adding edit behavior to the viewer.

### How should warning/confirmation be represented?

Host-owned UI should represent it. The package can expose optional helper types
or a neutral warning banner slot, but should not own policy language or
confirmation thresholds.

### Should the package include break-glass UI?

No, not as default UI. Break-glass is product policy and environment security.
The package should expose safe primitives:

- read-only viewer;
- editor component;
- save intent;
- diagnostics;
- metadata;
- optional warning/host slots.

### What should the package expose to make break-glass safe?

- `readOnly`/`mode="viewer"` behavior that reliably disables edits.
- No edit controls in ops viewer presets.
- An explicit prop such as `allowEditing` should not default to true in ops
  surfaces.
- Clear save intent API.
- Dirty state support through `onChange`.
- Clean serialization guidance.

## Demo App Cleanup Plan

### Canonical website viewer demo

Use `/embed` or replace it with a renamed route such as `/website-viewer`.
This route should demonstrate:

- `WorkflowViewer`;
- fixed-width embedded layout;
- no JSON editor;
- no file controls;
- hover/path inspection;
- representative real workflow.

The current `/embed` route is close, but should become the canonical website
viewer example instead of being described as the "original slim viewer embed."

### Canonical Dev Console editor demo

Use `/local-file-editor` as the canonical Dev Console editor demo.

It already demonstrates:

- local file open;
- save/save-as/reload;
- dirty state;
- overwrite/discard warnings;
- clean serialization;
- full-window layout;
- JSON editor and developer mode.

After API cleanup, it should use toolbar slots rather than a separate route
toolbar that competes with editor chrome.

### Canonical Ops Console read-only viewer demo

Add a new route, for example `/ops-viewer`.

It should demonstrate:

- `WorkflowViewer surface="ops-console"`;
- full-width layout;
- runtime/environment context;
- selection/inspection panel;
- export/compare host actions;
- no edit controls;
- optional disabled break-glass affordance or a mock host-controlled
  confirmation flow.

### Developer harnesses

Clearly label these as harnesses, not consumer examples:

- `/viewer`: projection/parser/viewer playground with JSON editing.
- `/layout`: ELK/fallback layout harness.
- `/editor`: full editor feature harness, mode/chrome toggles, JSON split.
- `/criteria`: criterion editor regression harness.
- `/monaco`: Monaco bridge harness.
- `/save-flow`: save-flow state machine harness.
- `/utilities`: lower-level helper harness.

### Routes not to use as consumer examples

Do not present these as normal consumer integration examples:

- `/editor`, because it exposes `mode="playground"` and low-level `chrome`
  toggles.
- `/viewer`, because it is a parser/projection playground with raw JSON editing,
  not a website embed.
- `/monaco`, `/save-flow`, `/utilities`, and `/criteria`, because they are
  focused regression/developer harnesses.

## Tests To Add

Add or adjust tests around the new API behavior:

- Website viewer renders no edit controls for `surface="website"` and supports
  hover/path inspection.
- Website viewer can receive a `document` directly and project it without host
  boilerplate.
- Dev Console editor renders full edit controls and diagnostics by default for
  `surface="dev-console"`.
- Host toolbar slots render file controls without hiding editor actions or issue
  badges.
- Ops console viewer renders no edit controls for `surface="ops-console"`.
- Ops console viewer supports selection/inspection and host export/compare
  slots.
- Break-glass path only enables editing after the host changes state and mounts
  `WorkflowEditor`.
- Local file save uses `serializeImportPayload`.
- Editor metadata is excluded from clean workflow JSON.
- Demo route tests assert that website, Dev Console, and ops canonical routes
  reflect the three product surfaces.
- Existing low-level `chrome` tests remain, but are reclassified as advanced
  behavior tests.

## Migration Plan

### Non-breaking changes first

1. Add `surface`, `layout`, `interaction`, and inspection props to
   `WorkflowViewer`.
2. Add `surface`, `layout`, and toolbar slot props to `WorkflowEditor`.
3. Add shared graph helpers for highlight/path/inspection.
4. Add tests for new surface presets and slots.
5. Keep current `graph`, `mode`, and `chrome` props working.

### Docs/demo updates

1. Update root and package READMEs to show the three canonical use cases.
2. Promote `/embed` or `/website-viewer` as the website viewer example.
3. Promote `/local-file-editor` as the Dev Console editor example.
4. Add `/ops-viewer` as the ops console viewer example.
5. Rename or label playground routes as developer harnesses.
6. Remove `mode="playground"` and chrome checkbox demos from consumer-facing
   examples.

### Later breaking cleanup

After consumers have migrated:

1. Remove or hide `mode="playground"` from public exported types.
2. Move `chrome` to an advanced namespace or docs section.
3. Consider making `document` the preferred `WorkflowViewer` input while
   retaining `graph` for advanced callers.
4. Revisit whether `onSave` needs a clearer name such as `onSaveIntent` in a
   major version.
