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

4. **If the canonical model changes → major bump + coordinated updates.**
   Changing the canonical model (`src/schema/*`, `src/types/*`) is a **major**
   `@cyoda/workflow-core` bump. It requires coordinated updates in the
   downstream packages that consume the model:
   `workflow-react`, `workflow-graph`, `workflow-layout`, `workflow-monaco`,
   `workflow-viewer`, and the `cyoda-dev-console` host app. Do not land the core
   change without scheduling those follow-ups.

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
