# @cyoda/workflow-monaco

## 0.2.0

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

### Patch Changes

- Updated dependencies [944e62a]
- Updated dependencies [944e62a]
- Updated dependencies [58f2e77]
  - @cyoda/workflow-core@0.3.0

## 0.1.1

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
