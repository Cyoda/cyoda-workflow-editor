# @cyoda/workflow-core

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

## 0.5.0

### Minor Changes

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

- 946e7ee: Triage the workflow validation ruleset: drop noisy heuristics, demote soft ones, make more issues clickable, and document the catalog.

  - **Removed** four rules that flag valid designs or judgements the editor can't
    make: `all-transitions-manual` (a manual-only state is normal),
    `sync-on-likely-bottleneck-transition` (SYNC is fine in the STP path; slowness
    isn't detectable here), `matches-pattern-unanchored`, and `like-wildcard-warning`.
  - **Collapsed** the per-victim `unreachable-automated-transition` into
    `null-criterion-not-last`: one warning on the always-fires transition now names
    the transitions it shadows (in `detail.unreachable`), instead of a separate
    warning per dead transition.
  - **Demoted to `info`** five opinionated heuristics: `excessive-fan-out`,
    `processor-overload`, `disabled-transition-on-active-workflow`,
    `lifecycle-path-in-simple`, `function-without-quick-exit`.
  - **Added jump targets** so the issues drawer's "Jump to" works for the
    node-scoped survivors: `unreachable-state`, `excessive-fan-out`,
    `unknown-transition-target`, `duplicate-transition-name`,
    `duplicate-processor-name`, `processor-overload`,
    `disabled-transition-on-active-workflow`, and
    `start-new-tx-without-commit-before-dispatch`.
  - **Documented** every code in `docs/validation-rules.md`, kept honest by a
    drift-guard test that fails if a rule is added or removed without updating the
    catalog.

  Criterion-scoped clickability (e.g. `unsupported-operator`) is left for a
  follow-up — it needs a criterion→host targeting path the current drawer doesn't
  resolve.

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

## 0.4.0

### Minor Changes

- 0b2694c: Edit `annotations` in place in the inspector.

  Adds a `setAnnotations` patch op to `@cyoda/workflow-core` (targeted, exact
  inverse) and an inline `AnnotationsField` to `@cyoda/workflow-react` — a
  scoped JSON editor (Monaco or textarea) with Apply/Revert/Remove — wired into
  the state, transition, and workflow inspector forms, plus a control-cluster
  button that surfaces the workflow form. Editing is an ordinary undoable edit
  committed via the standard Save flow; no annotation-specific persistence.

- 0b2694c: Preserve and edit cyoda-go 0.8.1 `annotations` (engine-opaque, client-owned JSON
  metadata) at the workflow, state, and transition levels.

  Annotations are now modelled on the canonical `Workflow`/`State`/`Transition`
  (`AnnotationsSchema`, object-only, 64 KB cap), round-tripped through the `"0.8"`
  dialect (parse and serialize), and editable via the Monaco JSON editor
  (autocomplete/validation come from the `ImportPayloadSchema`-derived schema).
  Over-cap annotations are blocked pre-save with a locatable `annotations-too-large`
  error. The `"0.7"` dialect continues to omit the field. Pre-1.0 minor per the 0.x
  convention.

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

- 58f2e77: cyoda-go v0.8.0 support. (Pre-1.0 `minor` per the 0.x convention — contains
  the breaking change noted below; the project is intentionally staying in 0.x.)

  - **Removed `ScheduledProcessorSchema`** (and the `ScheduledProcessor` type). The
    `scheduled` processor type — an unsupported v0.7 platform hack — is gone from
    the canonical model; `ProcessorSchema` is now `externalized`-only, matching the
    v0.8.0 wire format. The 0.7 dialect drops any `{type:"scheduled"}` processor on
    import and reports it via `ParseResult.warnings`.
  - **Added `TransitionScheduleSchema`** as optional `transitions[].schedule`
    (`{ delayMs, timeoutMs? }`). A schema/SPI placeholder — configurable and
    importable, but not yet executed by the workflow engine.
  - **New `cyoda-0_8` dialect** (`"0.8"`), registered alongside `"0.7"`.
    `LATEST_CYODA_VERSION` is now `"0.8"`. Its `workflowsToWire` emits
    `transitions[].schedule` and enforces a strict field allowlist so output is
    clean against v0.8.0's `DisallowUnknownFields` import rejection.
  - **Added `ParseResult.warnings`** (optional `string[]`) carrying the dialect's
    `toCanonical` notes. Additive — existing call sites are unaffected.
  - **Name length cap (256 chars)** enforced in `NameSchema` and mirrored as a
    `name-too-long` semantic error.

  BREAKING CHANGE: `ScheduledProcessorSchema` and the `ScheduledProcessor` type are
  no longer exported; consumers must update. `LATEST_CYODA_VERSION` changed from
  `"0.7"` to `"0.8"`.

## 0.2.0

### Minor Changes

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

## 0.1.0

### Minor Changes

- f4e1286: First public release of the Cyoda Workflow Editor package set.
