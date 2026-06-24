# Replace the criterion assembly UI with a JSON editor

**Date:** 2026-06-24
**Status:** Design — pending review
**Packages affected:** `@cyoda/workflow-react`, `@cyoda/workflow-monaco`, `@cyoda/workflow-core` (export only)

## Summary

Today, editing a transition/processor criterion happens through a large structured
"assembly" UI: `CriterionForm.tsx` (~2262 lines) renders a builder (`CriterionBuilder`,
`RuleEditorPanel`, `RuleGroupBlock`, per-type field forms, a plain-English preview, and a
`jsonPath` autocomplete combobox), with a plain `<textarea>` as a secondary "Edit JSON"
mode.

We are **ripping out the assembly/builder** and making **JSON the only way to edit a
criterion**. The "Edit criterion" popup becomes a good JSON editor — Monaco (the editor
already used for the whole-workflow JSON view) when a runtime is available, with a plain
`<textarea>` fallback otherwise — featuring syntax highlighting, live schema validation,
and a hard schema check that a criterion is compliant before it can be applied.

The existing entity field-path autocomplete (the old `hintProvider`) is **preserved**, but
re-expressed as a Monaco completion provider instead of a bespoke combobox.

## Goals

- The "Edit criterion" popup edits the criterion as JSON only — no structured builder.
- Syntax highlighting on the JSON.
- Live, in-editor schema validation against the `Criterion` schema (Monaco squiggles).
- A hard schema check on Apply: invalid JSON or schema-noncompliant criteria cannot be
  committed; the error is shown.
- The collapsed summary card shows the criterion **type badge + a compact read-only JSON
  snippet**.
- Entity field-path autocomplete is preserved (Monaco completion provider).
- Public API stays **non-breaking**: the `hintProvider` prop and
  `EntityFieldHintProvider` / `FieldHint` exports remain meaningful.

## Non-goals

- No change to the `Criterion` data model, the `setCriterion` patch, or any downstream
  consumer of criteria.
- No change to the whole-workflow `WorkflowJsonEditor` (it stays as-is; we do not try to
  generalize it).
- No change to how processors/transitions are otherwise edited.

## Decisions (from brainstorming)

1. **Scope:** Remove the assembly/builder entirely. The popup is JSON-only with syntax
   highlighting and a schema-compliance check.
2. **Summary card:** Criterion **type badge + compact read-only JSON snippet**.
3. **Field-path hinting:** **Preserve** the old `hintProvider` capability, re-wired as a
   Monaco completion provider scoped to criterion models. Keeps the public API
   non-breaking (no dev-console coordination required).
4. **Editor path:** **Monaco when a runtime is available, plain `<textarea>` fallback
   otherwise.** Hints only exist in the Monaco path. Both paths enforce the schema check
   on Apply.

## Current state (reference)

- `packages/workflow-react/src/inspector/CriterionForm.tsx` — exports `CriterionSection`,
  the only public entry point. Internally contains `CriterionSummaryCard`,
  `CriterionEditorModal`, `CriterionEditorBody`, `CriterionBuilder`, `RuleEditorPanel`,
  `RuleGroupBlock`, the Simple/Function/Lifecycle/Array field forms, `AddConditionMenu`,
  `PlainEnglishPreview`, `defaultCriterion`, and the form/JSON toggle + textarea.
- `packages/workflow-react/src/inspector/criteria/` — `JsonPathInput.tsx`,
  `FieldHintsContext.tsx`, `fieldLabels.ts`. `JsonPathInput` is consumed only by the
  builder. `FieldHintsContext` (`FieldHintsProvider`) is consumed only by `JsonPathInput`.
- `CriterionSection` is mounted only by
  `packages/workflow-react/src/inspector/TransitionForm.tsx`.
- `hintProvider?: EntityFieldHintProvider` is a public prop on `WorkflowEditor`
  (`components/WorkflowEditor.tsx`) and `Inspector` (`inspector/Inspector.tsx`), which
  wraps the inspector subtree in `<FieldHintsProvider>`.
- `EntityFieldHintProvider` and `FieldHint` are public types exported from `workflow-core`
  and re-exported from `workflow-react`.
- `CriterionSchema` is exported from `workflow-core` (`src/index.ts`), a recursive lazy
  union of the five criterion variants.
- `packages/workflow-monaco/src/schema.ts` — `registerWorkflowSchema(monaco, opts)`,
  `workflowJsonSchema()` via `z.toJSONSchema(ImportPayloadSchema, { target: "draft-7" })`,
  `WORKFLOW_SCHEMA_URI`. Schema↔model matching is by `fileMatch` URI prefix
  (default `cyoda://workflow/`). Registration is idempotent (replace-by-`schemaUri`).
- Monaco is an optional peer dependency, provided at runtime as a
  `WorkflowJsonMonacoRuntime` object passed to `WorkflowEditor` via
  `jsonEditor={{ monaco, ... }}`. When absent, no Monaco exists in the tree.

## Architecture

### 1. `workflow-monaco`: criterion schema registration

Add a module mirroring `schema.ts`:

- `CRITERION_SCHEMA_URI` (e.g. `cyoda://criterion/schema.json`).
- `criterionJsonSchema(): object` → `z.toJSONSchema(CriterionSchema, { target: "draft-7" })`.
- `registerCriterionSchema(monaco, opts?: { fileMatchPrefix?: string; schemaUri?: string }): JsonSchemaHandle`
  — same idempotent merge pattern as `registerWorkflowSchema`, default
  `fileMatchPrefix = "cyoda://criterion/"`. Coexists with the workflow schema (different
  URI + fileMatch), so both can be registered on the same Monaco instance.

Export the new symbols from `packages/workflow-monaco/src/index.ts`.

**Risk to verify with a test:** `CriterionSchema` is a recursive `z.lazy` union
(`group.conditions` is `Criterion[]`). `z.toJSONSchema` must emit valid `$defs`/`$ref`
recursion. A unit test asserts the schema generates and validates a nested `group`
criterion.

### 2. `workflow-react`: `CriterionJsonEditor` (new component)

A small, self-contained editor — **not** a reuse of `WorkflowJsonEditor` (which is too
coupled to `WorkflowEditorDocument`/`Selection`).

- Props (shape, names finalized in the plan):
  `value: Criterion | undefined`, `onApply(next: Criterion): void`, `onCancel(): void`,
  `disabled: boolean`, and the Monaco runtime (resolved from context, see §3).
- **Monaco path:** create an isolated text model on a unique URI under
  `cyoda://criterion/` (e.g. `cyoda://criterion/<host-key>.json`) so the criterion schema's
  `fileMatch` applies; create the editor; register the schema (once per runtime);
  dispose model/editor on unmount. Seed with `JSON.stringify(value ?? defaultEmpty, null, 2)`.
- **Textarea fallback:** when no runtime is available, render the current plain
  `<textarea>` (monospace), no hints.
- **Apply (both paths):** `JSON.parse` → `CriterionSchema.safeParse`. On failure, surface
  the error inline and block apply. On success, call `onApply(parsed)`; the modal then
  dispatches the existing `{ op: "setCriterion", host, path: ["criterion"], criterion }`
  patch — unchanged downstream.

### 3. Monaco runtime plumbing (context)

`WorkflowEditor` already receives `jsonEditor.monaco`. Expose that runtime to the inspector
subtree through a new lightweight React context (e.g. `CriterionMonacoContext`), provided by
`WorkflowEditor` (value = the configured runtime or `null`). `CriterionJsonEditor` reads it;
`null` → textarea fallback. This avoids prop-drilling through `Inspector` → `TransitionForm`
→ `CriterionSection`.

### 4. Field-path autocomplete → Monaco completion provider

Re-express the old `hintProvider` data (`EntityFieldHintProvider` → `FieldHint[]` for the
session entity) as a Monaco completion item provider registered for the JSON language and
scoped to criterion models. It activates when the cursor is inside a `jsonPath` string
value and offers the same entity field paths the combobox used to. The `hintProvider` prop
and `EntityFieldHintProvider`/`FieldHint` exports therefore **remain meaningful and
unchanged** — `Inspector` continues to receive `hintProvider` and makes it available
(via context) to the editor instead of to `FieldHintsProvider`/`JsonPathInput`. Available
in the Monaco path only.

### 5. Summary card rework

`CriterionSummaryCard` shows the criterion **type badge** + a **compact read-only JSON
snippet** (single-line or truncated pretty JSON) when a criterion is set, plus the
unchanged Add/Edit/Remove actions. "Add" seeds an empty/default criterion and opens the
editor.

### 6. Deletions

Remove the assembly code:

- From `CriterionForm.tsx`: `CriterionBuilder`, `RuleEditorPanel`, `RuleGroupBlock`,
  the Simple/Function/Lifecycle/Array field forms, `AddConditionMenu`,
  `PlainEnglishPreview`, the form/JSON toggle, and form-only helpers
  (e.g. `defaultCriterion` per-type construction).
- Delete `inspector/criteria/JsonPathInput.tsx`, `inspector/criteria/FieldHintsContext.tsx`,
  and `inspector/criteria/fieldLabels.ts` (all builder-only once hints move to Monaco).
- Keep: `CriterionSection` (same export + props — `TransitionForm` is untouched),
  the reworked `CriterionSummaryCard`, and the modal shell, now hosting
  `CriterionJsonEditor`.

After deletion the criterion code is small enough to split into focused files
(`CriterionSection.tsx`, `CriterionSummaryCard.tsx`, `CriterionJsonEditor.tsx`), preserving
`CriterionSection` as the public entry point.

## Data flow

```
TransitionForm
  └─ CriterionSection (unchanged props: host, criterion, disabled, onDispatch, …)
       ├─ CriterionSummaryCard  → type badge + compact JSON + Add/Edit/Remove
       └─ Modal (on Edit)
            └─ CriterionJsonEditor
                 ├─ runtime from CriterionMonacoContext?
                 │     ├─ yes → Monaco model on cyoda://criterion/… 
                 │     │          + registerCriterionSchema + field-path completion
                 │     └─ no  → <textarea> fallback (no hints)
                 └─ Apply: JSON.parse → CriterionSchema.safeParse
                              ├─ invalid → inline error, block
                              └─ valid   → onApply → onDispatch({ op:"setCriterion", … })
```

## Error handling

- **Invalid JSON:** caught at `JSON.parse`; inline error; Apply blocked.
- **Schema-noncompliant:** caught by `CriterionSchema.safeParse`; show the Zod issue(s);
  Apply blocked.
- **Live feedback (Monaco only):** JSON-schema squiggles from `registerCriterionSchema`.
- **No runtime:** textarea fallback still enforces the parse + safeParse check on Apply.

## Testing

- **workflow-monaco:** `registerCriterionSchema` registers under its own URI/fileMatch and
  coexists with the workflow schema; `criterionJsonSchema()` generates and validates a
  nested `group` criterion (recursive `$ref`).
- **workflow-react (replace builder tests):**
  - Valid edit → `setCriterion` patch dispatched with parsed criterion.
  - Invalid JSON → inline error, no patch.
  - Schema-invalid JSON → inline error, no patch.
  - Summary card renders type badge + compact JSON for a set criterion; renders Add when
    none.
  - Textarea fallback renders and applies when no Monaco runtime in context.
  - (Monaco path) completion provider offers entity field paths inside a `jsonPath` value —
    to the extent the Monaco test harness supports it; otherwise unit-test the completion
    item source function directly.
- Remove obsolete builder-interaction tests for the deleted components.

## Open items / to verify during implementation

- Confirm the Monaco test harness used in
  `packages/workflow-react/tests/jsonEditorIntegration.test.tsx` can host an isolated
  criterion model, or whether the completion logic is best unit-tested as a pure function.
- Confirm `CriterionSection`'s existing props are sufficient unchanged (host/criterion/
  disabled/onDispatch); `TransitionForm` should need no changes beyond what context plumbing
  requires at the `WorkflowEditor` level.
- Decide the exact compact-JSON rendering for the summary card (single-line vs. truncated
  multi-line).
```
