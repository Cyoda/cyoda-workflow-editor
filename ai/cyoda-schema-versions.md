# cyoda-go schema dialects (workflow-core)

The editor reads and writes cyoda-go workflow-config JSON. Different cyoda-go
versions can use **different workflow-config schemas** (for example, the bundled
0.6.1 `cyoda help workflows` docs show uppercase `EXTERNAL` processors and
`operatorType` keys, while live 0.7.1 uses lowercase `externalized`/`scheduled`
and `operation`). To let a developer target the right version, `@cyoda/workflow-core`
routes parse/serialize through a pluggable **dialect** seam. Tracked in issue #24.

## Two distinct "version" axes — do not confuse them

1. **cyoda-go schema dialect** (`src/dialect/`) — the binary/API version whose
   wire schema you are reading/writing (e.g. `"0.7"`). This is what this document
   is about. Selected explicitly by the host app.
2. **In-document workflow `version` tag** + `src/migrate/` — a per-workflow
   string field (`WorkflowConfigurationDto.version`) that cyoda-go treats as
   *informational and does not interpret*. The `migrate/` registry migrates
   between these tag values (demoed in `apps/docs-embed-demo/.../UtilitiesPage.tsx`
   as `"1.0" → "1.1-demo"`). It is **not** a reliable schema discriminator and is
   independent of the dialect axis.

## How a dialect works

A `CyodaDialect` (`src/dialect/dialect.ts`) is the two version-specific edges
around the editor's single canonical in-memory model (`Workflow`/`Criterion`):

- `toCanonical(raw)` — raw parsed JSON from this cyoda-go version → the canonical
  raw shape the Zod schema expects (runs before validation; may throw).
- `workflowsToWire(workflows)` — canonical workflows → the plain objects this
  cyoda-go version expects on the wire (consumed by the serializer).

The shipped **0.7 dialect** (`src/dialect/cyoda-0_7.ts`) composes the existing
`normalizeOperatorAlias`, `coerceCanonicalDefaults`, and `outputWorkflow`, so it
reproduces historical behaviour exactly.

## Public API

- `parseImportPayload(json, prior?, { sourceVersion })` / `parseExportPayload(...)`
  — `sourceVersion` defaults to `LATEST_CYODA_VERSION`. The chosen version is
  recorded on `document.meta.cyodaVersion` (editor-only; never emitted into
  Cyoda JSON).
- `serializeImportPayload(doc, { targetVersion })` / `serializeExportPayload(...)`
  — `targetVersion` defaults to `doc.meta.cyodaVersion` then `LATEST_CYODA_VERSION`.
- `getDialect`, `registerDialect`, `listDialects`, `SUPPORTED_CYODA_VERSIONS`,
  `LATEST_CYODA_VERSION`, types `CyodaDialect` / `CyodaSchemaVersion`.

The host app supplies the target version (it knows which cyoda-go each project
talks to). There is **no auto-detection**: cyoda-go exposes no HTTP version
endpoint, and the in-document `version` tag is informational.

## Runbook: adding a new cyoda-go version

> Do **not** infer a version's schema from docs alone — the 0.6.1 markdown bundled
> with the 0.7.1 binary is self-contradictory. Always confirm against a runnable
> binary.

1. **Acquire the authoritative schema from a runnable binary.** Run the new
   cyoda-go version and round-trip a **representative** workflow through it:
   capture `cyoda help openapi yaml` and `cyoda help workflows`, then create a
   model, import the workflow, `GET …/workflow/export`, and record the exact wire
   shape (processor `type` casing, criterion operator key, optional-field
   omission, schedule shape, etc.). Never rely on the bundled docs alone — they
   can be self-contradictory.

2. **Diff the generated DTOs.** Diff the new version's generated DTOs
   (`api/generated.go` or the equivalent OpenAPI-generated types) against the
   previous version to produce a **complete field-level change list**. This is
   the authoritative input to the dialect; the prose docs are not.

3. **Classify each change by direction.** For every field-level change, decide
   which seam it belongs to:
   - **`toCanonical` direction** — the new wire format → canonical (e.g. a
     renamed/aliased key, a casing change, a dropped legacy field).
   - **`workflowsToWire` direction** — canonical → the new wire output (e.g. a
     new emitted field, a stricter allowlist, an omitted field).
   - **Canonical model / Zod schema change** — a field the canonical model does
     not yet represent at all (a new transition/processor field, a removed type).

4. **If the canonical model changes → major-class change + coordinated updates.**
   Changing the canonical model (`src/schema/*`, `src/types/*`) is a **major-class**
   `@cyoda/workflow-core` change. It requires coordinated updates in the
   downstream packages that consume the model:
   `workflow-react`, `workflow-graph`, `workflow-layout`, `workflow-monaco`,
   `workflow-viewer`, and the `cyoda-dev-console` host app. Do not land the core
   change without scheduling those follow-ups.
   **Versioning:** while the project is below `1.0.0` it deliberately stays in
   `0.x`, so this major-class change ships as a Changesets **`minor`** (0.x
   convention), **not** a `major`/`1.0.0` cut — see the versioning policy in
   `CLAUDE.md` and the "Pre-1.0 `minor`" notes in the package CHANGELOGs.

5. **If the canonical model is unchanged → new dialect, minor/patch bump.**
   Write a new dialect in `packages/workflow-core/src/dialect/cyoda-<v>.ts`
   exporting a `CyodaDialect`. Implement only the **deltas** in `toCanonical`
   (wire → canonical) and `workflowsToWire` (canonical → wire); reuse the 0.7/0.8
   helpers (`normalizeOperatorAlias`, `coerceCanonicalDefaults`, `outputWorkflow`,
   the 0.8 allowlist) where the shape matches. Register it with `registerDialect`
   in `src/dialect/index.ts`, and add it to `SUPPORTED_CYODA_VERSIONS`. Update
   `LATEST_CYODA_VERSION` only if this version is the new default. A new dialect
   with no canonical change is a **minor** (new default) or **patch** bump.
   - **Per-version validation (if needed).** If the engine's rules differ (e.g. a
     different operator catalogue), branch the relevant checks in
     `src/validate/semantic.ts` on the dialect version.

6. **Update `SUPPORTED_CYODA_VERSIONS` and `LATEST_CYODA_VERSION`** in
   `src/dialect/version.ts` (re-exported through `dialect/index.ts`). Add a
   golden round-trip fixture built from a **real export** of the new binary plus
   a parse→serialize byte-identity test under `tests/dialect/` or `tests/golden/`.

7. **Update this file (`ai/cyoda-schema-versions.md`)** with a new version
   section listing every wire-format change, **before merging**.

8. **Update `cyoda-dev-console`'s `workflow-project-model`.** Add the new version
   to the `cyodaGoVersion` union and set it as the default for new projects (once
   the corresponding cyoda-go version has actually released). All
   `parseImportPayload` call sites in the host must agree on the version, or the
   file tree and editor will disagree on validity.

## v0.8.0 (dialect `"0.8"`)

The `"0.8"` dialect (`src/dialect/cyoda-0_8.ts`) is now `LATEST_CYODA_VERSION`.
It composes the 0.7 operator-alias/defaults pass and adds the deltas below.

> **Status (per Paul Schleger, 2026-06-16):** v0.8.0 has **not been released
> yet**. Scheduled transitions are a schema/SPI placeholder only — see below.

- **`scheduled` processor type removed.** The canonical
  `ScheduledProcessorSchema` and the `ScheduledTransitionProcessorDefinitionDto`
  it modelled are gone. `ProcessorSchema` is now `externalized`-only, matching
  the v0.8.0 wire format exactly. The `scheduled` processor type was an
  unsupported v0.7 platform hack; no real workflows used it. The **0.7 dialect**
  silently drops any `{type:"scheduled"}` processor on import and reports a
  `dropped-scheduled-processor:<name>` warning via `ParseResult.warnings`.

- **`transitions[].schedule` added (`TransitionScheduleDto`).** New optional
  field `{ delayMs: int > 0, timeoutMs?: int > 0 }` on a transition
  (`TransitionScheduleSchema`). This is a **schema/SPI placeholder** — a
  scheduled transition can be configured and imported, but the workflow engine
  does **not yet execute it**. The 0.8 dialect passes it through on import and
  emits it on export; the 0.7 dialect omits it (the field does not exist in the
  v0.7 wire format).

- **`DisallowUnknownFields` enforced on import.** v0.8.0's import handler rejects
  any unexpected key at any nesting level with a 400. The 0.8 dialect's
  `workflowsToWire` therefore runs the output through a strict per-level field
  allowlist (`V0_8_WIRE_FIELDS`: workflow, state, transition, processor,
  processor.config, schedule) so no editor metadata or future canonical field
  can leak into an import payload.

- **`active` preserved on import.** Earlier servers force-overrode workflow
  `active` to `true` on import; v0.8.0 preserves the value sent. The editor
  already round-trips `active`, so the emitted value is authoritative.

- **Empty `workflows` rejected in `REPLACE` / `ACTIVATE`.** An import payload
  with `workflows: []` is rejected (400) in `REPLACE` and `ACTIVATE` modes — an
  empty replace/activate is treated as a mistake rather than a no-op. (`MERGE`
  with an empty array remains a no-op.) The editor's `ImportPayloadSchema`
  already requires `workflows.min(1)`, so the editor never emits an empty array.

- **Name length cap: 256 characters.** Workflow, state, transition, and
  processor names must be ≤ 256 chars (`NAME_MAX_LENGTH`). Enforced in
  `NameSchema` and mirrored as a `name-too-long` semantic error so the editor
  blocks a save before the server returns a 400. Referential-integrity
  constraints v0.8.0 enforces (`initialState` exists, each `next` is a valid
  state, no duplicate transition names per state, no duplicate workflow names)
  were already surfaced by the semantic validator.

- **`type: "internalized"` reserved.** v0.8.0 reserves an `internalized`
  processor type for future use but **rejects it at dispatch today** (firing a
  transition that carries one returns an error). The editor does **not** model
  or emit `internalized`; the canonical `ProcessorSchema` remains
  `externalized`-only. Listed here so a future dialect author knows the literal
  is taken and must not be repurposed.

`ParseResult` gained an optional `warnings: string[]` field (additive; existing
call sites are unaffected) carrying the dialect's `toCanonical` notes.

## v0.8.1 (dialect `"0.8"`)

The `"0.8"` dialect now targets cyoda-go **0.8.1** (0.8.0 never shipped, so a
single MAJOR.MINOR-keyed dialect can carry the new field safely).

- **`annotations` added at workflow / state / transition level.** Optional,
  engine-opaque, client-owned JSON. **Object-only** (arrays/primitives/null are
  rejected by `AnnotationsSchema`), **capped at 64 KB per field** (compacted
  UTF-8 bytes), stored and round-tripped but never interpreted by the engine.
  Modelled on the canonical `Workflow`/`State`/`Transition` (`src/types/workflow.ts`)
  and `WorkflowSchema`/`StateSchema`/`TransitionSchema` (`src/schema/workflow.ts`).
- **Parse:** `normalizeOperatorAlias` skips the `annotations` subtree (it would
  otherwise rewrite `operatorType`->`operation` inside opaque client data or throw
  on a value carrying both keys); `normalizeWorkflowInput` carries state-level
  annotations through its state rebuild.
- **Serialize:** `outputWorkflow`/`outputStates`/`outputTransition` emit
  annotations under a new `OutputOptions.annotations` flag; the `"0.8"` dialect
  passes `{ schedule: true, annotations: true }` and adds `annotations` to the
  per-level `V0_8_WIRE_FIELDS` allowlist (the inner keys are opaque and are not
  further allowlisted). The `"0.7"` dialect omits the field entirely.
- **Validation:** an `annotations-too-large` semantic error (`ANNOTATIONS_MAX_BYTES`)
  blocks a save above 64 KB before cyoda-go returns a 400, carrying a `targetId`
  so the editor can locate the offending node.
- **Open items (verify against a running 0.8.1 binary):** the exact byte boundary
  (65536 vs 64000, `>` vs `>=`); whether the server preserves annotation key order
  on reload (`json.Compact` preserves; map re-marshal sorts); whether an empty
  `{}` is round-tripped or dropped.

## v0.8.2 (dialect `"0.8"`)

The `"0.8"` dialect is extended **in place** to target cyoda-go **0.8.2**
(schema tag `1.1` → `1.2`, additive/dual-shape — see issue #384). No new
dialect module, no `SUPPORTED_CYODA_VERSIONS`/`LATEST_CYODA_VERSION` change,
and no `version` tag restamp: `"0.8"` simply carries two more optional fields.

- **`processor.annotations` added.** Same `Annotations` shape/constraints as
  the existing workflow/state/transition `annotations` (opaque, client-owned,
  object-only JSON) — now also embeddable on an individual
  `ExternalizedProcessor` (`src/types/processor.ts`). Lets the editor attach a
  display name / description to a single processor rather than only to its
  containing transition.
- **`criterionAnnotations` added on workflow and transition.** A sibling field
  to `criterion` (`src/types/workflow.ts`), *not* nested inside the criterion
  tree itself — it annotates "the guard attached here" without requiring the
  criterion shape to carry editor metadata. Present on both `Workflow` (guards
  the workflow's own entry) and `Transition` (guards that transition).
- **Parse:** `normalizeOperatorAlias` already skips the `annotations` /
  `criterionAnnotations` subtrees (added in the canonical-model change, task 1
  of this feature) so opaque client JSON under either key is never rewritten
  or rejected for carrying both `operatorType` and `operation`.
- **Serialize:** `outputWorkflow`/`outputTransition` emit `criterionAnnotations`
  immediately after `criterion` under the existing `OutputOptions.annotations`
  flag; `outputProcessor`/`outputExternalizedProcessor` now take that same
  `options` parameter and emit `annotations` on the processor when present.
  The `"0.8"` dialect already passes `{ schedule: true, annotations: true }`,
  so all three fields ride the same flag as the v0.8.1 `annotations` field —
  no new `OutputOptions` key was needed. The `"0.7"` dialect passes no
  `annotations` option and continues to omit all three.
- **Allowlist:** `criterionAnnotations` added to `WORKFLOW_FIELDS` and
  `TRANSITION_FIELDS` (immediately after `criterion`, matching emission order);
  `annotations` added to `PROCESSOR_FIELDS` (before `config`). v0.8.0's
  `DisallowUnknownFields` import handler would otherwise reject either key.
- **`omitempty`, byte-identical for non-users.** All three fields are optional
  and only emitted `if options?.annotations && value !== undefined`; a workflow
  that sets none of them serializes to the exact same 0.8 wire bytes as before
  this change.

## v0.8.3 (dialect `"0.8"`)

The `"0.8"` dialect is extended **in place** to target cyoda-go **0.8.3** (workflow
schema tag `1.2` → `1.3`). This is a **major-class** canonical-model change (new
`schedule.function` field, `type` widened from a literal to a preserved string,
`startNewTxOnDispatch` relocated) shipped, per the 0.x policy in `CLAUDE.md`, as a
Changesets **`minor`** across `@cyoda/workflow-core`, `@cyoda/workflow-react`, and
`@cyoda/workflow-graph` — never a `major`/`1.0.0`. It also **removes** the `"0.7"`
dialect (see below) — a scope decision, not something 0.8.3 forced.

Everything below was confirmed against a **running 0.8.3 binary**, not inferred from
the bundled `cyoda help` docs or the OpenAPI document. Three places the docs disagreed
with the binary are called out inline; the binary won every time.

- **`transitions[].schedule.function` added — a second, mutually exclusive timing
  mode.** `schedule` was previously static-delay-only
  (`{ delayMs: int > 0, timeoutMs?: int > 0 }`, a v0.8.0 SPI placeholder — see
  above). 0.8.3 **executes** scheduled transitions, and adds a per-entity mode that
  computes the firing time via a calculation-node callout:

  ```ts
  interface ScheduleFunction {
    name: string;
    resultKind: "Schedule";        // only legal value; enforced by Zod literal
    calculationNodesTags: string;
    attachEntity?: boolean;
    context?: string;
    responseTimeoutMs?: number;
  }
  interface TransitionSchedule {
    delayMs?: number;              // static mode; canonical only when > 0 — see below
    function?: ScheduleFunction;   // per-entity mode
    timeoutMs?: number;            // may be 0 or negative — see below
  }
  ```

  `schedule` is **flat, not a discriminated union** — the server validates "exactly
  one of `delayMs` / `function`" as a cross-field rule, and its own export emits
  `delayMs: 0` *alongside* `function` (see next item), which a union could not parse
  without a lossy pre-pass. The XOR is enforced by a Zod `.refine` plus the semantic
  rule `schedule-mode-required` (fires when the present-mode count, evaluated after
  normalization, is 0 or 2). `schedule` remains mutually exclusive with
  `manual: true` (`schedule-manual-conflict`). `ScheduleFunction` does **not** reuse
  `FunctionConfigSchema`: it requires `name`/`calculationNodesTags`, pins
  `resultKind` to a literal, and has no `retryPolicy` — a distinct required-field
  set, not just a `responseTimeoutMs` bounds difference.

  Confirmed **not** feature-gated by the `version` tag: a `schedule.function`
  workflow tagged `"1.1"` imports successfully.

- **`delayMs`'s presence predicate is `> 0`, not "key exists" — cyoda-go's own
  export can violate its own rule.** This is the sharper form of a pattern already
  seen once in this file (v0.8.0 modelled `delayMs: int > 0`, but nothing before
  this release round-tripped a server *export*, which is where the gap surfaced).
  Confirmed against the wire:

  | Payload | Server |
  |---|---|
  | `{"delayMs": 0}` | 400 — *exactly one of schedule.delayMs or schedule.function is required* |
  | `{"delayMs": -5}` | 400 — same message |
  | `{"delayMs": -5, "function": {…}}` | **accepted** (counts as function-only) |
  | `schedule: null` | **accepted** (treated as absent) |

  **cyoda-go's own export emits `"delayMs": 0` next to a populated `function`** — a
  Go zero-value with no `omitempty`. Re-importing that export is accepted, because
  `delayMs: 0` reads as absent by the same predicate. Any parser that treats the key
  as merely *present* will either reject its own server's export or re-serialize a
  contradictory payload. The `"0.8"` dialect's `toCanonical` now **drops `delayMs`
  whenever `<= 0`** as a general normalization pass (not a one-off quirk for the
  export case) — this is non-lossy, since no payload the server accepts as a static
  schedule is altered by dropping a `<= 0` value.

  **General lesson for the next dialect author:** cyoda-go's presence tests are not
  "key exists". Assume every numeric optional field may use a `> 0` (or similar)
  presence predicate instead of key-presence until you've checked the wire — `delayMs`
  is the second field in this file's history to work this way, and it will not be
  the last.

- **`timeoutMs` / `responseTimeoutMs` have no enforced lower bound, despite the
  OpenAPI declaring `minimum: 0`.** `{"delayMs": 5, "timeoutMs": -1}` is
  **accepted**, and so is `responseTimeoutMs: -1` on a processor/criterion function
  config. Both fields now take **any integer** in the canonical schema
  (`TransitionSchedule.timeoutMs`, `ScheduleFunction.responseTimeoutMs`,
  `FunctionConfig.responseTimeoutMs`) — previously `.positive()` /
  `.nonnegative()`, both of which were **stricter than the server** and would fail
  to round-trip a file cyoda-go itself accepts. `timeoutMs: 0` is legal and means
  "drop on any lateness"; `timeoutMs < 0` behaves the same as `0` and carries a new
  non-blocking warning `schedule-timeout-negative` rather than a Zod rejection (the
  editor must not corrupt a value the server accepts).

  > **Docs disagreement.** The OpenAPI schema's `minimum: 0` is not enforced by the
  > binary. Do not trust declared bounds in the generated schema; probe the wire.

- **Request-level `allowCycles`.** New optional boolean on the import payload
  (`ImportPayloadSchema`, `WorkflowSession`), default `false`, bypasses server-side
  cycle detection. `S1 →scheduled→ S2 →scheduled→ S1` is rejected without it
  (*infinite loop detected … via unguarded automated transitions*) and accepted
  with it. Emitted **only when `true`**, so a document that doesn't use it stays
  byte-identical to pre-0.8.3 output; `DisallowUnknownFields` means the key cannot
  simply be tacked on for older servers regardless.

  The editor adds its own **non-blocking** `unguarded-automated-cycle` warning
  (manual: false / non-disabled / criterion-less transitions forming a cycle),
  suppressed when `allowCycles` is true, so the flag has in-editor meaning. It is a
  *warning*, deliberately: server-side cycle detection runs against the **merged
  stored** workflow set, not the payload, so under `importMode: "MERGE"` a clean
  editor document can still be rejected by a cycle that isn't even in the payload —
  the editor's rule is necessarily incomplete and must not block a save. Measured
  detector semantics worth knowing before touching this rule: self-loops count,
  explicit `criterion: null` counts as unguarded, one guard anywhere in the cycle is
  enough to clear it, `disabled: true`/`manual: true` on one edge clears it, a
  `schedule`d transition still counts as automated (does **not** exempt it), and
  cycles inside an `active: false` workflow are **still rejected** (inactive
  workflows are not skipped by cycle detection, unlike runtime selection).

  `allowCycles` must survive editor-document persistence too, not just the import
  payload — `serializeEditorDocument` and `EditorDocumentSchema.session` both needed
  updating, or the flag round-trips through an import/export but is silently lost
  on save/reopen (the more common path).

- **Strict `version`-tag validation.** The workflow `version` tag moves from
  informational (§ "Two distinct version axes", above) to **range-checked**,
  independent of feature use — validation runs *before* model lookup, so a bad tag
  400s even against a nonexistent model:

  | Tag | Result |
  |---|---|
  | absent / `""` | 400 *version is empty; required MAJOR.MINOR form* |
  | `"1"`, `"1.0.0"`, `"1.03"` (leading zero) | 400 *not in MAJOR.MINOR form* |
  | `"1.0"` | 400 *no longer accepted; minimum supported in major 1: 1.1* |
  | `"1.1"` – `"1.3"` | accepted |
  | `"1.4"` | 400 *too new; this server supports up to 1.3* |

  Grammar is `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$` — mirror it exactly, not a looser
  `\d+\.\d+`. Discovery: `GET /help/workflows/schema-version/versions` →
  `{"current":"1.3","supported":[{"major":1,"minMinor":1,"maxMinor":3}]}`.

  **The `"0.8"` dialect gains two new required-by-design fields** on `CyodaDialect`:
  `schemaVersionTag: "1.3"` (consumed by `defaultNewWorkflow` at workflow-*creation*
  time, before any tree exists to transform) and `acceptedSchemaVersions:
  [{ major: 1, minMinor: 1, maxMinor: 3 }]` (consumed by the semantic validator; the
  array shape mirrors the discovery endpoint, allowing a future multi-major
  deprecation window without a shape change). `schemaVersionTag` is **required** on
  the `CyodaDialect` interface, deliberately — it breaks compilation for any
  host-registered custom dialect rather than silently inheriting a wrong default.

  **Export restamps the tag to `1.3` unconditionally, regardless of what was
  imported.** The editor's own policy differs on purpose: it **preserves an
  existing tag verbatim** on parse (rewriting it would churn files the user didn't
  otherwise change — the server restamps on export anyway) and only stamps a fresh
  `1.3` onto brand-new workflows. A stale `"1.0"` tag is a **warning**
  (`workflow-schema-version-outdated`) with an offered fix, not a blocking error —
  the file needs to be *openable* in order to fix it, and silent rewriting isn't
  acceptable either. Malformed/out-of-range tags (`"1"`, `"2.0"`, `"1.4"`, …) *are*
  blocking errors (`workflow-schema-version-malformed`), because those can never be
  legally imported as-is. An absent/empty tag never reaches the semantic layer at
  all — `WorkflowSchema.version` is a required, non-empty Zod string, so those fail
  at parse time.

  Do not confuse this axis with the dialect version (`"0.8"`) — see "Two distinct
  version axes" at the top of this file. This change puts the tag axis's data
  (`schemaVersionTag`, `acceptedSchemaVersions`) on the dialect-axis object
  (`CyodaDialect`); the two `MAJOR.MINOR` strings mean entirely different things and
  it is easy to conflate them when reading `dialect.ts`.

- **`startNewTxOnDispatch` lives inside `config`, not at processor level — both the
  OpenAPI and `cyoda help workflows` place it wrong.**

  > **Docs disagreement — the most serious one found this release, and the reason
  > this file's opening warning exists.** `cyoda help workflows` describes it as a
  > sibling field on the processor object; the OpenAPI's
  > `ExternalizedProcessorDefinitionDto.startNewTxOnDispatch` agrees. **Both are
  > wrong.** Confirmed against the wire:
  >
  > | Payload | Server |
  > |---|---|
  > | `startNewTxOnDispatch` at processor level | 400 `BAD_REQUEST: unknown field "startNewTxOnDispatch"` |
  > | `startNewTxOnDispatch` inside `config` | **accepted** |
  > | inside `config`, `true`, but `executionMode: "SYNC"` | 400 `VALIDATION_FAILED: only valid with executionMode=COMMIT_BEFORE_DISPATCH` |
  >
  > The server's own export confirms the position:
  > `"config":{"attachEntity":true,"calculationNodesTags":"t","startNewTxOnDispatch":true}`.

  The editor had this field at processor level (matching the wrong docs), and both
  directions were broken as a result: **serialize** emitted it where 0.8.3
  hard-rejects it (every workflow with a `COMMIT_BEFORE_DISPATCH` processor was
  unimportable), and **parse** silently dropped it from a real 0.8.3 export with
  zero errors or warnings (Zod strips unknown keys from the config intersection —
  silent data loss on the library's core round-trip promise). This was a
  pre-existing defect surfaced by 0.8.3 testing, not something 0.8.3 changed; it is
  fixed unconditionally as part of this release. Field moved from
  `ExternalizedProcessor`/`PROCESSOR_FIELDS`/`outputExternalizedProcessor` into
  `ExternalizedProcessorConfig`/`PROCESSOR_CONFIG_FIELDS`/`outputExternalizedConfig`;
  `start-new-tx-without-commit-before-dispatch` retargeted to `config` and
  **promoted from warning to error** (the server hard-400s, so a warning was waving
  through a guaranteed rejection).

  **Lesson for the next dialect author, stated generally: probe the binary, not the
  OpenAPI.** The generated schema is wrong here, and `cyoda help` repeats the same
  error — a bundled doc and a generated schema agreeing with each other is not
  independent confirmation, since both plausibly come from the same source
  annotation. Verify anything structural (field placement, nesting) against a real
  request/response, not against either document.

- **Processor `type` is stored and returned verbatim — no longer a fixed literal.**
  0.8.3 round-trips whatever string was imported, **including `"internalized"`**,
  which is accepted at import and rejected only later, at dispatch
  (`WORKFLOW_FAILED`). The canonical `ExternalizedProcessor.type` widens from
  `z.literal("externalized")` to a preserved `string`. `coerceCanonicalDefaults`
  keeps defaulting an **absent** `type` to `"externalized"` (filling an absent value
  with the server's documented default isn't lossy) but **stops rewriting present
  values** — it previously rewrote e.g. `"EXTERNAL"` → `"externalized"`, which
  silently mutated a value the server preserves untouched.

  Two new non-blocking warnings: `processor-type-non-canonical` (type is neither
  `"externalized"` nor `""` — cyoda-go's own docs warn this permissiveness "will
  narrow in a future release") and the stronger `processor-type-internalized`
  (imports cleanly, guaranteed to fail at dispatch). A third,
  `processor-config-keys-dropped`, covers the half this widening does **not** fix:
  preserving `type` says nothing about `config` — `DisallowUnknownFields` still
  strips/rejects config keys the schema doesn't know, so a non-canonical processor's
  *label* survives but its *payload* can still be silently reduced to `{}` by Zod
  (or loudly 400 on import, if reduction can't apply). Don't conflate "the type
  string round-trips" with "the processor round-trips".

  Three UI/downstream consumers were gated on `type === "externalized"` and needed
  auditing separately from the `TransitionSchedule` audit (a different subtree, a
  different set of call sites): `ProcessorForm.tsx` (was rendering non-canonical
  processors as a blank form and **destroying** the preserved type on first edit),
  the two processor-scoped semantic rules gated on the literal (would have silently
  stopped firing for non-canonical types, including the now-error
  `start-new-tx-without-commit-before-dispatch`), and `workflow-graph`'s dominant
  execution-mode summary (was dropping preserved processors from the count).

- **The `"0.7"` dialect is removed.** `SUPPORTED_CYODA_VERSIONS` becomes `["0.8"]`;
  `LATEST_CYODA_VERSION` unchanged. This is a **scope decision, not something 0.8.3
  forced** — 0.7 was legacy ceremony with no known consumers, and its
  conditionality was complicating every other change in this release (most
  concretely, `schemaVersionTag: "1.0"` was the one place `"1.0"` survived as a
  *correct* value; with 0.7 gone, every remaining `"1.0"` in the tree is
  unambiguously stale and safe to restamp). `cyoda-0_7.ts` is deleted in full;
  `coerceCanonicalDefaults` (still needed by `"0.8"`) moved to a neutral module
  before deletion. `getDialect("0.7")` now throws a message naming the removal and
  pointing at a config upgrade, rather than the generic "unknown version" message —
  a deliberate drop should not read like a typo. `registerDialect` is public API, so
  a consumer who still needs 0.7 can register it themselves; this removes *shipped*
  support only.

  Removing a supported version is breaking, and per the 0.x policy in `CLAUDE.md`
  ships in the same `minor` as the rest of this release, at no extra release cost.
  **Follow-up required in `cyoda-dev-console`** (a separate repo, out of scope for
  this package): drop `"0.7"` from the `cyodaGoVersion` union and default new
  projects to `"0.8"`, or that host will pass a version this library no longer
  registers.

  `VersionBadge`/`VersionSwitchModal` (the UI for switching between supported
  versions) are **kept**, rendered read-only when `SUPPORTED_CYODA_VERSIONS.length
  === 1` — worth knowing if a 0.9 dialect returns and that UI needs to come back to
  life rather than be rebuilt.

### Lessons for whoever adds v0.8.4

Three separate places the bundled docs (OpenAPI and/or `cyoda help`) disagreed with
the running binary surfaced in this release alone — more than in every prior
version section of this file combined. In order of how much they cost to find:

1. **`startNewTxOnDispatch`'s placement** — both the OpenAPI *and* `cyoda help`
   agreed with each other, and both were wrong about which object the field lives
   on. This was the costliest: it was missed on the first design pass specifically
   *because* it was checked against the OpenAPI document instead of the wire, and
   the resulting defect was already live (not new to 0.8.3) — every
   `COMMIT_BEFORE_DISPATCH` workflow was silently mis-handled before this release
   caught it.
2. **`delayMs <= 0`'s rejection.** `cyoda help workflows` describes a distinct
   validation rule for `delayMs <= 0` in static mode. Empirically there is no such
   rule — `delayMs <= 0` is folded into the "exactly one mode present" check, and
   the failure the docs describe never actually fires with that wording.
3. **`timeoutMs`'s lower bound.** The OpenAPI declares `minimum: 0`; the binary
   enforces none.

> **Probe the binary, not the OpenAPI.** The generated schema is wrong about
> `startNewTxOnDispatch`'s placement, and `cyoda help` repeats the error. Verify
> anything structural against the wire.
>
> **cyoda-go's presence tests are not "key exists".** `delayMs` is present iff
> `> 0`. Assume every numeric optional may work this way until checked.
>
> **Null-tolerance is broader than any one field suggests.** 0.8.3 accepts `null`
> for essentially every optional field the schema declares — not just inside
> `schedule` (where it was first noticed), but transition `criterion` /
> `processors` / `annotations` / `disabled`, workflow `desc` / `active` /
> `criterion`, state `transitions`, and so on. The pattern was scoped to `schedule`
> in an early draft of this release's design and had to be widened after review
> found it left an unloadable document (`criterion: null`) that another new rule
> (the cycle detector) needed to be able to see. Test null-tolerance against the
> whole optional-field surface, not just the field you're currently adding — a
> scoped fix here tends to be an undercount.

Also worth carrying forward: verification for this release re-ran the same claim
tables against the binary across three independent review rounds, and in every
round the defects clustered in whatever had been written most recently, while older
material held. A section's having survived one review pass is weak evidence about
whatever gets written after it — re-verify the newest material hardest, not
evenly.

## v0.8.4 (dialect `"0.8"`)

The `"0.8"` dialect is extended **in place** to target cyoda-go **0.8.4** (workflow
schema tag `1.3` → `1.4`, dual-shape: `1.1`–`1.4` accepted, nothing retired). Ships
as a Changesets **`minor`** per the 0.x policy — `ArrayCriterion` and
`LifecycleCriterion` widen, which is a canonical-model change.

Every claim below was probed against a **running 0.8.4 binary**
(`e861154`, built 2026-09-09) via `POST …/workflow/import` / `GET …/workflow/export`.
The 0.8.4 release is dominated by search/storage work; the workflow-config deltas
are all in **criterion validation at import**, plus the tag bump.

- **Schema tag `1.4`.** `GET /help/workflows/schema-version/versions` →
  `{"current":"1.4","supported":[{"major":1,"minMinor":1,"maxMinor":4}]}`. The
  export restamps every workflow to `1.4`. Before this change the editor capped the
  range at `1.3`, so **every workflow exported from a 0.8.4 server opened with a
  blocking `workflow-schema-version-malformed` error**. New workflows are now
  stamped `1.4`. Caveat carried by the single-dialect-per-MAJOR.MINOR design: a
  `1.4`-stamped new workflow is rejected by a 0.8.3 server (*too new*); users on
  0.8.3 must keep the tag at `1.3` (the editor accepts both).

- **`NOT` group operator implemented.** Takes **exactly one** child; `0` or `2+` is
  `400 VALIDATION_FAILED` ("NOT requires exactly one condition, got N"). Not gated by
  the tag — `NOT` in a workflow tagged `1.1` imports fine. The editor already
  modelled `NOT`; `unsupported-group-operator` is **removed** and
  `not-with-multiple-conditions` is **promoted to error** (and now also fires for
  zero children). `SUPPORTED_GROUP_OPERATORS` gains `"NOT"`. `AND`/`OR` with zero
  conditions is still accepted by the server (Zod keeps `min(1)`; unchanged).
  Group operators are case-sensitive (`"or"` → 400); the Zod enum already was.

- **Criterion `jsonPath` must be JSON Path — checked at import.** Grammar
  (`docs/cloud-parity/path-grammar.md`):
  `"$." segment ("." segment)*`, `segment = name subscript*`,
  `name = 1*(ALPHA / DIGIT / "_" / "-")` (ASCII), `subscript = "[" ("*" / 1*DIGIT) "]"`,
  index ≤ int32 max. `validateJsonPathSubset` now mirrors it exactly. Two
  corrections in **opposite directions**:

  | Path | Server | Editor before |
  |---|---|---|
  | `$` (bare root) | 400 | accepted → now `bare-root` |
  | `$.tags[2147483648]` | 400 | accepted → now `index-out-of-range` |
  | `$.0a`, `$.-a`, `$.0-a[01]` | **accepted** | rejected (segment had to start with a letter/`_`) — the editor was *stricter than the server* |

  The check covers `simple`/`array` clauses at any depth. **Not** checked inside a
  `function` criterion's quick-exit `criterion` (a bare path there imports fine);
  the editor still flags it — pre-existing, harmless strictness.

- **Array clauses: `values`, not `value` — a pre-existing defect, fixed here.**

  > **Docs disagreement.** The OpenAPI's `ArrayConditionDto` declares `value` and
  > `operatorType`. The actual parser (`cyoda-go-spi` `predicate/parse.go`
  > `parseArray`, unchanged since at least 0.8.1) reads **only `jsonPath` and
  > `values`**. Confirmed against the wire: an array clause written with `value`
  > imports with **200** and is stored verbatim, but it carries **no positional
  > tests, so it matches every entity** (verified: an entity whose tags fail the
  > clause still advanced through the guarded transition; with `values` it did not).

  The editor wrote `value` — so **every array criterion the editor ever saved was
  an always-true guard on cyoda-go.** Fixed: `normalizeOperatorAlias` maps wire
  `values` → canonical `value` (legacy `value` still parses; both present and
  different → `SchemaError`), and `outputCriterion` emits `values`. The canonical
  field name stays `value` to avoid churn in downstream packages.

  Other array-clause facts from the binary and `cyoda help search`:
  - `values` are **positional**: `values[i]` is compared (equality) against element
    `i`; a `null` entry skips that index. The server **ignores `operatorType`**
    entirely. `ArrayCriterion.operation` is therefore optional (preserved for
    round-trip); `value` widens from `string[]` to `(string | number | boolean | null)[]`
    (`ArrayCriterionValue`). An object entry → 400 (`array-non-scalar-value`, which
    replaces the old `array-non-string-value`).
  - `jsonPath` must **end in `[*]`**: `$.tags`, `$.tags[0]` and `$.items[*].sku` are
    all 400 → new error `array-path-not-wildcard`.

- **Lifecycle fields widened.** Accepted: `state`, `creationDate`, `lastUpdateTime`,
  `transitionForLatestSave` (alias `previousTransition`), `transactionId`, `id`;
  anything else → 400 *unknown meta filter field*. The canonical enum
  (`LIFECYCLE_FIELDS`, `LifecycleField`) previously held only three, so a
  server-valid criterion on e.g. `lastUpdateTime` **failed to parse at all**.
  `previousTransition` / `transitionForLatestSave` are preserved verbatim, not
  normalized to one spelling.

- **Temporal lifecycle fields (`creationDate`, `lastUpdateTime`).** Only
  `EQUALS NOT_EQUAL GREATER_THAN LESS_THAN GREATER_OR_EQUAL LESS_OR_EQUAL BETWEEN
  BETWEEN_INCLUSIVE IS_NULL NOT_NULL` are accepted (mirrors `match.IsTemporalOperator`);
  anything else → 400 → warning `lifecycle-temporal-operator`. A comparison operand
  must parse as temporal → warning `lifecycle-temporal-operand` (a JS approximation
  of the server parser; calibrated: `2026`, `2026-01`, `2026-01-01`,
  `2026-01-01T10:00Z`, `…T00:00:00.123+02:00`, `10:00`, `10:00:00.5` accepted;
  `1700000000`, numbers, booleans, `2026-01-01 10:00:00`, `…+0200`, `10:00:00Z`,
  `2026-1-1`, `2026-01-01T10` rejected).

- **Operators checked at import.** Unknown `operatorType` (any casing mismatch
  included) → 400; the server's list is exactly the editor's 26
  `SUPPORTED_SIMPLE_OPERATORS`. `IS_CHANGED`/`IS_UNCHANGED` → 400 too. Both
  `operator-not-recognized` and `unsupported-operator` **stay warnings**: the
  shared (Cloud-parity) OpenAPI declares 66 operators (e.g. `IN_SET`, `REGEXP`)
  of which cyoda-go implements 26, so these are treated as backend-conditional per
  `docs/validation-rules.md`. Messages now name the split.

- **Pattern operands checked at import.**
  - `LIKE` ending in an unpaired `\` → 400 (applies to `simple` and `lifecycle`).
    Exact mirror → error `like-pattern-invalid`. `LIKE` is now a glob, not a regex:
    `\d` is a literal `d`, `%`/`_` match newlines — runtime semantics, nothing to
    model.
  - `MATCHES_PATTERN` must compile as RE2 in the anchored form `\A(?:p)\z`: an
    unterminated `\Q`, `a(`, lookaround and backreferences → 400. JS cannot
    reproduce RE2, so warning `matches-pattern-invalid` (flags lookaround,
    backrefs, unterminated `\Q`, then a JS compile after rewriting `(?P<`/inline
    flags).

- **`function` criterion inside a `group`.** Imports cleanly but fails at
  evaluation ("must be the whole criterion") → warning `function-criterion-in-group`.

- **Runtime-only changes (nothing to model, worth knowing):** workflow selection is
  re-evaluated on every engine door (not just creation), so an entity can re-bind to
  another workflow when its payload changes — select on immutable fields; a
  criterion naming a field the model doesn't declare now fails the save with
  `400 WORKFLOW_FAILED` instead of evaluating false (import still accepts it); a
  `[*]`-terminated path now addresses elements, not the array length; `NOT` over a
  wildcard is universal; `NOT_EQUAL` on an unsatisfiable operand now matches.
  Processor-returned data is validated against the model.

- **Unchanged wire shapes** (verified): simple/lifecycle clauses accept
  `operation` as a legacy alias of `operatorType` and the export echoes whichever
  was sent; the export drops an empty `transitions` array (`"B": {}`), which the
  editor already defaults.

Golden coverage: `tests/golden/fixtures/criteria-0_8_4.json` (editor output,
byte-identical round-trip, **accepted by the 0.8.4 server**) and
`tests/dialect/fixtures/cyoda-0_8_4-export.json` (a verbatim server export that must
open with no warnings).

No `cyoda-dev-console` `cyodaGoVersion` change is needed — the dialect key is still
`"0.8"`; the console only needs the dependency bump.
