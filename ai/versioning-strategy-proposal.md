# Cyoda Dev Console — Workflow Versioning Strategy

**Status:** Draft v4 — simplified after Paul's clarification on scheduled processors  
**Date:** 2026-06-16  
**Author:** Patrick Stanton  
**Scope:** Support cyoda-go v0.7.0 minimum. v0.8.0 not yet released.

---

## Clarifications (from Paul Schleger, 2026-06-16)

- **Scheduled processors in v0.7 were never officially supported** — using `{type:"scheduled"}` was a hack on the platform. No real workflows in production use them. There is no migration path needed and no backward-compat obligation for this feature.
- **`transitions[].schedule` in v0.8.0 is a schema/SPI placeholder only** — the scheduling runtime has not been implemented. You can configure and import a scheduled transition, but the workflow engine ignores it; trying to fire one in a save returns 400 BAD_REQUEST. Full scheduling implementation is planned but not yet scheduled (no pun intended).
- **v0.8.0 has not been released yet** — there is time to prepare the editor and dev-console before it ships.

---

## What Actually Needs to Change

The scope is now much simpler. Three things, in order of urgency:

### 1. Remove `scheduled` processor from the canonical model (required, `workflow-core`)

`ScheduledProcessorSchema` and its UI should be removed from `workflow-core`. It was modelling an unsupported hack. The Zod `ProcessorSchema` discriminated union becomes `externalized`-only, which matches v0.8.0 exactly.

The v0.7 dialect's `toCanonical` should silently drop any `{type:"scheduled"}` processors it encounters (with a validation warning surfaced to the user: "Scheduled processors are no longer supported and have been removed"). `workflowsToWire` no longer needs to emit them.

### 2. Add `transitions[].schedule` to the canonical model (required for v0.8.0 compatibility, `workflow-core`)

Add `TransitionScheduleSchema` as an optional field on `TransitionSchema`:

```ts
const TransitionScheduleSchema = z.object({
  delayMs: z.number().int().positive(),
  timeoutMs: z.number().int().positive().optional(),
});
// TransitionSchema gets: schedule: TransitionScheduleSchema.optional()
```

This field should be read/write in the editor (so developers can configure it) but the inspector should display a clear notice that scheduling is not yet active in the runtime ("Scheduled transitions can be configured but are not yet executed by the workflow engine").

The v0.8.0 dialect's `toCanonical` passes `transitions[].schedule` through unchanged. The v0.7 dialect's `toCanonical` ignores it (the field doesn't exist in v0.7 wire format).

### 3. Strict unknown-field rejection (required for v0.8.0, `workflow-core` output hygiene)

v0.8.0's import handler uses `DisallowUnknownFields` — any unexpected key at any nesting level returns 400. The `workflowsToWire` output for the v0.8.0 dialect must be provably clean: only known fields, no editor metadata leaking through.

This is mostly already handled by `serializeImportPayload` (which strips editor metadata via `doc.meta.workflowUi`), but the v0.8.0 dialect's `workflowsToWire` should explicitly allowlist output fields rather than passing through the canonical object shape. The new tighter validation constraints (names ≤ 256 chars, referential integrity) should also be mirrored in the editor's validation so developers get feedback before hitting a 400 from the server.

---

## Two-Dialect Design

The dialect architecture already exists in `workflow-core`. We need two dialects properly populated:

| | `cyoda-0_7` | `cyoda-0_8` |
|---|---|---|
| `toCanonical` | Drop any `scheduled` processors (warn); pass `externalized` processors through; handle operator aliases | Compose 0.7's alias/defaults pass; pass `transitions[].schedule` through to canonical |
| `workflowsToWire` | Emit only `externalized` processors (no scheduled); omit `transitions[].schedule` (field doesn't exist in v0.7) | Emit `externalized` processors; emit `transitions[].schedule` if present; strict field allowlist |

The 0.7 dialect's `workflowsToWire` omitting `transitions[].schedule` means a file edited in v0.8 mode and then saved to a v0.7 project will silently lose the schedule configuration. This should be surfaced as a validation warning when a project is in v0.7 mode but the workflow contains a `schedule` field.

---

## Dev Console Changes

### Version selection (unchanged from previous draft)

Add `cyodaGoVersion: "0.7" | "0.8"` to `DevProject` in `workflow-project-model`. Default to `"0.8"` for new projects once v0.8.0 releases. Surface in first-run wizard and project settings.

Thread to all five `parseImportPayload` call sites:
- `workflow-editor-host/src/useEditorSession.ts:59` (initial load)
- `workflow-editor-host/src/useEditorSession.ts:124` (revert)
- `apps/dev-console/src/routes/workflow.tsx:122` (AI apply)
- `apps/dev-console/src/assistant/applyWorkflow.ts:17` (AI apply)
- `packages/workflow-file-indexer/src/classifier.ts:28` (file tree scan)

All five must use the same version or the file tree and editor will disagree.

### File status taxonomy

```ts
type WorkflowFileStatus =
  | "valid-workflow"
  | "valid-workflow-legacy"    // loaded OK using 0.7 dialect
  | "invalid-workflow"
  | "incompatible-version"     // no supported dialect can parse this
  | "json-not-workflow"
  | "parse-error";
```

---

## Save-Back Version (agreed)

Preserve original version on save. A project configured as v0.7 saves v0.7 wire format; v0.8 saves v0.8 wire format. Explicit "Upgrade to v0.8" action to be added later.

---

## What's No Longer a Risk

- ~~Migration path for `config.transition` field~~ — no real workflows use scheduled processors; nothing to migrate.
- ~~Lossy upgrade concern~~ — dropping unsupported features is intentional, not lossy.
- ~~v0.7 dialect must preserve scheduled processors on save-back~~ — nobody used them; just drop with a warning.
- ~~Breaking change urgency~~ — v0.8.0 hasn't shipped yet; there's time to coordinate.

---

## Remaining Risks

| Risk | Detail |
|---|---|
| Canonical model change is a `workflow-core` major bump | Removing `ScheduledProcessorSchema` from the canonical model changes the exported types; `workflow-react`, `workflow-editor-host`, and the Tauri app all need coordinated updates |
| `workflow-react` UI needs updating | The scheduled processor inspector panel should be removed; a `schedule` field editor should be added to the transition inspector. Both should note the feature is not yet active in the runtime. |
| All five call sites must be updated together | If classifier and editor use different versions, file tree and editor disagree on validity |
| Documentation | `ai/cyoda-schema-versions.md` in `workflow-editor` needs a v0.8.0 section; cyoda Help docs for v0.8.0 (Paul to verify) need to cover the scheduler placeholder status |

---

## Implementation Order

1. **`workflow-core`:** remove `ScheduledProcessorSchema`, add `TransitionScheduleSchema` to `TransitionSchema`, update 0.7 dialect (`toCanonical` drops scheduled processors with warning), write 0.8 dialect, tighten validation to mirror v0.8.0 server constraints. Major version bump.

2. **`workflow-react`:** remove scheduled processor UI from processor inspector; add `schedule` field editor on transition inspector with "not yet active" notice.

3. **`cyoda-dev-console`:** add `cyodaGoVersion` to `DevProject`, thread to all 5 call sites, update file status taxonomy, surface version selector in wizard and project settings.

4. **Documentation:** update `ai/cyoda-schema-versions.md`; coordinate with Paul on cyoda Help coverage of the scheduler placeholder.
