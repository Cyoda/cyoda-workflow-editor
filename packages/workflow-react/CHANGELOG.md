# @cyoda/workflow-react

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
