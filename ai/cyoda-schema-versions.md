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

1. **Acquire the authoritative schema.** Run that cyoda-go version. Capture
   `cyoda help openapi yaml` and `cyoda help workflows`, then do a **live
   import/export round-trip**: create a model, import a representative workflow,
   `GET …/workflow/export`, and record the exact wire shape (processor `type`
   casing, criterion operator key, optional-field omission, etc.).
2. **Implement the dialect.** Add `src/dialect/cyoda-<v>.ts` exporting a
   `CyodaDialect`. Implement only the **deltas** vs canonical in `toCanonical`
   (wire → canonical) and `workflowsToWire` (canonical → wire); reuse the 0.7
   helpers where the shape matches.
3. **Per-version validation (if needed).** If the engine's rules differ (e.g. a
   different operator catalogue), branch the relevant checks in
   `src/validate/semantic.ts` on the dialect version. With a single dialect today
   there is nothing to branch.
4. **Register it.** `registerDialect` in `src/dialect/index.ts` and add the
   version to `SUPPORTED_CYODA_VERSIONS` (and `LATEST_CYODA_VERSION` if newer).
5. **Test it.** Add golden round-trip fixtures built from a **real export** of
   that binary, plus a parse→serialize byte-identity test under
   `tests/dialect/` or `tests/golden/`.

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

- **Name length cap: 256 characters.** Workflow, state, transition, and
  processor names must be ≤ 256 chars (`NAME_MAX_LENGTH`). Enforced in
  `NameSchema` and mirrored as a `name-too-long` semantic error so the editor
  blocks a save before the server returns a 400. Referential-integrity
  constraints v0.8.0 enforces (`initialState` exists, each `next` is a valid
  state, no duplicate transition names per state, no duplicate workflow names)
  were already surfaced by the semantic validator.

`ParseResult` gained an optional `warnings: string[]` field (additive; existing
call sites are unaffected) carrying the dialect's `toCanonical` notes.
