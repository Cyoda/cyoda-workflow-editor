# Workflow `annotations` — round-trip preservation + JSON editing

**Date:** 2026-07-01
**Package:** `@cyoda/workflow-core` 0.3.0 → **0.4.0** (0.x minor), with cascade patch bumps to dependents
**Status:** Two independent fresh-context reviews folded in (round 1: §0 alias
blocker + §6 locatable-error; round 2: clone-in-§0, end-to-end state-`targetId`
test, explicit assumptions, verify-list additions). Round 2 verdict: no blockers,
ready to implement. Awaiting final spec sign-off before the implementation plan.

## Problem

cyoda-go **0.8.1** adds an optional `annotations` field — engine-opaque,
client-owned JSON metadata — at three levels of a workflow definition:

- workflow root (`WorkflowDefinition.annotations`)
- each state (`StateDefinition.annotations`)
- each transition (`TransitionDefinition.annotations`)

The editor stack currently **silently drops** these on an open → edit → save
round-trip. The dev console should instead:

1. Preserve `annotations` through the round-trip.
2. Let users edit them via the existing JSON editor (Monaco).

Read-only display and visual-driving (rendering annotations on the graph) are
**out of scope**.

## Authoritative contract (from `cyoda help workflows --format=markdown`, 0.8.1)

`annotations` — **object or absent** — optional client-owned metadata, stored and
round-tripped (compacted) but never interpreted by the engine. **Must be a JSON
object**; **capped at 64 KB per field**. Same shape and rules at all three
levels. Import uses `DisallowUnknownFields`, so the field must be explicitly
modelled and allowlisted or it is rejected/stripped.

## Why this is a `workflow-core` change

The drop happens entirely inside `@cyoda/workflow-core`, on both edges:

- **Import (parse):** `WorkflowSchema` / `StateSchema` / `TransitionSchema` are
  `z.object(...)`, which strips unknown keys → annotations lost at validation.
- **Export (serialize):** `normalize/output.ts` rebuilds each node field-by-field
  (no passthrough), and the `"0.8"` dialect then runs a strict per-level
  allowlist (`V0_8_WIRE_FIELDS`) that drops anything unlisted.

The Monaco JSON editor derives its schema from `ImportPayloadSchema` via
`z.toJSONSchema()`, so **adding `annotations` to the Zod schemas lights up
in-editor autocomplete + validation for free**, and the dev console's
whole-session `replaceSession` re-parse path then preserves it. No dev-console
code change is required to satisfy the requirement; it is delivered by consuming
the new `@cyoda/workflow-core`.

### What does NOT need to change

- **Patch system** (`patch/apply.ts`): structured edits use immer structural
  mutation (`Object.assign(transition, updates)`, wholesale state moves), so an
  existing `annotations` object rides through untouched. No new patch ops.
- **Downstream packages** (`workflow-graph`, `workflow-layout`, `workflow-viewer`,
  `workflow-react`): they *project* the canonical document into a graph and never
  reconstruct the domain objects; `annotations` stays in the session. They need
  only a version bump (auto-cascaded), no code change — consistent with
  read-only display / visual-driving being out of scope.

## Approach: retrofit into the `"0.8"` dialect

`annotations` lands in the existing `"0.8"` dialect rather than a new `"0.8.1"`
dialect version. Dialects are keyed `MAJOR.MINOR`; 0.8.0 was never released, so
the `"0.8"` dialect already *is* cyoda-go 0.8.1. The field is purely additive; a
new version string would fragment config for no benefit. `LATEST_CYODA_VERSION`
stays `"0.8"`. The `"0.7"` dialect continues to omit `annotations` (the field
does not exist in the 0.7 wire format) — handled the same way as `schedule`.

Because it changes the canonical model (`types/*`, `schema/*`), the runbook
(`ai/cyoda-schema-versions.md`) classifies this as the "major"
(coordinate-downstream) change tier. **Pre-1.0 that ships as a 0.x minor** —
`@cyoda/workflow-core` 0.3.0 → **0.4.0** — matching the documented convention
(the 0.3.0 changelog shipped genuinely breaking removals as a 0.x minor and
notes "the project is intentionally staying in 0.x"). The change here is in fact
only *additive* (optional field, more-permissive parse, additive serialize).
Do **not** use a `major` changeset — that would cut 1.0.0.

## Change surface (exhaustive)

All paths are under `packages/workflow-core/src/`.

> **Critical (found in independent review):** the operator-alias pass below is a
> data-corruption / hard-fail hazard the first draft missed. Listed as §0 because
> it must land *with* §2 (the schema change), not after — the two are inseparable.

### 0. Operator-alias pass — `parse/operator-alias.ts`
- **Why:** `normalizeOperatorAlias` runs inside every dialect's `toCanonical`
  *before* Zod validation and recurses into **every** nested object. Its
  `needsAlias` test is true for any object with `type` absent (or ∈
  simple/lifecycle/array), so it would rewrite `operatorType`→`operation`
  **inside a client annotation**, and when an annotation carries both `operation`
  and `operatorType` with differing values it **throws and fails the entire
  import** (`operator-alias-conflict`). Invisible today only because the schema
  strips annotations; §2 makes it live. Left unfixed it violates "preserve
  faithfully / never interpreted by the engine."
- **Fix:** make the walk annotations-blind — do not recurse into the value of an
  `annotations` key; clone it so the "returns a new tree" invariant in the
  function's docstring still holds:
  `result[k] = k === "annotations" ? structuredClone(v) : normalizeOperatorAlias(v);`
  (annotations are pure JSON ≤ 64 KB, so `structuredClone` — or a `JSON.parse(JSON.stringify(v))`
  fallback — is cheap and total). Safe: annotations are opaque, no criterion node
  has an `annotations` key, and skipping alias normalization inside opaque values
  is correct at every level.
- **Test:** an annotation containing `operatorType`, and one containing both
  `operation`+`operatorType` (differing), must survive parse byte-for-byte — no
  rename, no throw.

### 1. Canonical types — `types/workflow.ts`
- Add `export type Annotations = Record<string, unknown>;`
- Add `annotations?: Annotations;` to `Workflow`, `State`, `Transition`.
- Naming: give `Annotations` a one-line doc comment distinguishing it from
  `workflow-graph`'s existing `GraphAnnotation` (validation-issue overlays on the
  graph) — different concept, different package, similar name.

### 2. Zod schemas — `schema/workflow.ts`
- Add `export const AnnotationsSchema = z.record(z.string(), z.unknown());`
  (object-only; arbitrary keys and arbitrary JSON values).
- Add `annotations: AnnotationsSchema.optional()` to `WorkflowSchema`,
  `StateSchema`, `TransitionSchema`.
- Consequence: Monaco autocomplete/validation surface `annotations` with no
  further work (verify via the existing monaco schema test).

### 3. Parse drop-fix — `normalize/input.ts`
- `normalizeWorkflowInput` rebuilds each state as `{ transitions }`, dropping
  state-level `annotations`. Carry it through:
  `out.states[trimmedCode] = { ...(state.annotations !== undefined ? { annotations: state.annotations } : {}), transitions: normTransitions }`.
- Workflow-level (`{ ...workflow, states: {} }`) and transition-level
  (`{ ...t }`) already spread `annotations` through — no change.
- **Empty-object policy:** preserve `annotations` exactly as parsed, including
  `{}` (do not coerce empty `{}` → `undefined`). Fidelity over cleverness; the
  contract says "object or absent" and the user typed what they typed.

### 4. Serialize emit — `normalize/output.ts`
- Add `annotations?: boolean` to `OutputOptions` (mirrors the existing
  `schedule` flag; defaults `false` so the 0.7 wire output is unchanged).
- In `outputWorkflow`, `outputStates`, `outputTransition`: when
  `options?.annotations` and the node's `annotations !== undefined`, emit
  `annotations` (verbatim object).
- Wire key order is pinned by the `"0.8"` dialect allowlist (`pick` emits in
  allowlist order), so the emission order inside `output*.ts` is not what
  determines final bytes — the allowlist array positions in §5 do. `output*.ts`
  just needs to *include* the key.

### 5. `"0.8"` dialect — `dialect/cyoda-0_8.ts`
- Add `"annotations"` to `WORKFLOW_FIELDS`, `STATE_FIELDS`, `TRANSITION_FIELDS`
  (and therefore `V0_8_WIRE_FIELDS`, which tests assert against), at the
  positions below so golden output is deterministic:
  - `WORKFLOW_FIELDS`: `... "active", "annotations", "criterion", "states"`
    (after `active`, before `criterion` — matches the 0.8.1 help example).
  - `TRANSITION_FIELDS`: `"name", "next", "manual", "annotations", "disabled", ...`
    (after `manual`, before `disabled` — matches the 0.8.1 help example).
  - `STATE_FIELDS`: `"transitions", "annotations"` (matches the help's
    StateDefinition field list; key order is insignificant to the importer, so
    this is only for a stable golden fixture).
- Change the emit call to
  `outputWorkflow(wf, { schedule: true, annotations: true })`.
- `annotations` is a plain object passed through `pick`, so it survives the
  allowlist as a whole (its inner keys are client-owned and intentionally not
  further allowlisted).
- **Comment audit (scoped):** update comments that describe the `"0.8"` dialect's
  *current target* to note it now targets **0.8.1** (0.8.0 never shipped) — the
  dialect file and the type/schema headers. **Leave** comments that document the
  *provenance* of a 0.8.0-introduced constraint as-is (e.g. `schema/name.ts` /
  `validate/semantic.ts:566` "cyoda-go v0.8.0 caps every name" — that cap really
  did arrive in 0.8.0). Don't blanket-rewrite every `0.8.0` string.

### 6. 64 KB cap + **locatable** error — `validate/semantic.ts`
- Add `annotationsSizeIssues(annotations, label, targetId)` computing compacted
  byte length via
  `new TextEncoder().encode(JSON.stringify(annotations)).length`; if
  `> ANNOTATIONS_MAX_BYTES` emit a blocking issue `{ severity: "error",
  code: "annotations-too-large", targetId, message, detail: { bytes, max } }`.
- Add `ANNOTATIONS_MAX_BYTES = 64 * 1024` (see "To verify against the binary").
- **Must carry a `targetId`** (review S1). Unlike `name-too-long`, annotations
  are *not* rendered on the graph, so this validation error is the only signal —
  and without a `targetId` the Monaco marker lands at line 1/col 1
  (`markers.ts:54`) and the issues drawer offers no jump/highlight (it resolves
  targets from `targetId` only). Emit one per level:
  - workflow: `idFor(doc, wf.name, "workflow")` (semantic.ts ~L597).
  - transition: `transitionTargetId(doc, wf.name, stateCode, index)` (~L607).
  - state: add a small helper via `identityIdFor({ kind: "state", workflow,
    state })` (`identity/id-for.ts` already supports `kind:"state"`, and both the
    issues drawer and the graph resolve state ids).
  Also make the `label` node-identifying (workflow name / state code / transition
  name) so the message text locates it even in a plain list.
- Call it in the existing traversal alongside the name checks: workflow (~L135),
  each state (~L145), each transition (~L158). Skip when `annotations` is absent.
- The Monaco marker / graph highlight anchors to the **containing node** (whole
  workflow / state / transition), not the `annotations` key precisely — the same
  granularity every other node-scoped issue uses, and far better than a line-1
  marker. Precise key-level anchoring would need a `pathForId` extension; out of
  scope.
- **State-level `targetId` is the first semantic issue of its kind** (today only
  workflow and transition issues carry one). The resolving primitives are proven
  (`identity/id-for.ts` `kind:"state"`, `markers.test.ts`, the issues drawer), so
  the only new link is emitting it — covered by the end-to-end test below.
- Rationale: block the save before cyoda-go returns a 400, matching the
  `name-too-long` precedent — but *locatably*, since the field is invisible.

### 7. Public API — `index.ts` / `schema/index.ts` / `types/index.ts`
- Export `Annotations` type and `AnnotationsSchema` where the sibling
  `TransitionSchedule` / `TransitionScheduleSchema` are exported, so downstream
  packages and the dev console can reference the type.

## Testing

- **Round-trip / golden** (`tests/golden`, `tests/dialect`): a fixture carrying
  `annotations` at all three levels parses → serializes byte-stable through the
  `"0.8"` dialect; assert the emitted payload contains the annotations objects
  verbatim.
- **Allowlist** (`tests/dialect`): extend the existing `V0_8_WIRE_FIELDS`
  assertion so `annotations` is accepted at workflow/state/transition and a
  stray sibling key is still stripped.
- **0.7 omission**: a canonical workflow with `annotations` serialized through
  the `"0.7"` dialect emits **no** `annotations` key.
- **Operator-alias blindness** (`tests/parse`, guards §0): an annotation
  containing `operatorType` survives parse unchanged (no rename to `operation`);
  an annotation with both `operation` and `operatorType` (differing) does **not**
  throw and both keys survive verbatim. Regression test for the B1 blocker.
- **Object-only schema** (`tests/parse`/`tests/schema`): `AnnotationsSchema`
  accepts `{}` and nested objects and **rejects** `null`, arrays, strings, and
  numbers. (Arrays were accepted under Zod 3 but rejected under Zod 4 — lock the
  Zod-4 object-only behavior in so a future bump can't silently loosen it.)
- **Parse preservation** (`tests/parse`): import a payload with state-level
  `annotations`; assert it survives `normalizeWorkflowInput` (regression guard
  for the drop-fix in §3).
- **Semantic** (`tests/semantic`): a `> 64 KB` annotations object yields exactly
  one `annotations-too-large` error **carrying the offending node's `targetId`**;
  a `≤ 64 KB` object yields none; a non-object value is rejected by the schema,
  not the semantic pass.
- **Locatable state error (end-to-end)** — the one genuinely new UX link: a
  `> 64 KB` **state** annotation produces an issue whose `targetId` resolves to a
  Monaco marker at `startLineNumber > 1` (not line 1) and to a jump target in the
  issues drawer. Closes the only untested step in §6 (state-level `targetId` is
  the first of its kind).
- **Monaco** (`packages/workflow-monaco`): the generated JSON schema includes
  `annotations` as an optional object at the three levels.

## Docs + release

- Add a `0.8.1` section to `ai/cyoda-schema-versions.md` documenting: the new
  `annotations` field (object-only, 64 KB cap, engine-opaque, three levels), the
  note that the `"0.8"` dialect targets cyoda-go 0.8.1 (0.8.0 never shipped), and
  the drop-fix + allowlist + semantic-cap changes.
- Add a Changesets entry marking `@cyoda/workflow-core` as **minor** (→ 0.4.0).
  Pre-1.0 convention: the canonical-model "major-class" change ships as a 0.x
  minor, not a `major` changeset (which would cut 1.0.0). With
  `updateInternalDependencies: "patch"` and no `fixed`/`linked` groups,
  dependents receive auto-cascaded **patch** bumps (no code change needed):
  `workflow-react` 0.3.0→0.3.1, `workflow-viewer` 0.3.0→0.3.1,
  `workflow-monaco` 0.2.0→0.2.1, `workflow-graph` 0.2.1→0.2.2,
  `workflow-layout` 0.1.2→0.1.3.

## To verify against the running 0.8.1 binary

- **64 KB boundary.** The contract says "64 KB per field"; the spec assumes
  `ANNOTATIONS_MAX_BYTES = 65536` (64×1024), strict `>`, UTF-8 bytes on the
  compacted JSON. Confirm 65536 vs 64000, `>` vs `>=`, bytes vs runes against the
  binary. A client check *stricter* than the server merely blocks a save the
  server would accept; a *looser* one lets a 400 through — the exact thing this
  check exists to prevent. Keep it a single constant so it's a one-line change.
- **Server round-trip key order.** The contract says annotations are stored
  "compacted." If the server compacts via `json.Compact` (whitespace only), key
  order is preserved; if it unmarshals to a Go `map` and re-marshals, keys come
  back **alphabetically sorted**. The editor's *local* parse→serialize is
  byte-stable either way (golden tests pass), but a save→server→reload could
  reorder an annotation's keys. Confirm which the binary does; if it sorts, note
  it in the UX so a reordered-but-equal annotation isn't mistaken for a bug. Do
  **not** pre-assume a surprise.
- **Empty `{}` on reload.** The spec preserves `annotations: {}` (§3). The
  contract's "omitted when absent" is ambiguous about whether `{}` counts as
  present. Confirm the server round-trips an empty object rather than dropping it.
- **Known guard interaction (accepted, not fixed):** a pathologically nested or
  huge annotation can trip the whole-document `MAX_JSON_OBJECT_DEPTH` (200) /
  `MAX_JSON_BYTES` (5 MB) parser guards and fail the *entire* parse with a
  generic message rather than an annotations-scoped one. Low likelihood.

## Load-bearing assumptions (stated explicitly)

- **cyoda-go 0.8.0 never shipped**, so the single `"0.8"` dialect (keyed
  `MAJOR.MINOR`) can emit `annotations` safely. A real 0.8.0 deployment would
  400 on the new field under `DisallowUnknownFields`; the retrofit is correct
  only because no such deployment exists (per `ai/cyoda-schema-versions.md`). If
  that assumption breaks, `annotations` would need a distinct dialect version.
- **The dev console round-trips through `workflow-core`.** "No dev-console code
  change required" holds because the console serializes via
  `serializeImportPayload`/`serializeExportPayload` and edits annotations only
  through the whole-session `replaceSession` re-parse. If it has any custom
  payload projection that discards unknown fields, annotations would be lost
  there — confirm against the host app before declaring the feature done.

## Out of scope (explicit)

- Rendering annotations on the graph or any read-only display surface.
- Dev-console UI beyond what the JSON editor already provides.
- Structured (form-based) annotation editing / dedicated patch ops.
- Any `"0.7"` dialect emission of `annotations`.
