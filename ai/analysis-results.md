# Workflow Editor API and Demo Review

## Executive Summary

The observed toolbar inconsistency is real. It is not caused by one broken toolbar button; it comes from multiple legitimate-but-overlapping ways to render workflow UI:

- `@cyoda/workflow-viewer` exports a true lightweight read-only SVG viewer with no toolbar or editing affordances.
- `@cyoda/workflow-react` exports `WorkflowEditor`, which supports `mode="editor"`, `mode="playground"`, and `mode="viewer"`. Its `viewer` mode is read-only but still renders the editor shell toolbar unless `chrome.toolbar` is disabled.
- Demo pages wrap these components with route-specific page chrome, controls, panels, fixed-height shells, and in the local file route, a completely separate top toolbar.
- `WorkflowEditor` exposes low-level controls such as `chrome`, `layoutOptions`, `localStorageKey`, JSON editor placement, Monaco config, layout metadata, developer mode, and save callbacks directly to consumers.

The result is a package that can support the needed product surfaces, but the simple consumer path is not obvious. The demo app currently reads as a set of divergent product variants rather than a small set of canonical viewer/editor integrations plus developer harnesses.

Recommended direction: keep two canonical public components, `WorkflowViewer` for read-only rendering and `WorkflowEditor` for editing, and add a small high-level layout/API contract around them. Avoid exposing route-specific chrome combinations as first-class product patterns.

## 1. Package Structure

| Package | Intended responsibility | Current boundary assessment |
|---|---|---|
| `packages/workflow-core` | Domain model, schema, parsing, normalization, validation, serialization, patching, migration, criteria helpers, API-related types. | Clean. No React dependency. It is the source of domain truth and publishes explicit exports only. |
| `packages/workflow-graph` | Project domain documents into graph nodes/edges and summarize graph annotations; convert graph edit events into domain patches. | Mostly clean. It depends on core and exposes graph projection/edit helpers. |
| `packages/workflow-layout` | ELK layout adapter, layout presets, node sizing, pinned-node support. | Clean. It depends on core and graph and owns layout calculation. |
| `packages/workflow-viewer` | Slim read-only SVG renderer for graph documents. | Clean and lightweight. It depends on core/graph and React, but not React Flow, Monaco, or editor state. |
| `packages/workflow-react` | Full browser editor shell, React Flow canvas, inspector, toolbar, undo/redo, comments, JSON editor integration, save UI helpers. | Functionally cohesive, but public props expose many low-level implementation choices. It also depends on `workflow-viewer`, though the inspected editor path renders via React Flow rather than the slim SVG viewer. |
| `packages/workflow-monaco` | Monaco JSON schema, markers, selection bridge, JSON-to-patch controller. | Clean as a lower-level optional integration package. |
| `apps/docs-embed-demo` | Internal demo/regression app for viewer, layout, editor, criteria, Monaco, save flow, and local-file workflows. | Useful, but it mixes canonical product demos with developer harnesses and route-specific wrappers. |

`workflow-viewer` remains a true lightweight read-only viewer. It renders an SVG from a `GraphDocument`, optional precomputed layout, dimensions, selection, and className. It has no edit controls.

`workflow-react` owns the editor-only logic: undo/redo, React Flow editing, add/delete state, transition reconnect/delete, comments, inspector forms, JSON editor surface, local layout metadata, and save button wiring.

The demo app imports package root public APIs rather than deep package internals. However, it often composes lower-level public packages itself, for example `parseImportPayload` + `projectToGraph` + `WorkflowViewer`. That is appropriate for developer demos, but it makes website/Ops usage look more complex than it should be if no higher-level viewer wrapper accepts a workflow document directly.

## 2. Public API Surface

Current root exports inspected:

- `@cyoda/workflow-core`: domain types, schemas, parsing, normalization, serialization, validation, patching, migration, identity, criteria helpers.
- `@cyoda/workflow-viewer`: `WorkflowViewer`, `WorkflowViewerProps`, `simpleLayout`, layout result types.
- `@cyoda/workflow-react`: `WorkflowEditor`, `WorkflowEditorProps`, `ChromeOptions`, JSON editor types, layout types, `EditorMode`, save-flow helpers, i18n helpers, field hint types.
- `@cyoda/workflow-monaco`: schema registration, marker helpers, JSON patch lifting, controller attachment, cursor/selection bridge, pointer helpers, Monaco-like types.

External consumers should currently use:

- Viewing: `WorkflowViewer` from `@cyoda/workflow-viewer`, but only after converting a workflow document to a graph with `projectToGraph`.
- Editing: `WorkflowEditor` from `@cyoda/workflow-react`.

The API has become more complex than the product expectation. `WorkflowEditorProps` includes:

- `mode`
- `messages`
- `layoutOptions`
- `chrome`
- `onChange`
- `onSave`
- `layoutMetadata`
- `onLayoutMetadataChange`
- `localStorageKey`
- `enableJsonEditor`
- `jsonEditorPlacement`
- `jsonEditor`
- `onJsonStatusChange`
- `hintProvider`
- `developerMode`

These are individually reasonable, but as a first-use API they expose too much of the implementation model. The main coherence problem is that `mode`, `chrome`, `developerMode`, JSON editor props, and save props all influence visible UI. There is no single obvious "Dev Console editor" or "website viewer" path.

Low-level props leaking implementation complexity:

- `chrome` lets consumers suppress core package chrome, which is how the local file route hides the standard editor toolbar.
- `jsonEditorPlacement` and `jsonEditor` expose Monaco placement/runtime decisions directly.
- `layoutOptions`, `layoutMetadata`, `onLayoutMetadataChange`, and `localStorageKey` expose persistence/layout internals rather than a high-level layout contract.
- `mode="playground"` exists publicly but behaves like editable mode for toolbar/readOnly purposes because only `mode === "viewer"` is treated as read-only.

There is not yet a clear simple path for a new consumer. A new consumer must choose between `WorkflowViewer` and `WorkflowEditor mode="viewer"`, understand when to project to graph, decide whether to pass `onSave`, decide whether to hide chrome, and pick layout/container CSS outside the package.

## 3. Current Editor/Viewer Usages

| Route/Page | Component | Mode/readOnly | Layout | Toolbar controls | Save integration | Notes |
|---|---|---|---|---|---|---|
| `/editor`, `EditorShowcasePage` | `WorkflowEditor` | User-selectable `viewer` / `playground` / `editor`; default `editor`; `viewer` is read-only | `.editor-shell`, fixed `780px`; package chrome toggles | Built-in toolbar when `chrome.toolbar` true. In editor/playground: Undo, Redo, Add State, Add Note, Auto-arrange, Reset positions, validation pills, Save. In viewer: Undo/Redo disabled, edit controls hidden, validation pills, Save disabled if provided | `onSave={() => {}}`, so Save button appears but no real persistence | Also exposes route controls for mode, JSON placement, chrome toggles, reset. This is a harness, not a simple consumer example. |
| `/criteria?clean=1`, `CriteriaEditorPage` clean mode | `WorkflowEditor` | `mode="editor"` | `.editor-shell`, fixed `780px`; extra simple title strip above editor | Built-in full editor toolbar: Undo, Redo, Add State, Add Note, Auto-arrange, Reset positions, validation pills, Save | `onSave={() => {}}`, so Save appears but is inert | `developerMode={false}`, no JSON editor. Closest clean full editor route. |
| `/criteria`, `CriteriaEditorPage` harness mode | `WorkflowEditor` | `mode="editor"` | `.editor-shell`, fixed `780px` inside demo panels | Built-in full editor toolbar | `onSave={() => {}}`, inert Save button | Enables JSON editor tab and `developerMode`. Also shows coverage matrix and JSON blocks. This is a developer harness. |
| `/local-file-editor`, `LocalFileEditorPage` | `WorkflowEditor` inside custom immersive page | `mode="editor"` | Full-window-ish `.local-file-editor__editor-shell`, `height: calc(100vh - 104px)`, `min-height: 560px` | Package toolbar hidden with `chrome={{ toolbar: false }}`. Route-level toolbar shows Back, Open, file name, dirty, issue chip, Save/Download, Save as, Reload. Built-in Add State, Undo, Redo, Auto-arrange, Reset positions are not visible as top toolbar buttons | Local file route owns save/download/reload and passes `onSave`, but hidden package toolbar means the editor Save button is not visible. Keyboard `Cmd/Ctrl+S` can still call `onSave` | Main source of apparent inconsistency. It suppresses package toolbar to install file chrome, but does not re-expose package editing controls elsewhere. |
| `/viewer`, `ViewerPlaygroundPage` | `WorkflowViewer` | True read-only viewer | `.viewer-card--playground`, fixed `780px`, paired with JSON textarea | No package toolbar. Route has Reset draft and Apply JSON for the textarea | No save; Apply JSON updates local render state | Developer playground for parse/project/render, not an Ops/website canonical viewer. |
| `/layout`, `LayoutShowcasePage` | `WorkflowViewer` twice | True read-only viewer | `.viewer-card--medium`, min-height `640px`; dual panel | No package toolbar. Route has layout controls for preset/orientation/pin | No save | Developer layout comparison harness. |
| `/embed`, `EmbedViewerPage` | `WorkflowViewer` | True read-only viewer | `.viewer-card--embed`, min-height `640px` | No package toolbar | No save | Closest website/docs embed example, but still requires parse + graph projection in the route. |
| `/monaco`, `MonacoPlaygroundPage` | `WorkflowViewer` plus manual Monaco controller | Viewer is true read-only graph; Monaco is editable JSON | `.viewer-card--playground` beside Monaco host, both fixed `780px` | No package toolbar. Route has Apply immediately for Monaco | No save | Developer harness for `workflow-monaco`, not canonical viewer/editor usage. |
| `/save-flow`, `SaveFlowHarnessPage` | `WorkflowEditor` plus save-flow components | `mode="editor"` | `.editor-shell`, fixed `780px` inside panel | Built-in editor toolbar without Save button because no `onSave` is passed to `WorkflowEditor`. Separate route panel has Request save / Clear status | Save handled outside editor by `useSaveFlow`, `SaveConfirmModal`, and `ConflictBanner` | Demonstrates package save helpers, but not integrated with the editor toolbar. |
| `/examples` / `WorkflowExamplesPage` | `WorkflowViewer` | True read-only viewer | `.viewer-card--playground` | No package toolbar; route has Reset draft / Apply JSON | No save | Similar to `/viewer`; likely redundant. |
| Package tests | Mostly `WorkflowEditor`; viewer tests use `WorkflowViewer` | Editor tests cover editor and viewer modes | Test DOM containers, not product layouts | Tests assert some toolbar behavior but not one canonical complete toolbar contract | Save button only tested as present when `onSave` exists | Tests currently allow divergent chrome suppression. |

## 4. Toolbar and Control Inconsistencies

The built-in editor toolbar lives in `packages/workflow-react/src/toolbar/Toolbar.tsx` and is rendered by `WorkflowEditor` when `chrome?.toolbar !== false`.

Built-in `WorkflowEditor` toolbar controls:

- Undo
- Redo
- Add State, only when not read-only and `onAddState` is supplied
- Add Note, only when not read-only and `onAddComment` is supplied
- Auto-arrange, only when not read-only and `onAutoLayout` is supplied
- Reset positions, only when not read-only and `onResetLayout` is supplied
- validation issue pills
- Save, only when `onSave` is supplied

The editor computes `readOnly` as `state.mode === "viewer"`. Therefore:

- `mode="editor"` shows edit controls.
- `mode="playground"` also shows edit controls.
- `mode="viewer"` hides Add State, Add Note, Auto-arrange, and Reset positions, while leaving Undo/Redo visible but disabled and Save visible but disabled if `onSave` exists.

Controls are hidden by:

- `chrome={{ toolbar: false }}`: hides the whole package toolbar.
- `mode="viewer"`: hides edit controls and disables save/undo/redo.
- Missing `onSave`: hides the built-in Save button.
- JSON validation/schema errors: disable Save through `saveDisabled`, but do not hide it.
- `developerMode`: does not control the top toolbar. It controls developer-oriented inspector/diagnostic affordances.
- Missing callbacks: `Toolbar` conditionally renders edit buttons only when callbacks exist, but `WorkflowEditor` supplies them in non-viewer modes.

Why specific pages lack controls:

- Local file editor lacks Add State, Undo, Redo, Auto-arrange, and Reset positions in the top toolbar because it hides the package toolbar and renders its own file toolbar. The editing operations still exist through canvas interactions and keyboard shortcuts, but the standard top controls are not visible.
- Save-flow harness lacks the editor Save button because it does not pass `onSave` to `WorkflowEditor`; save is exposed in a separate harness panel.
- Viewer and layout pages lack all edit controls because they use the true read-only `WorkflowViewer`, not `WorkflowEditor`.
- Editor showcase can intentionally hide any toolbar/chrome control because it exposes the `chrome` object as demo UI.
- `WorkflowEditor mode="viewer"` can still show a toolbar skeleton, which is visually different from `WorkflowViewer` and creates ambiguity around what "viewer" means.

There are multiple toolbar implementations:

- The package `Toolbar` in `workflow-react`.
- The local file route toolbar in `LocalFileEditorPage`.
- Demo panel action bars such as fixture controls, JSON apply/reset, layout controls, save-flow request controls, and clean-mode toggles.

Only one of these is the editor toolbar. The demo app does not visually distinguish product chrome from developer harness chrome strongly enough.

## 5. Save/Load Model

Save is not fully built into `WorkflowEditor`. The editor only renders a Save button when the host supplies `onSave`, and it invokes `onSave(state.document)` from the toolbar or `Cmd/Ctrl+S` when not read-only and not save-disabled.

The save-flow package helpers are exported separately:

- `useSaveFlow`
- `SaveConfirmModal`
- `ConflictBanner`
- `diffSummary`

This means the host owns backend persistence, dirty state, server concurrency tokens, confirmation modals, and conflict handling.

Local file editor:

- Owns open/reload/save/download/save-as.
- Computes dirty state by comparing serialized import payload against a baseline.
- Uses `serializeImportPayload(document)` so editor metadata such as layout/comments is not written to workflow JSON.
- Passes `onSave` to `WorkflowEditor`, but hides the editor toolbar, so only keyboard save reaches that callback from inside the editor.
- Implements its own overwrite/discard confirmation modals, separate from package save-flow modals.

Save availability affects toolbar rendering only by presence of `onSave`. Passing `onSave` renders Save; not passing it hides Save. Invalid JSON/schema, read-only mode, or validation errors disable Save but do not hide it.

Dirty-state contract is not centralized. `WorkflowEditor` emits every document change through `onChange`, but the host decides what counts as dirty. The local file route has a clear local dirty implementation, while the save-flow harness has a separate server snapshot model.

Integration path assessment:

- Dev Console local file save: possible today, but not simple. It needs the local-file route pattern: file open/read, `onChange` dirty compare, `onSave`, local serialization, custom file toolbar, and probably `chrome.toolbar` decisions.
- Ops Console read-only view: possible today with `WorkflowViewer`, but host must parse/project or already provide `GraphDocument`.
- Backend save with conflict handling: package provides helpers, but editor toolbar save is not wired to `useSaveFlow` automatically.

## 6. Layout Model

Current layout is split across package props and demo CSS:

- `WorkflowViewer` accepts `width`, `height`, optional `layout`, and `className`. It defaults width/height to `100%` and uses an SVG viewBox.
- `WorkflowEditor` assumes its parent gives it usable height. Internally it uses `height: "100%"`, flex layout, React Flow, optional minimap/controls, and inspector-driven resize keys.
- Demo fixed-height editor layouts are implemented by `.editor-shell` with `height: 780px; min-height: 780px`.
- Demo full-window local editing is implemented by `.local-file-editor__editor-shell` with `height: calc(100vh - 104px); min-height: 560px`.
- Viewer demo cards define fixed or minimum heights through `.viewer-card--embed`, `.viewer-card--playground`, and `.viewer-card--medium`.

There is no high-level package prop equivalent to `layout="embedded"` or `layout="fullWidth"`. Consumers must know that container CSS is required.

Clean usage today:

- Full-width console editor: achievable by wrapping `WorkflowEditor` in a full-height flex/grid container and ensuring ancestors have `min-height: 0`.
- Fixed website viewer embed: achievable by wrapping `WorkflowViewer` in a fixed-height/fixed-width container or passing width/height.

But the demo CSS makes the package look inconsistent because each route chooses its own shell, radius, height, page chrome, and action bars.

React Flow resize behavior is partially handled. `WorkflowEditor` passes `resizeKey={inspectorVisible ? 1 : 0}` into `Canvas` so the canvas can react when the inspector appears/disappears. This is the right kind of behavior, but the final reliability still depends on parent container sizing.

## 7. Recommended Simplification

Prefer a small set of high-level component props over route/product presets.

Presets such as `preset="website-embed"` and `preset="dev-console"` are tempting, but they encode product names into a reusable package and tend to grow as every host asks for a variant. A small declarative API is more stable:

```tsx
<WorkflowViewer
  document={document}
  layout="embedded"
  height={480}
  showMiniMap={false}
/>

<WorkflowEditor
  document={document}
  onChange={setDocument}
  onSave={save}
  layout="fullWidth"
  developerMode={false}
  enableJsonEditor={false}
/>
```

Recommended public props:

- `document`
- `onChange` for editor
- `onSave` for editor
- `mode`, but only if it remains meaningful as `"viewer" | "editor"`; otherwise keep viewer as a separate component and remove public `WorkflowEditor mode="viewer"` from recommended docs
- `layout: "embedded" | "fullWidth"`
- `height` for embedded/fixed use
- `developerMode`
- `enableJsonEditor`
- `jsonEditor` only for advanced hosts that provide Monaco
- `hintProvider`
- `messages`

Props that should become internal or advanced-only:

- `chrome` as a general-purpose public product API. It is useful for harnesses but dangerous for canonical integrations.
- `jsonEditorPlacement`, unless JSON editor is an explicit advanced feature.
- `localStorageKey`, replaced by a clearer persistence option such as `layoutPersistence="none" | "localStorage"` with a key only for advanced use.
- `layoutMetadata` / `onLayoutMetadataChange`, unless Dev Console explicitly needs host-controlled layout metadata.
- `mode="playground"`, unless it has behavior distinct from editor.

Suggested defaults:

- `WorkflowViewer`: read-only, no toolbar, embedded layout by default, no edit controls ever.
- `WorkflowEditor`: editor mode by default, standard edit toolbar on by default, inspector on, minimap/controls on, JSON editor off, developerMode false, save hidden unless `onSave` exists.
- If `layout="fullWidth"`, package should apply the right flex/min-height behavior internally as far as possible, while still requiring the host container to provide height.
- If `layout="embedded"`, package should support explicit `height` and avoid full-width page chrome assumptions.

Toolbar standardization:

- One source of truth should define the editor toolbar controls.
- In editor mode, the package should always show standard edit controls unless the consumer opts into an explicitly named advanced/harness override.
- Viewer should never show edit controls. Ideally the true viewer component should be the recommended viewer path.
- Save should be a first-class optional editor toolbar action: if `onSave` exists, show Save in the standard toolbar; if hosts need Open/Save As/Reload, those should be host file controls around the editor, not replacements for core edit controls.
- Demo/test routes should avoid overriding package chrome except in routes explicitly labelled as developer harnesses.

## 8. Demo App Cleanup Proposal

The demo app should show capabilities without making divergent product variants look equally canonical.

Recommended simplified structure:

- Viewer demo: canonical website/Ops read-only usage.
- Editor demo: canonical full editor usage, with standard toolbar visible.
- Local file editor demo: canonical Dev Console local-file integration, with standard editor controls preserved and file controls clearly separate.
- Criteria/processors demo: keep only if it demonstrates domain editor coverage beyond the canonical editor. Label as a focused feature demo.
- Developer/debug demos: Monaco, layout, save-flow, utilities, JSON playgrounds. Clearly label as developer harnesses.

Current redundant or merge candidates:

- `/viewer` and `WorkflowExamplesPage` overlap heavily. Merge into one viewer playground or retire `WorkflowExamplesPage` if no route exposes it directly.
- `/embed` and `/viewer` overlap. Keep `/embed` as the canonical minimal viewer and make `/viewer` a developer playground if both remain.
- `/layout` is useful but should be labelled as a layout developer harness, not a product viewer variant.
- `/monaco` is a developer harness.
- `/save-flow` is a developer harness unless/until it becomes the canonical backend save integration example.
- `/editor` is currently a harness because it exposes mode/chrome/JSON placement toggles. It should not be the canonical editor route unless those controls are moved behind an "advanced harness" label.
- `/criteria` harness mode should be labelled a criterion coverage harness. Its clean mode is closer to a canonical editor demo.

Canonical route recommendations:

- Dev Console integration: `/local-file-editor`, but only after it uses the canonical editor toolbar and treats file controls as surrounding host chrome.
- Website/Ops read-only usage: `/embed`, preferably upgraded to show the simplest public API.
- Full editor package demo: either `/editor` with harness controls removed from the main view, or `/criteria?clean=1` generalized and renamed.

## 9. Dev Console, Ops Console, and Website Integration

Recommended Dev Console usage:

```tsx
<WorkflowEditor
  document={document}
  onChange={setDocument}
  onSave={saveDocument}
  layout="fullWidth"
  developerMode={true}
  enableJsonEditor={true}
/>
```

Until the proposed API exists, Dev Console can use:

```tsx
<WorkflowEditor
  document={document}
  mode="editor"
  onChange={setDocument}
  onSave={saveDocument}
  localStorageKey={null}
  enableJsonEditor
  jsonEditorPlacement="tab"
  jsonEditor={{ monaco, modelUri }}
  developerMode={true}
/>
```

Do not hide the standard toolbar for Dev Console unless replacement edit controls are provided.

Recommended Ops Console usage:

```tsx
<WorkflowViewer
  document={document}
  layout="fullWidth"
/>
```

Until `WorkflowViewer` accepts `document`, Ops Console must do:

```tsx
const graph = projectToGraph(document);

<WorkflowViewer graph={graph} />
```

Recommended website/docs embed:

```tsx
<WorkflowViewer
  document={document}
  layout="embedded"
  height={480}
/>
```

Until then:

```tsx
const graph = projectToGraph(document);

<div style={{ height: 480 }}>
  <WorkflowViewer graph={graph} />
</div>
```

Missing or weak public API features before Dev Console integration:

- High-level `layout` prop for editor/viewer.
- Document-accepting viewer wrapper, or a clearly documented parse/project/view helper path.
- Canonical local-file editor example that keeps standard edit controls visible.
- Clear dirty-state/save contract, especially if editor metadata should not mark workflow JSON dirty.
- Clear guidance on `developerMode` vs `enableJsonEditor`.

Package changes are advisable before broad Dev Console integration, but not strictly required for a prototype. The biggest risk is not missing editing capability; it is integration complexity and UI divergence.

## 10. Recommended Tests

Add or strengthen tests for:

- Editor mode always shows the standard edit toolbar controls: Undo, Redo, Add State, Add Note, Auto-arrange, Reset positions, validation pills, and Save when `onSave` is supplied.
- Viewer mode never shows edit controls.
- `WorkflowViewer` never renders edit controls.
- `WorkflowEditor mode="viewer"` behavior is explicitly tested or deprecated from recommended usage.
- Embedded layout renders without full-width/page chrome assumptions.
- Full-width layout fills its provided container and keeps React Flow usable.
- Local file editor uses the canonical editor integration and does not hide core edit controls unless intentionally scoped.
- Criteria editor route does not accidentally hide core editor controls unless intentionally scoped.
- Toolbar controls are controlled by one source of truth rather than copied into route wrappers.
- Public API smoke tests for simple viewer usage and simple editor usage.
- Save button contract: hidden without `onSave`, visible with `onSave`, disabled for read-only/invalid JSON/error states, and wired to keyboard save.
- Dirty-state contract for local file editing, including that layout/comment metadata does not get serialized into the workflow import payload.

## Bottom Line

The package boundaries are mostly clean. The underlying capabilities are present. The inconsistency comes from public API and demo composition, not from missing editor primitives.

The main simplification should be product-level:

- Treat `WorkflowViewer` as the only recommended viewer.
- Treat `WorkflowEditor` as the only recommended editor.
- Keep the editor's standard toolbar visible in editor mode.
- Move route-specific controls into clearly labelled host chrome or developer harnesses.
- Add high-level `layout` and simple document-based viewer usage so new consumers do not have to assemble parse/project/layout/chrome decisions themselves.
