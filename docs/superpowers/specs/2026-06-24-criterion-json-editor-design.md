# Replace the criterion assembly UI with a JSON editor

**Date:** 2026-06-24
**Status:** Design — pending review (revised after independent review)
**Packages affected:** `@cyoda/workflow-react`, `@cyoda/workflow-monaco`, `@cyoda/workflow-core`
**Breaking:** Yes — the public Monaco runtime interface is widened (see "Breaking change & coordination"). Requires a coordinated `cyoda-dev-console` update.

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
and a hard validation gate on Apply.

The existing entity field-path autocomplete (the old `hintProvider`) is **preserved**, but
re-expressed as a Monaco completion provider. **This requires widening the public Monaco
runtime interface** (it currently exposes only `json.jsonDefaults`, with no completion-
provider surface), which is a breaking change coordinated with `cyoda-dev-console`.

## Goals

- The "Edit criterion" popup edits the criterion as JSON only — no structured builder.
- Syntax highlighting on the JSON.
- Live, in-editor schema validation against the `Criterion` schema (Monaco squiggles),
  accepting the UX caveat below.
- A **hard validation gate on Apply** that matches the old builder's strictness — not just
  `CriterionSchema.safeParse`, but also the structural rules the schema does not encode
  (see §2.1). Invalid criteria cannot be committed; the error is shown.
- The collapsed summary card shows the criterion **type badge + a compact read-only JSON
  snippet**.
- Entity field-path autocomplete is preserved as a Monaco completion provider (Monaco path
  only).
- Read-only / `disabled` mode is explicitly handled.

## Non-goals

- No change to the `Criterion` data model, the `setCriterion` patch, or any downstream
  consumer of criteria.
- No change to the whole-workflow `WorkflowJsonEditor` (it stays as-is; we do not try to
  generalize it).
- No change to how processors/transitions are otherwise edited. (Processor prechecks remain
  edited as the nested `function.criterion` inside the transition criterion JSON, dispatched
  as one whole-criterion `setCriterion` at `path:["criterion"]` — the JSON editor simplifies
  this nesting.)

## Decisions (from brainstorming + review)

1. **Scope:** Remove the assembly/builder entirely. The popup is JSON-only with syntax
   highlighting and a validation gate.
2. **Summary card:** Criterion **type badge + compact read-only JSON snippet**.
3. **Field-path hinting:** **Preserve** it, re-wired as a Monaco completion provider scoped
   to criterion models. This is now understood to be a **breaking** change (the public
   runtime interface must gain completion-provider surface) and is done **now**, coordinated
   with `cyoda-dev-console`. (Corrects an earlier, incorrect "non-breaking" assumption.)
4. **Editor path:** **Monaco when a runtime is available, plain `<textarea>` fallback
   otherwise.** Hints exist only in the Monaco path. Both paths enforce the validation gate
   on Apply.
5. **Validation strictness:** **Port the builder's extra checks** (jsonPath-subset validity,
   `BETWEEN`/`BETWEEN_INCLUSIVE` arity, non-empty scalar values) into the Apply gate — no
   validation regression versus the builder.

## Current state (reference)

- `packages/workflow-react/src/inspector/CriterionForm.tsx` — exports `CriterionSection`
  (line 94), the only public entry point; mounted only by `TransitionForm.tsx:323`.
  Internally: `CriterionSummaryCard`, `CriterionEditorModal`, `CriterionEditorBody`,
  `CriterionBuilder`, `RuleEditorPanel`, `RuleGroupBlock`, the Simple/Function/Lifecycle/
  Array field forms, `AddConditionMenu`, `PlainEnglishPreview`, `defaultCriterion`, the
  form/JSON toggle + textarea. The whole-criterion patch is dispatched at
  `CriterionForm.tsx:294` as `setCriterion` on `path:["criterion"]`.
- Builder-only validation the schema does NOT encode (`CriterionForm.tsx:1760-1812`):
  `validateJsonPathSubset(jsonPath)`; `BETWEEN`/`BETWEEN_INCLUSIVE` requiring a 2-element
  value array; scalar operators requiring a non-empty value. Hints also drive value-editor
  kind via `getValueKind(jsonPath, hints)` (`CriterionForm.tsx:719`) — this value-kind
  inference is intentionally dropped with the builder.
- `packages/workflow-react/src/inspector/criteria/` — `JsonPathInput.tsx` (consumed only by
  the builder, lines 31/666), `FieldHintsContext.tsx` (`FieldHintsProvider`/`useFieldHints`,
  consumed only by `JsonPathInput` and two builder field-forms), `fieldLabels.ts`.
- `hintProvider?: EntityFieldHintProvider` is a public prop on `WorkflowEditor`
  (`WorkflowEditor.tsx:1089`) and `Inspector` (`Inspector.tsx:79`, wrapping the subtree in
  `<FieldHintsProvider>`). `EntityFieldHintProvider`/`FieldHint` are public types from
  `workflow-core`, re-exported by `workflow-react`.
- `CriterionSchema` is exported from `workflow-core` (`src/index.ts:65`), a recursive lazy
  union of the five variants. `z.toJSONSchema(CriterionSchema, { target: "draft-7" })`
  **works** (verified): top-level `anyOf`, recursive `$ref:"#"` for `group.conditions`,
  `allOf:[{$ref:"#"}]` for the optional `function.criterion`.
- `packages/workflow-monaco/src/schema.ts` — `registerWorkflowSchema(monaco, opts)`,
  `workflowJsonSchema()`, `WORKFLOW_SCHEMA_URI`. Schema↔model matching by `fileMatch` URI
  prefix (default `cyoda://workflow/`, asserted in `schema.test.ts`). Registration is
  idempotent (replace-by-`schemaUri`).
- **Runtime interface today:** `MonacoLike` (`packages/workflow-monaco/src/types.ts:61`)
  exposes `languages.json.jsonDefaults` **only** — no `registerCompletionItemProvider`, no
  completion/position/range constructors. `WorkflowJsonMonacoRuntime`
  (`WorkflowJsonEditor.tsx:55`) extends it with `Uri.parse` + `editor.createModel/create`.
  `workflow-monaco` registers zero completion providers anywhere.
- Monaco is an optional peer dependency, provided as a runtime object via
  `jsonEditor={{ monaco, … }}` on `WorkflowEditor`. `enableJsonEditor` defaults to `false`
  and is independent of whether a runtime is supplied (see §3 matrix).

## Architecture

### 1. `workflow-monaco`: criterion schema registration

Add a module mirroring `schema.ts`:

- `CRITERION_SCHEMA_URI` (e.g. `cyoda://criterion/schema.json`).
- `criterionJsonSchema(): object` → `z.toJSONSchema(CriterionSchema, { target: "draft-7" })`.
- `registerCriterionSchema(monaco, opts?: { fileMatchPrefix?: string; schemaUri?: string }): JsonSchemaHandle`
  — same idempotent merge as `registerWorkflowSchema`, default
  `fileMatchPrefix = "cyoda://criterion/"`, `fileMatch:["cyoda://criterion/*"]`. Distinct
  URI + prefix from the workflow schema so the two never cross-match and both can be
  registered on one Monaco instance.

Export the new symbols from `packages/workflow-monaco/src/index.ts`.

**Squiggle UX caveat (accepted):** the generated schema is a 5-branch `anyOf` with
`additionalProperties:false` and `const` discriminators. Monaco's JSON service
(vscode-json-languageservice) does not treat this as a discriminated union, so for e.g. a
`group` object it reports failures against the nearest branch ("missing property jsonPath")
rather than "invalid group." Live squiggles still work but read noisily. We accept this for
now; a hand-tuned `if/then` discriminated schema is a possible follow-up. The recursive
self-`$ref:"#"` is a Monaco validation path not exercised by the workflow schema (whose
`$ref`s are non-recursive) — exercise it manually during implementation.

### 2. `workflow-react`: `CriterionJsonEditor` (new component)

A small, self-contained editor — **not** a reuse of `WorkflowJsonEditor` (too coupled to
`WorkflowEditorDocument`/`Selection`/`liftJsonToPatch`).

- Props (names finalized in the plan): `value: Criterion | undefined`,
  `onApply(next: Criterion): void`, `onCancel(): void`, `disabled: boolean`, and the Monaco
  runtime + `hintProvider` resolved from context (§3/§4).
- **Monaco path:** create an isolated text model on a deterministic unique URI under
  `cyoda://criterion/` (e.g. `cyoda://criterion/<host-key>.json`) so the criterion schema's
  `fileMatch` applies; create the editor; register the schema once per runtime (idempotent);
  **dispose model + editor on unmount** to avoid "model already exists" on reopen. Seed with
  `JSON.stringify(value ?? emptyDefault, null, 2)`. When `disabled`, set Monaco
  `readOnly:true` and hide/disable Apply.
- **Textarea fallback:** when no runtime in context, render the plain `<textarea>`
  (monospace), no hints; same disabled handling.
- **Apply (both paths):** `JSON.parse` → validation gate (§2.1). On failure, surface the
  error(s) inline and block. On success, call `onApply(parsed)`; the modal dispatches the
  existing `{ op: "setCriterion", host, path: ["criterion"], criterion }` patch — unchanged
  downstream.

#### 2.1 Validation gate (ports builder strictness)

A reusable validator (extracted from the builder's logic; lives in `workflow-react` or a
shared util) that **recursively** walks the parsed criterion tree (groups, `function.criterion`
prechecks) and enforces, in addition to `CriterionSchema.safeParse`:

- `validateJsonPathSubset(jsonPath)` for `simple`/`array` criteria.
- `BETWEEN` / `BETWEEN_INCLUSIVE` require a 2-element value array.
- Scalar operators require a non-empty value.

Returns structured issues (path + message) rendered inline. `safeParse` runs first; the
extra checks run on the parsed result. (Schema operators stay deliberately permissive —
`z.string().min(1)` — per issue #22 round-trip tolerance; the extra gate is what restores
builder-level strictness on Apply without tightening the round-trip schema.)

### 3. Monaco runtime plumbing (context) + availability matrix

`WorkflowEditor` already receives `jsonEditor.monaco`. Expose that runtime (or `null`) plus
the `hintProvider` to the inspector subtree via a new lightweight React context (e.g.
`CriterionEditorContext`), provided by `WorkflowEditor`. `CriterionJsonEditor` reads it;
`null` runtime → textarea fallback. Avoids prop-drilling through `Inspector` →
`TransitionForm` → `CriterionSection`. `Inspector` stops feeding `hintProvider` to the
deleted `FieldHintsProvider` and instead exposes it through this context.

Availability matrix (document in code/tests):

| `jsonEditor.monaco` supplied | `enableJsonEditor` | Criterion editor |
| --- | --- | --- |
| yes | any | Monaco + schema squiggles + completion |
| no | any | textarea fallback (no hints) |

The criterion editor's Monaco use is gated on the **runtime being supplied**, independent of
`enableJsonEditor` (which only governs the whole-workflow JSON tab/split).

### 4. Field-path autocomplete → Monaco completion provider (BREAKING)

Re-express the `hintProvider` data (`EntityFieldHintProvider` → `FieldHint[]` for the session
entity) as a Monaco completion item provider registered for the JSON language, scoped to
criterion models, activating when the cursor is inside a `jsonPath` string value.

**This requires widening the public Monaco runtime interface.** Today `MonacoLike.languages`
exposes only `json.jsonDefaults`. We must add the completion surface the provider needs —
at minimum:

- `languages.registerCompletionItemProvider(languageSelector, provider): { dispose(): void }`
- `languages.CompletionItemKind` (enum values used)
- whatever position/range/model surface the provider callback requires (align with the
  `TextModelLike`/`Position`/`Range` types already in `types.ts`).

Keep the addition minimal and structural (provider-agnostic), matching the existing
`MonacoLike` style. The **completion-source function** (given `FieldHint[]` + cursor context
→ completion items) is a pure function, implemented and unit-tested independently of Monaco.
A thin registration wrapper (e.g. `registerCriterionFieldCompletions(monaco, opts)`) lives in
`workflow-monaco` and is exported.

Because the public interface changes, `cyoda-dev-console` (and any other consumer
constructing a runtime) must pass a richer `monaco` object. Track under
"Breaking change & coordination."

### 5. Summary card rework

`CriterionSummaryCard` shows the criterion **type badge** + a **compact read-only JSON
snippet** when a criterion is set (decide single-line vs. truncated multi-line in the plan),
plus Add/Edit/Remove. All actions respect `disabled` (read-only hides/disables Add/Edit/
Remove). "Add" seeds an empty/default criterion and opens the editor.

### 6. Deletions

- From `CriterionForm.tsx`: `CriterionBuilder`, `RuleEditorPanel`, `RuleGroupBlock`, the
  Simple/Function/Lifecycle/Array field forms, `AddConditionMenu`, `PlainEnglishPreview`,
  the form/JSON toggle, form-only helpers (`defaultCriterion` per-type construction).
  Salvage the builder's validation predicates into the reusable gate (§2.1) before deleting.
- Delete `inspector/criteria/JsonPathInput.tsx`, `inspector/criteria/FieldHintsContext.tsx`,
  `inspector/criteria/fieldLabels.ts`.
- Keep: `CriterionSection` (same export + props — `TransitionForm` untouched), the reworked
  `CriterionSummaryCard`, and the modal shell hosting `CriterionJsonEditor`. Split the
  remaining code into focused files (`CriterionSection.tsx`, `CriterionSummaryCard.tsx`,
  `CriterionJsonEditor.tsx`), preserving `CriterionSection` as the public entry point.

## Data flow

```
WorkflowEditor (provides CriterionEditorContext: { monacoRuntime|null, hintProvider })
  └─ Inspector → TransitionForm
       └─ CriterionSection (unchanged props: host, criterion, disabled, onDispatch, …)
            ├─ CriterionSummaryCard → type badge + compact JSON + Add/Edit/Remove (respect disabled)
            └─ Modal (on Edit)
                 └─ CriterionJsonEditor
                      ├─ runtime from context?
                      │     ├─ yes → Monaco model on cyoda://criterion/…
                      │     │          + registerCriterionSchema (squiggles)
                      │     │          + registerCriterionFieldCompletions (hintProvider)
                      │     └─ no  → <textarea> fallback (no hints)
                      └─ Apply: JSON.parse → CriterionSchema.safeParse → extra strictness checks (recursive)
                                   ├─ invalid → inline error(s), block
                                   └─ valid   → onApply → onDispatch({ op:"setCriterion", … })
```

## Error handling

- **Invalid JSON:** caught at `JSON.parse`; inline error; Apply blocked.
- **Schema-noncompliant:** `CriterionSchema.safeParse` issues shown; Apply blocked.
- **Builder-level violations:** §2.1 extra checks (jsonPath subset, BETWEEN arity, empty
  value) shown; Apply blocked.
- **Live feedback (Monaco only):** JSON-schema squiggles from `registerCriterionSchema`
  (noisy for unions, per §1 caveat).
- **No runtime:** textarea fallback still enforces the full Apply gate.
- **Read-only:** editor non-editable, Apply hidden; summary card actions disabled.

## Breaking change & coordination

- Widening `MonacoLike`/`WorkflowJsonMonacoRuntime` with completion-provider surface (§4) is
  a public-API change in `workflow-monaco`/`workflow-react`. `cyoda-dev-console` must update
  its runtime construction to satisfy the wider interface.
- Versioning: major bump across the affected packages, coordinated per the repo's release
  mechanism. Follows the in-flight 0.3.0 major work.
- `hintProvider` / `EntityFieldHintProvider` / `FieldHint` remain in the public API and
  remain meaningful (now consumed by the completion provider via context).

## Testing

Realistic coverage given the test harness does **not** run the JSON language service (the
Monaco fakes in `tests/jsonEditorIntegration.test.tsx` and `tests/schema.test.ts` implement
only the structural surface):

- **Pure-function units (full coverage):**
  - Validation gate (§2.1): valid criterion passes; bad jsonPath, BETWEEN arity, empty
    scalar value each fail with the right issue — including nested `group` and
    `function.criterion` recursion.
  - Completion-source function (§4): given `FieldHint[]` + a cursor-inside-`jsonPath`
    context → expected items; outside a `jsonPath` value → none.
  - `criterionJsonSchema()` generates and validates a nested `group` criterion (recursive
    `$ref`); `registerCriterionSchema` registers under its own URI/fileMatch and coexists
    with the workflow schema.
- **Component tests (structural, via fakes):**
  - Valid edit → `setCriterion` patch dispatched with parsed criterion.
  - Invalid JSON / schema-invalid / strictness-violating → inline error, no patch.
  - Summary card renders type badge + compact JSON when set; renders Add when none; respects
    `disabled`.
  - Textarea fallback renders and applies when no runtime in context.
  - Read-only: Apply hidden / editor non-editable.
- **Known gap (document explicitly):** live squiggle rendering and live completion popups
  have **no automated coverage** because the fakes don't run the language service. Mitigate
  with the pure-function tests above + manual verification.
- **Remove/rewrite obsolete builder tests** — approximately: `criterionModal`,
  `criterionSimple`, `criterionGroup`, `criterionLifecycle`, `criterionFunction`,
  `criterionArray`, `jsonPathHints`, `fieldLabels`; check `automatedOrderingInspector` and
  `issueBadge` for criteria references. (~10 files.) Core-level `criteria/*` tests stay valid
  (data model unchanged).

## Open items / to verify during implementation

- Final shape of the widened completion surface on `MonacoLike` (minimal set that real
  Monaco satisfies and the fakes can stub).
- Exact compact-JSON rendering for the summary card (single-line vs. truncated multi-line).
- Manual exercise of the recursive `$ref:"#"` schema against a real Monaco build to confirm
  acceptable squiggle behavior; decide whether the `if/then` discriminated schema is worth
  it.
- Confirm `CriterionSection`'s existing props remain sufficient (host/criterion/disabled/
  onDispatch) with only context plumbing added at the `WorkflowEditor` level.
- Coordinate the `cyoda-dev-console` runtime update and the version bump.
```
