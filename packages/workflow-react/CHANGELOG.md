# @cyoda/workflow-react

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
