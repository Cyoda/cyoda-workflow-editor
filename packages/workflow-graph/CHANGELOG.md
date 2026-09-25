# @cyoda/workflow-graph

## 0.4.0

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

## 0.3.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [bfd2c5a]
- Updated dependencies [946e7ee]
- Updated dependencies [532a305]
  - @cyoda/workflow-core@0.5.0

## 0.2.2

### Patch Changes

- Updated dependencies [0b2694c]
- Updated dependencies [0b2694c]
  - @cyoda/workflow-core@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies [944e62a]
- Updated dependencies [944e62a]
- Updated dependencies [58f2e77]
  - @cyoda/workflow-core@0.3.0

## 0.2.0

### Minor Changes

- 5893bf7: Add first-pass product surface/layout APIs, workflow viewer hover inspection helpers, and editor toolbar slots for host-owned controls.

### Patch Changes

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

- Updated dependencies [a037ea0]
  - @cyoda/workflow-core@0.2.0

## 0.1.0

### Minor Changes

- f4e1286: First public release of the Cyoda Workflow Editor package set.

### Patch Changes

- Updated dependencies [f4e1286]
  - @cyoda/workflow-core@0.1.0
