---
"@cyoda/workflow-core": minor
"@cyoda/workflow-react": minor
"@cyoda/workflow-graph": patch
"@cyoda/workflow-layout": patch
"@cyoda/workflow-viewer": patch
"@cyoda/workflow-monaco": patch
---

Full workflow editor MVP

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
