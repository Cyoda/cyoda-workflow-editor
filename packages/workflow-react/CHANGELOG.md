# @cyoda/workflow-react

## 0.6.0

### Minor Changes

- e0736d8: Support cyoda-go 0.8.3 (workflow schema 1.3).

  - `transitions[].schedule.function` — per-entity scheduled-transition timing
  - `allowCycles` on the import payload, with a matching cycle-detection warning
  - Strict `version`-tag validation; new workflows are stamped `1.3` (the editor
    previously emitted `1.0`, which 0.8.3 rejects outright)
  - **Breaking:** the `"0.7"` dialect is removed. Upgrade configs to `"0.8"`.
  - **Breaking:** `startNewTxOnDispatch` moves into `config`, matching the wire
    format. It was emitted at processor level, which 0.8.3 rejects with a 400.
  - **Breaking:** processor `type` is a preserved string rather than the literal
    `"externalized"`, because cyoda-go round-trips it verbatim.
  - **Breaking (`@cyoda/workflow-core`):** `CyodaDialect.schemaVersionTag` is now
    a **required** field. Any host-registered dialect must declare which
    in-document `version` tag it stamps on new workflows (`"1.3"` for the shipped
    `"0.8"` dialect); there is no default. Add the field to your dialect object.
  - **Breaking (`@cyoda/workflow-graph`):** `TransitionSummary.execution` is
    replaced by `commitBeforeDispatch?: boolean`. The three-way execution badge
    hint conveyed nothing a renderer acted on; the one operationally significant
    mode — COMMIT_BEFORE_DISPATCH, where Cyoda commits the entity before calling
    the processor — is now a plain flag. `summarizeExecution` and the
    `ExecutionSummary` type are no longer exported. Renderers reading
    `summary.execution` must switch to `summary.commitBeforeDispatch`.
  - Fixes five round-trip defects that silently dropped, invented, or
    over-constrained processor config data.

### Patch Changes

- Updated dependencies [e0736d8]
  - @cyoda/workflow-core@0.6.0
  - @cyoda/workflow-graph@0.4.0
  - @cyoda/workflow-viewer@0.4.1
  - @cyoda/workflow-layout@0.1.5
  - @cyoda/workflow-monaco@0.2.3

## 0.5.0

### Minor Changes

- c67b91b: Add a layout-options menu to the canvas: pick auto-layout orientation and density.

  The Auto-arrange control now has a companion "Layout options" button that opens a
  small menu with **Orientation** (Vertical / Horizontal) and **Density**
  (Compact / Comfortable / Roomy). Changing either re-arranges the active workflow
  immediately, and the choice is persisted to `localStorage` per editor
  (`<localStorageKey>:pref`). Orientation was fully implemented in the layout
  engine but previously unreachable from the UI, which hardcoded vertical /
  readable. The host `layoutOptions` prop still drives orientation/density when it
  changes; the user's menu choice wins until then.

  - **`@cyoda/workflow-react`**: new `LayoutOptionsMenu` + persisted layout
    preference wired into the canvas.
  - **`@cyoda/workflow-layout`**: remove the unused ELK preset bundles
    (`presets/index.ts`) — dead code the tree-layout engine never consumed (it
    derives spacing directly), so the package no longer advertises layout modes it
    doesn't run.

- 0297f22: Expose the processor `context` and `startNewTxOnDispatch` config fields in the processor editor.

  Both already round-tripped on save but had no form control, so an imported
  processor's `context` (e.g. `"channel=email,customer"`) was preserved yet
  invisible. The processor modal now has:

  - **Context** — a text field for the pass-through string forwarded verbatim as
    the outgoing request's `parameters` node (empty ⇒ omitted).
  - **Start new transaction on dispatch** — a checkbox, enabled only for
    `COMMIT_BEFORE_DISPATCH` execution mode (and cleared when the mode changes
    away from it), matching the engine's validation.

- bfd2c5a: Support cyoda-go 0.8.2 processor & criterion annotations, and surface them in the transition tooltip.

  - **`@cyoda/workflow-core`**: add `annotations` to processors and `criterionAnnotations`
    (sibling to `criterion`) on workflows and transitions; the 0.8 dialect emits them
    (`omitempty`, so workflows that don't use them serialise byte-identically), extended
    in place — `LATEST_CYODA_VERSION` stays `"0.8"`. `setAnnotations` gains
    `workflowCriterion`/`transitionCriterion` targets; `annotations-too-large` covers the
    new placements.
  - **`@cyoda/workflow-viewer` / `@cyoda/workflow-react`**: the transition hover tooltip
    shows the well-known `displayName`/`description` annotation keys for the transition,
    its criterion, and each processor; the raw-JSON annotations editor is available for
    processor annotations (modal) and criterion annotations.

- 276bf9e: Collapse state coloring to three roles: INITIAL, TERMINAL, and STATE.

  The viewer previously derived two extra heuristic categories — `PROCESSING_STATE`
  (any outgoing transition carries a processor) and `MANUAL_REVIEW` (every inbound
  transition is manual) — and rendered them as distinct blue and purple nodes with
  "PROCESSING"/"MANUAL REVIEW" header labels. Those heuristics were semantically
  misleading in many workflow shapes, so they are removed. Every non-initial,
  non-terminal state now renders in a single blue, and ordinary intermediate states
  no longer show a category header row at all (the "STATE" label added nothing the
  node shape didn't already convey). INITIAL (green) and TERMINAL (red) are
  unchanged. Transition/edge coloring is untouched.

  - **`@cyoda/workflow-graph`**: **Breaking:** remove the `category` field from
    `StateNode` and the `computeCategory` export. Consumers that read
    `node.category` should drop it; the visual distinction it fed no longer exists.
  - **`@cyoda/workflow-viewer`**: **Breaking:** remove `manualReview` and
    `processing` from the `NodePalette` theme tokens; the `node.default` palette is
    now blue (was teal). `roleCategoryLabel` returns `""` for ordinary states, and
    the renderers omit the header row when the label is empty.
  - **`@cyoda/workflow-react`**: **Breaking:** remove the `help.stateProcessing`
    and `help.stateManualReview` i18n message keys; the Help legend no longer lists
    those two swatches.

  **Downstream:** audit `cyoda-dev-console` for any use of `StateNode.category`,
  the `manualReview`/`processing` `NodePalette` tokens, or the `stateProcessing`/
  `stateManualReview` i18n keys before adopting these versions — all now fail to
  typecheck. The Cyoda Launchpad `CyodaWorkflowDiagram` renderer needs a matching
  palette update (intermediate states changed from teal to blue) to stay visually
  identical.

- 532a305: Add workflow-level criterion editing and remove the redundant `setWorkflowCriterion` patch op.

  The workflow inspector (`WorkflowForm`) now lets you add, edit, and remove a
  workflow's `criterion` using the same Monaco JSON editor, live validation, and
  add/edit/remove affordances as transition criteria — dispatched through the
  existing host-based `setCriterion` op with a `{ kind: "workflow" }` host. A
  caption explains that the criterion decides whether the workflow applies to an
  entity of its model (disambiguating when several workflows target the same
  model), and the empty state shows workflow-appropriate copy instead of the
  transition "automated" warning.

  - **`@cyoda/workflow-core`**: **Breaking:** remove the unused
    `setWorkflowCriterion` member of `DomainPatch` (and its apply/invert cases).
    It had no producers; the general `setCriterion` op already supports a workflow
    host for both apply and undo/invert. Consumers constructing
    `setWorkflowCriterion` should switch to
    `{ op: "setCriterion", host: { kind: "workflow", workflow }, path: ["criterion"], criterion }`.
  - **`@cyoda/workflow-react`**: add the workflow criterion section to
    `WorkflowForm`; add `criterion.workflowCaption` / `criterion.workflowNone`
    i18n keys; the `setCriterion` undo label is now host-aware
    ("Set workflow criterion").

  **Downstream:** confirm `cyoda-dev-console` does not construct
  `setWorkflowCriterion` (nothing in this repo did).

### Patch Changes

- bfd2c5a: Processor editor: "Retry policy" is now a dropdown (Default (FIXED) / NONE / FIXED) instead of a free-text field.

  cyoda-go only accepts `NONE`, `FIXED`, or empty for a processor's `retryPolicy` (empty defaults to `FIXED`; anything else is rejected at import). The dropdown prevents entering an invalid value. The number of retries and the delay are server-configured, not part of the workflow JSON.

- 2575315: Don't pop the inspector open when re-anchoring a transition.

  Dragging a transition's endpoint (arrowhead) to a different anchor is a layout
  tweak, but it was selecting the transition and opening the inspector. Two
  causes, both fixed:

  - **Trailing click after reconnect (primary):** the guard that suppresses
    edge/node clicks during a reconnect was cleared in `onReconnectEnd`, which
    fires _before_ the browser's trailing `click` — so `onEdgeClick` ran with the
    guard already down and selected the transition. The guard is now cleared on
    the next macrotask (after the trailing click), and `onNodeClick` honours it
    too (a drop onto a node no longer selects the state).
  - **Selection stealing on a completed re-anchor:** a pure re-anchor transaction
    set `selectionAfter` to the transition, snapping the inspector off whatever
    you had selected. It now preserves the current selection; only moving the
    endpoint to a different target state selects the transition.

  Genuine clicks on a transition still select it.

- 459e2d9: The canvas "Workflow settings" button now toggles the workflow inspector.

  Clicking the settings button (bottom of the canvas control stack) while the
  workflow inspector is already open now closes it, instead of only ever opening
  it. When something else is selected — or nothing — it opens the workflow
  inspector as before.

- 041b6a1: Compact the transition inspector by laying short controls out in a two-column grid.

  Source/Target state, Type/Disabled, Source/Target anchor, and the scheduled
  Delay/Timeout fields now sit two-up instead of each on its own full-width row;
  Name, the criterion editor, the processor list, and annotations stay full width.
  The grid uses `auto-fit` so it collapses back to a single column on a narrow
  (docked) inspector. Purely presentational — no model or behaviour change.

- Updated dependencies [c67b91b]
- Updated dependencies [bfd2c5a]
- Updated dependencies [276bf9e]
- Updated dependencies [946e7ee]
- Updated dependencies [532a305]
  - @cyoda/workflow-layout@0.1.4
  - @cyoda/workflow-core@0.5.0
  - @cyoda/workflow-viewer@0.4.0
  - @cyoda/workflow-graph@0.3.0
  - @cyoda/workflow-monaco@0.2.2

## 0.4.1

### Patch Changes

- e318cc4: Dockable/floating Inspector and roomy inline JSON editing. The inspector can
  detach into a draggable, resizable window with classical controls — minimize
  (collapses to a bar in the bottom-right corner), dock/undock, and close — so
  the workflow canvas can stay fully visible. Annotations and transition criteria
  now edit inline via a shared word-wrapped, format-capable JSON pane
  (`JsonMonacoField`); the canvas-hiding criterion modal is retired. Placement
  (including the minimized state) persists via the existing `localStorageKey`
  (honoring its `null` opt-out). No `@cyoda/workflow-core` change and the
  published `@cyoda/workflow-react` API (exports and `WorkflowEditor` props) is
  unchanged — backward-compatible, so a patch.

## 0.4.0

### Minor Changes

- 0b2694c: Edit `annotations` in place in the inspector.

  Adds a `setAnnotations` patch op to `@cyoda/workflow-core` (targeted, exact
  inverse) and an inline `AnnotationsField` to `@cyoda/workflow-react` — a
  scoped JSON editor (Monaco or textarea) with Apply/Revert/Remove — wired into
  the state, transition, and workflow inspector forms, plus a control-cluster
  button that surfaces the workflow form. Editing is an ordinary undoable edit
  committed via the standard Save flow; no annotation-specific persistence.

### Patch Changes

- Updated dependencies [0b2694c]
- Updated dependencies [0b2694c]
  - @cyoda/workflow-core@0.4.0
  - @cyoda/workflow-graph@0.2.2
  - @cyoda/workflow-layout@0.1.3
  - @cyoda/workflow-monaco@0.2.1
  - @cyoda/workflow-viewer@0.3.1

## 0.3.0

### Minor Changes

- 944e62a: Replace the structured criterion "assembly" editor with a JSON editor.

  The "Edit criterion" popup no longer offers the per-type structured builder
  (simple/group/function/lifecycle/array forms, plain-English preview, field-path
  combobox). It now edits the criterion as JSON — Monaco when a runtime is
  configured (syntax highlighting + live schema validation), with a plain
  `<textarea>` fallback otherwise. Apply is gated on the canonical `CriterionSchema`
  plus the builder's prior strictness rules (gjson JSONPath subset, `BETWEEN`
  arity, required scalar values, recursion into groups and function prechecks), so
  no valid criterion the old builder accepted is now rejected. The collapsed
  summary card shows the criterion type badge plus a compact read-only JSON
  snippet. The committed criterion shape and the `setCriterion` patch are unchanged.

  - **`@cyoda/workflow-core`**: add `criterionBlockingError` (the relocated,
    reusable strictness gate). **Breaking:** remove the now-unused
    `EntityFieldHintProvider` and `FieldHint` exports (the field-path autocomplete
    they fed is gone).
  - **`@cyoda/workflow-monaco`**: add `registerCriterionSchema`,
    `criterionJsonSchema`, and `CRITERION_SCHEMA_URI`; relocate the Monaco runtime
    types (`WorkflowJsonMonacoRuntime`, …) into the package so a second editor can
    reuse them.
  - **`@cyoda/workflow-react`**: add `CriterionJsonEditor` and forward the Monaco
    runtime to the inspector via context. **Breaking:** remove the `hintProvider`
    prop from `WorkflowEditor`/`Inspector` and the re-exported
    `EntityFieldHintProvider`/`FieldHint` types. Consumers (e.g. `cyoda-dev-console`)
    must drop `hintProvider`.

  Also fixes (workflow-react): a React Flow idle re-render loop under React 19 that
  pinned the main thread on larger graphs (the `updateNodeInternals` effect now
  keys on the layout-derived node memo, not live node state), and the suppression
  of Monaco's benign "Canceled" disposal rejections (now a precise, permanently
  installed filter rather than a racy timing window; note Firefox still surfaces
  them via its own devtools rejection tracking).

  (Pre-1.0 `minor` per the 0.x convention — the breaking removals above are shipped
  as a 0.x minor; the project is intentionally staying in 0.x.)

- 944e62a: Dependency baseline: React 19, zod 4, and Monaco 0.55 support.

  The toolchain and runtime dependencies were brought to a current, pinned
  baseline. The consumer-facing changes are:

  - **React 19 support.** `react`/`react-dom` peer ranges widened to
    `^18.3.1 || ^19.0.0` in `@cyoda/workflow-react`, `@cyoda/workflow-viewer`, and
    `@cyoda/workflow-monaco` — React 18 consumers are unaffected; React 19 is now
    supported.
  - **zod 4.** `@cyoda/workflow-core` and `@cyoda/workflow-monaco` now build on
    zod 4. Consumers that import the exported zod schemas (e.g. `CriterionSchema`,
    `ImportPayloadSchema`) must be on zod 4. JSON-schema generation switched to
    zod 4's native `z.toJSONSchema`.
  - **Monaco 0.55.** `@cyoda/workflow-monaco`'s `monaco-editor` peer is now
    `>=0.45 <0.56`.

  Internal build/test tooling (Vite 8, Vitest 4, ESLint 10, TypeScript 6, etc.)
  was also updated; those are dev-only and do not affect the published packages'
  runtime.

  (Pre-1.0 `minor` per the 0.x convention — the project is intentionally staying
  in 0.x.)

- 13a0757: Remove scheduled processor UI; add transition schedule inspector. (Pre-1.0
  `minor` per the 0.x convention — removes UI tied to the dropped `scheduled`
  processor type; the project is intentionally staying in 0.x.)

  The `scheduled` processor type was removed from `@cyoda/workflow-core` v0.8.
  This release removes all corresponding UI: the type selector, duration fields,
  transition picker, and validation logic from the processor modal. The only
  supported processor type is now `externalized`.

  A new "Scheduled transition" section has been added to the transition inspector.
  It provides an enable/disable toggle plus `delayMs` (required) and `timeoutMs`
  (optional) fields wired through the existing `updateTransition` patch so edits
  land on the undo stack. A persistent notice informs users that scheduled
  transitions are a schema/SPI placeholder and are not yet executed by the
  workflow engine (firing one returns 400 BAD_REQUEST).

### Patch Changes

- Updated dependencies [944e62a]
- Updated dependencies [944e62a]
- Updated dependencies [58f2e77]
  - @cyoda/workflow-core@0.3.0
  - @cyoda/workflow-monaco@0.2.0
  - @cyoda/workflow-viewer@0.3.0
  - @cyoda/workflow-graph@0.2.1
  - @cyoda/workflow-layout@0.1.2

## 0.2.0

### Minor Changes

- 5893bf7: Add first-pass product surface/layout APIs, workflow viewer hover inspection helpers, and editor toolbar slots for host-owned controls.
- 2264abe: Criterion editor: new "+ Add AND condition" action wraps an existing non-group criterion (simple / function / lifecycle / array) in an `AND` group with a default trailing simple condition. Lets users compose multi-condition criteria from the structured form without falling back to raw JSON. The action is hidden when the current criterion is already a group (existing group behaviour unchanged) and is restricted to the outer criterion form. Original criterion is deep-cloned before being inserted into the group's conditions.
- 2c461b0: Release-polish pass on the workflow editor:
  - Add a `developerMode` prop on `WorkflowEditor` (default `false`). When false the inspector hides its raw JSON tab and the editor reads as a business-user surface. Hosts that previously relied on the JSON tab should opt in with `developerMode`.
  - Make validation badges interactive. The error/warning/info pills in the toolbar are now buttons that open an issues drawer grouped by severity, with a "Jump to" action that selects the related state, transition, or processor on the canvas.
  - Increase canvas fit padding so state names are not clipped at the viewport edges; transition labels expose their full name via a `title` tooltip when truncated.
  - Hide the minimap automatically when the inspector is open to prevent overlap.
  - Add small inline icons to state nodes per role/category so state type can be understood without relying on colour alone; the node container now exposes an `aria-label` describing the category and state code.
  - Rename toolbar labels to BA/SME-friendly copy: "Auto Layout" → "Auto-arrange", "Reset Layout" → "Reset positions", "+ State" / "+ Note" routed through i18n.
  - Replace developer-leak strings: deprecated NOT criterion now shows a friendly banner explaining the deprecation; transitions expose helper text "Order controls how Cyoda evaluates outgoing transitions."
  - Programmatic label associations added/audited for the AddState modal.

- a037ea0: Full workflow editor MVP

  **workflow-core** (`minor` — additive public API)
  - New patch ops: `moveTransitionSource`, `setNodePosition`, `removeNodePosition`, `resetLayout`, `addComment`, `updateComment`, `removeComment`.
  - `PatchTransaction` type and `applyTransaction` / `invertTransaction` helpers for multi-patch atomic undo.
  - `PatchConflictError` thrown by `renameState` and `moveTransitionSource` on name collision.
  - `CommentMeta` interface added to `WorkflowUiMeta`; `comments` field on `WorkflowUiMeta`.
  - Exact inverses for `renameState`, `removeTransition`, `reorderTransition`, `removeProcessor`, `reorderProcessor`, `moveTransitionSource`, and all UI-only metadata ops.
  - `cleanupWorkflowUi` runs after `replaceSession` to remove stale layout entries and detach stale comment references.
  - All UI-only patches excluded from `serializeImportPayload` output — exported Cyoda workflow JSON remains deterministic and clean.

  **workflow-react** (`minor` — substantial new capabilities)
  - **State editing**: Add State toolbar button and `A` shortcut; collision-free default names; `AddStateModal` with validation; improved `StateForm` (rename collision guard, Initial/Terminal/Unreachable badges, incoming count, Set Initial State button, inline issues).
  - **Transition editing**: drag-connect suggests default name; rename collision guard; target state dropdown; move source state dropdown (`moveTransitionSource`); criterion summary; inline issues.
  - **Criteria editor**: `CriterionSection` and `CriterionForm` with structured editors for all five criterion types (`simple`, `group`, `function`, `lifecycle`, `array`); recursive group condition editing; raw JSON escape hatch; draft editing.
  - **Processor editor**: full field coverage for `externalized` and `scheduled` processors; type switcher; all config fields.
  - **Manual layout**: `onNodeDragStop` persists positions via `setNodePosition`; pinned positions merged into ELK layout; localStorage persistence for full editor metadata (`layout`, `comments`, `edgeAnchors`, `viewports`); Reset Layout / Auto Layout toolbar buttons; `L` / `Shift+L` keyboard shortcuts; `layoutMetadata` / `onLayoutMetadataChange` / `localStorageKey` props.
  - **Canvas comments**: `+ Note` toolbar button; sticky-note `CommentNode`; double-click edit; drag to reposition; delete; localStorage persistence.
  - **Undo/redo**: `dispatchTransaction` for atomic multi-patch undo; exact `removeTransition` inverse after drag-connect; `UndoEntry` upgraded to `patches[]` / `inverses[]` arrays.
  - **Store**: `dispatchTransaction` action on `EditorActions`; exact `addTransition` / `addProcessor` inverses by UUID diff.
  - **JSON editor**: Monaco instance lifecycle is stable across graph and JSON patches; invalid JSON remains isolated from the canonical document while graph-to-JSON and JSON-to-graph sync stay live.

  **workflow-graph** (`patch` — no API change; `moveState` clarification in docs)

  **workflow-layout** (`patch` — no API change)

  **workflow-viewer** (`patch` — prefer-const fix in `layout.ts`)

  **workflow-monaco** (`patch` — no API change; documented supported Monaco peer range `>=0.45 <0.53`)

### Patch Changes

- 2c461b0: Hide the workflow editor inspector when there is no editable selection, move the canvas hint away from React Flow controls, and polish criterion group editing so newly added conditions/groups open immediately, support local Done editing, show AND/OR connectors, and use guided date inputs for date-like criteria.
- Updated dependencies [5893bf7]
- Updated dependencies [a037ea0]
  - @cyoda/workflow-graph@0.2.0
  - @cyoda/workflow-viewer@0.2.0
  - @cyoda/workflow-core@0.2.0
  - @cyoda/workflow-layout@0.1.1
  - @cyoda/workflow-monaco@0.1.1

## 0.1.0

### Minor Changes

- f4e1286: First public release of the Cyoda Workflow Editor package set.

### Patch Changes

- Updated dependencies [f4e1286]
  - @cyoda/workflow-core@0.1.0
  - @cyoda/workflow-graph@0.1.0
  - @cyoda/workflow-layout@0.1.0
  - @cyoda/workflow-viewer@0.1.0
