# Processor Editing Discovery

Date: 2026-05-17

Scope: discovery only. No implementation changes were made.

## Runtime Context

Local `cyoda-go` was reachable at `http://127.0.0.1:8080` after allowing localhost access from the sandbox.

Observed runtime help:

- Version from `/api/help`: `0.7.1`
- Workflow import endpoint: `POST /api/model/{entityName}/{modelVersion}/workflow/import`
- Workflow export endpoint: `GET /api/model/{entityName}/{modelVersion}/workflow/export`
- Model import endpoint used for throwaway setup: `POST /api/model/import/JSON/SAMPLE_DATA/{entityName}/{modelVersion}`
- Model delete endpoint used for cleanup: `DELETE /api/model/{entityName}/{modelVersion}`

Throwaway models used and deleted:

- `codex-processor-probe-20260517164432:1`
- `codex-processor-probe2-20260517164516:1`
- `codex-processor-probe3-1779036344028:1`

All cleanup calls returned `200` with `success: true`.

## Runtime DTO Findings

`/api/help` workflow docs say processor type support is exhaustive for `v0.6.1` and list only:

- `"EXTERNAL"`

However `/openapi.json` contains these schemas:

- `ExternalizedProcessorDefinitionDto`
- `ScheduledTransitionProcessorDefinitionDto`
- `ScheduledTransitionConfigDto`

OpenAPI does not enumerate the processor `type` discriminator literal. `ScheduledTransitionConfigDto` has:

```json
{
  "delayMs": "integer int64, required",
  "transition": "string, required",
  "timeoutMs": "integer int64, optional"
}
```

Externalized processor OpenAPI enum values:

```json
["SYNC", "ASYNC_SAME_TX", "ASYNC_NEW_TX", "COMMIT_BEFORE_DISPATCH"]
```

The repo currently only models:

```ts
type ExecutionMode = "SYNC" | "ASYNC_SAME_TX" | "ASYNC_NEW_TX";
type Processor = ExternalizedProcessor | ScheduledProcessor;
```

This is stale relative to runtime because it omits `COMMIT_BEFORE_DISPATCH`.

## Probe Payload Shape

Every probe used this workflow wrapper, with only `workflows[0].name` and the `processors` array changed per case:

```json
{
  "importMode": "MERGE",
  "workflows": [
    {
      "version": "1",
      "name": "wf_CASE_ID",
      "initialState": "NEW",
      "active": true,
      "states": {
        "NEW": {
          "transitions": [
            {
              "name": "START",
              "next": "WAITING",
              "manual": true,
              "disabled": false,
              "processors": ["PROCESSOR_UNDER_TEST"]
            }
          ]
        },
        "WAITING": {
          "transitions": [
            {
              "name": "FINISH",
              "next": "DONE",
              "manual": true,
              "disabled": false
            }
          ]
        },
        "DONE": {
          "transitions": []
        }
      }
    }
  ]
}
```

Throwaway model setup payload:

```json
{ "probe": true, "value": 1 }
```

Setup response shape:

```json
{
  "status": 200,
  "body": "UUID_STRING"
}
```

Workflow import response for every case below:

```json
{
  "status": 200,
  "body": { "success": true }
}
```

## Probe Results

### Scheduled Type Literals

All tested scheduled-like literals were accepted by workflow import, but the scheduled config was not preserved on export. Exported processors retained `type` and `name`, but returned `config: {}`.

| Case | Processor payload | Import | Exported processor |
|---|---|---:|---|
| `scheduled` | `{ "type": "scheduled", "name": "proc_scheduled", "config": { "delayMs": 1000, "transition": "FINISH", "timeoutMs": 1000 } }` | 200 | `{ "type": "scheduled", "name": "proc_scheduled", "config": {} }` |
| `SCHEDULED` | `{ "type": "SCHEDULED", "name": "proc_SCHEDULED", "config": { "delayMs": 1000, "transition": "FINISH", "timeoutMs": 1000 } }` | 200 | `{ "type": "SCHEDULED", "name": "proc_SCHEDULED", "config": {} }` |
| `SCHEDULED_TRANSITION` | `{ "type": "SCHEDULED_TRANSITION", "name": "proc_SCHEDULED_TRANSITION", "config": { "delayMs": 1000, "transition": "FINISH", "timeoutMs": 1000 } }` | 200 | `{ "type": "SCHEDULED_TRANSITION", "name": "proc_SCHEDULED_TRANSITION", "config": {} }` |
| `scheduledTransition` | `{ "type": "scheduledTransition", "name": "proc_scheduledTransition", "config": { "delayMs": 1000, "transition": "FINISH", "timeoutMs": 1000 } }` | 200 | `{ "type": "scheduledTransition", "name": "proc_scheduledTransition", "config": {} }` |
| `ScheduledTransition` | `{ "type": "ScheduledTransition", "name": "proc_ScheduledTransition", "config": { "delayMs": 1000, "transition": "FINISH", "timeoutMs": 1000 } }` | 200 | `{ "type": "ScheduledTransition", "name": "proc_ScheduledTransition", "config": {} }` |

Additional scheduled placement checks:

| Case | Processor payload | Import | Exported processor |
|---|---|---:|---|
| top-level timing fields | `{ "type": "SCHEDULED_TRANSITION", "name": "sched_top", "delayMs": 1000, "transition": "FINISH", "timeoutMs": 1000 }` | 200 | `{ "type": "SCHEDULED_TRANSITION", "name": "sched_top", "config": {} }` |
| no type, scheduled-looking config | `{ "name": "sched_no_type", "config": { "delayMs": 1000, "transition": "FINISH", "timeoutMs": 1000 } }` | 200 | `{ "type": "", "name": "sched_no_type", "config": {} }` |
| no config | `{ "type": "SCHEDULED_TRANSITION", "name": "sched_empty" }` | 200 | `{ "type": "SCHEDULED_TRANSITION", "name": "sched_empty", "config": {} }` |

Conclusion: import acceptance is too permissive to identify a reliable scheduled wire literal. Since the runtime drops scheduled config on export, scheduled processors should be treated as not production-ready for editor support in this repo until Cyoda runtime fixes or documents the exact persistable scheduled wire contract.

### Duplicate Processor Names

External duplicate payload:

```json
[
  {
    "type": "EXTERNAL",
    "name": "dup",
    "executionMode": "SYNC",
    "config": {
      "calculationNodesTags": "probe",
      "responseTimeoutMs": 0,
      "context": "probe"
    }
  },
  {
    "type": "EXTERNAL",
    "name": "dup",
    "executionMode": "SYNC",
    "config": {
      "calculationNodesTags": "probe",
      "responseTimeoutMs": 0,
      "context": "probe"
    }
  }
]
```

Response:

```json
{ "status": 200, "body": { "success": true } }
```

Export preserved both duplicate names.

Scheduled duplicate payload:

```json
[
  {
    "type": "SCHEDULED_TRANSITION",
    "name": "dup_sched",
    "config": { "delayMs": 1000, "transition": "FINISH" }
  },
  {
    "type": "SCHEDULED_TRANSITION",
    "name": "dup_sched",
    "config": { "delayMs": 1000, "transition": "FINISH" }
  }
]
```

Response:

```json
{ "status": 200, "body": { "success": true } }
```

Export preserved both duplicate names but stripped both scheduled configs.

Conclusion: runtime accepts duplicate processor names on the same transition. The editor should still block duplicates because the current core semantic validator already treats them as errors and unique names are safer for selection, audit, and support.

### `delayMs` Acceptance

All `delayMs` cases used:

```json
{
  "type": "SCHEDULED_TRANSITION",
  "name": "sched",
  "config": { "...": "..." }
}
```

| Case | Config payload | Import | Exported config |
|---|---|---:|---|
| missing `delayMs` | `{ "transition": "FINISH", "timeoutMs": 1000 }` | 200 | `{}` |
| `delayMs = 0` | `{ "delayMs": 0, "transition": "FINISH", "timeoutMs": 1000 }` | 200 | `{}` |
| `delayMs = -1` | `{ "delayMs": -1, "transition": "FINISH", "timeoutMs": 1000 }` | 200 | `{}` |
| `delayMs = 1000` | `{ "delayMs": 1000, "transition": "FINISH", "timeoutMs": 1000 }` | 200 | `{}` |

Conclusion: runtime import does not reject missing, zero, negative, or positive `delayMs`, but also does not preserve any of these values. Editor validation should not infer validity from this import behavior.

### `timeoutMs` Acceptance

All `timeoutMs` cases used:

```json
{
  "type": "SCHEDULED_TRANSITION",
  "name": "sched",
  "config": { "...": "..." }
}
```

| Case | Config payload | Import | Exported config |
|---|---|---:|---|
| omitted `timeoutMs` | `{ "delayMs": 1000, "transition": "FINISH" }` | 200 | `{}` |
| `timeoutMs = 0` | `{ "delayMs": 1000, "transition": "FINISH", "timeoutMs": 0 }` | 200 | `{}` |
| `timeoutMs = -1` | `{ "delayMs": 1000, "transition": "FINISH", "timeoutMs": -1 }` | 200 | `{}` |

Conclusion: runtime import accepts omitted, zero, and negative timeout values for scheduled-looking processors, but scheduled config is dropped on export.

### Invalid `executionMode`

Payload:

```json
{
  "type": "EXTERNAL",
  "name": "bad_exec",
  "executionMode": "BOGUS_MODE",
  "config": {
    "attachEntity": false,
    "calculationNodesTags": "probe",
    "responseTimeoutMs": 0,
    "retryPolicy": "",
    "context": "probe"
  }
}
```

Response:

```json
{ "status": 200, "body": { "success": true } }
```

Export:

```json
{
  "type": "EXTERNAL",
  "name": "bad_exec",
  "executionMode": "BOGUS_MODE",
  "config": {
    "calculationNodesTags": "probe",
    "context": "probe"
  }
}
```

Conclusion: invalid `executionMode` is accepted at import and preserved. Runtime docs explicitly say invalid values fall into an engine default branch and are undefined behavior. The editor must block invalid execution modes.

### Externalized Processor Config Preservation

Payload:

```json
{
  "type": "EXTERNAL",
  "name": "unknown_cfg",
  "executionMode": "SYNC",
  "config": {
    "calculationNodesTags": "probe",
    "responseTimeoutMs": 1000,
    "context": "ctx",
    "unknownKey": "keep?"
  }
}
```

Response:

```json
{ "status": 200, "body": { "success": true } }
```

Export:

```json
{
  "type": "EXTERNAL",
  "name": "unknown_cfg",
  "executionMode": "SYNC",
  "config": {
    "calculationNodesTags": "probe",
    "responseTimeoutMs": 1000,
    "context": "ctx"
  }
}
```

Unknown config keys are stripped by runtime export. Do not provide an arbitrary advanced config editor unless the core model intentionally preserves known-but-not-structured Cyoda fields. Use `context` as the only free-form parameterization field.

`responseTimeoutMs = -1` was accepted and preserved for external processors:

```json
{
  "type": "EXTERNAL",
  "name": "bad_timeout",
  "executionMode": "SYNC",
  "config": {
    "calculationNodesTags": "probe",
    "responseTimeoutMs": -1,
    "context": "ctx"
  }
}
```

Editor validation should block negative response timeouts even though runtime import accepts them.

`COMMIT_BEFORE_DISPATCH` was accepted and preserved:

```json
{
  "type": "EXTERNAL",
  "name": "commit_proc",
  "executionMode": "COMMIT_BEFORE_DISPATCH",
  "startNewTxOnDispatch": true,
  "config": {
    "attachEntity": true,
    "calculationNodesTags": "probe",
    "responseTimeoutMs": 1000,
    "retryPolicy": "retry-x",
    "context": "ctx",
    "unknownKey": "keep?"
  }
}
```

Export preserved `executionMode` and known config fields, stripped `unknownKey`, and did not export `startNewTxOnDispatch` in this probe.

## Repo Discovery

### Existing Core Model

Relevant files:

- `packages/workflow-core/src/types/processor.ts`
- `packages/workflow-core/src/schema/processor.ts`
- `packages/workflow-core/src/normalize/input.ts`
- `packages/workflow-core/src/normalize/output.ts`
- `packages/workflow-core/src/patch/apply.ts`
- `packages/workflow-core/src/patch/invert.ts`
- `packages/workflow-core/src/validate/semantic.ts`

Current processor domain support:

- `externalized`
- `scheduled`
- `addProcessor`
- `updateProcessor`
- `removeProcessor`
- `reorderProcessor`
- duplicate processor name semantic error
- scheduled missing target semantic error
- scheduled unresolved target warning
- crossover without `asyncResult` warning

Current core gaps versus runtime:

- Runtime wire type for external processors is `EXTERNAL`; core serializes `externalized`.
- Runtime accepts/preserves `COMMIT_BEFORE_DISPATCH`; core rejects it at schema/type level.
- Runtime supports or at least advertises `startNewTxOnDispatch`; core has no field for it.
- Core scheduled processor model serializes `type: "scheduled"` with `config.delayMs`, `config.transition`, and `config.timeoutMs`, but local runtime drops scheduled config for every tested literal.
- `outputExternalizedProcessor` omits `executionMode` when it is `ASYNC_NEW_TX`; the requested UX says always emit execution mode explicitly. Runtime also preserves explicit `ASYNC_NEW_TX` when provided, so the serializer should stop omitting it if this task proceeds.
- Zod object schemas strip unknown keys. Runtime export also strips unknown external config keys.

### Existing React UI

Relevant files:

- `packages/workflow-react/src/inspector/TransitionForm.tsx`
- `packages/workflow-react/src/inspector/ProcessorForm.tsx`
- `packages/workflow-react/src/inspector/Inspector.tsx`
- `packages/workflow-react/src/state/store.ts`
- `packages/workflow-react/src/i18n/en.ts`

Current UI behavior:

- Transition inspector has a processor section.
- Processor editing is inline and cramped, not modal-based.
- Add processor immediately dispatches an `addProcessor` patch, so Cancel/discard semantics do not exist.
- Existing form dispatches each field edit immediately, so a single logical edit can create multiple undo steps.
- Existing type switcher allows scheduled processors.
- Existing execution mode list omits `COMMIT_BEFORE_DISPATCH`.
- Existing scheduled timing fields expose raw milliseconds as primary UI.
- Existing calculation node tags are a plain text field, not chips/tags.
- Existing async crossover field is not disabled when `asyncResult` is false.

### Existing Undo/Patch Fit

`useEditorStore` already computes exact inverse patches for `addProcessor` by diffing minted UUIDs after apply. `updateProcessor`, `removeProcessor`, and `reorderProcessor` also have inverse support.

Recommended patch behavior for the modal:

- Add: dispatch exactly one `addProcessor` patch on Apply.
- Edit: dispatch exactly one `updateProcessor` patch on Apply.
- Delete: dispatch one `removeProcessor` patch.
- Duplicate: dispatch one `addProcessor` patch with copied processor and collision-free name.
- Reorder: dispatch one `reorderProcessor` patch.

No UI draft state should be written to `doc.session` or `doc.meta`.

### Existing Tests

Current tests touch processor behavior lightly:

- `packages/workflow-react/tests/anchorInspector.test.tsx` has an inline processor editing test.
- `packages/workflow-react/tests/inspectorSelectionSync.test.tsx` verifies adding a processor keeps transition inspector open.
- Core patch inverse tests cover processor add/remove/reorder/update.
- Core semantic tests cover processor parsing and duplicate names.

There is no focused production processor modal test suite yet.

### Demo/Docs State

The top-level README and `packages/workflow-react/README.md` already claim scheduled processor editing support. Based on the runtime probe, that claim is too strong for production support against local `cyoda-go` 0.7.1.

The demo fixtures include lowercase `externalized` and at least one lowercase `scheduled` example. The runtime wire examples and export use uppercase `EXTERNAL`.

## Recommendations for Implementation

### Processor Types

Support in production editor now:

- External processor, using the UI label `externalized` if desired, but mapping to/from the Cyoda runtime wire type deliberately.

Do not support scheduled editing yet as a production feature. The editor may continue to parse existing scheduled JSON for backwards compatibility, but Add/Edit UI should not create scheduled processors until Cyoda provides a persistable scheduled wire literal/config contract. If scheduled processors are shown, mark them unsupported/read-only or behind an explicit experimental guard.

### Runtime Wire Mapping

Before implementation, decide whether the library’s canonical JSON model is:

1. Repo-internal lowercase compatibility model (`externalized`, `scheduled`), or
2. Runtime-native Cyoda model (`EXTERNAL`, and future scheduled literal).

The user requirement says “Do not change the Cyoda workflow JSON model.” Given local runtime export uses `EXTERNAL`, the safest production direction is to preserve runtime-native wire values at serialization boundaries and avoid inventing a new scheduled literal.

### Externalized Validation

Block Apply for:

- missing name
- duplicate processor name within the same transition
- invalid processor type
- missing `executionMode`
- `executionMode` outside `SYNC`, `ASYNC_SAME_TX`, `ASYNC_NEW_TX`, `COMMIT_BEFORE_DISPATCH`
- negative or non-integer `responseTimeoutMs`
- non-integer or negative `crossoverToAsyncMs`
- `crossoverToAsyncMs` set while `asyncResult !== true`
- invalid JSON only if a raw JSON escape hatch is added

Warn for:

- empty `calculationNodesTags`
- `attachEntity === false`
- `ASYNC_NEW_TX` failure semantics
- `COMMIT_BEFORE_DISPATCH` idempotency and segment-boundary visibility
- non-empty `retryPolicy` because it is platform-defined

Always emit `executionMode` explicitly.

### Scheduled Validation

If scheduled support is later confirmed by Cyoda runtime:

- Use the exact runtime-preserved wire literal only.
- `delayMs` should be required, integer, and `>= 0`; use a duration amount + unit UI, not raw milliseconds.
- `transition` should be required and should prefer a dropdown of transition names in the current workflow.
- `timeoutMs` should be optional, integer, and `>= 0`; warn when omitted.

Do not use current local import permissiveness as validation guidance.

### Config / Parameterization

Unknown external config keys are stripped by runtime export and by current Zod schemas. Do not offer arbitrary advanced config JSON for processor config in the first production implementation.

Use structured fields plus `context` as the only free-form parameterization field.

### UX Shape

Replace the inline processor editor with:

- Compact transition inspector processor list.
- Empty state text: `No processors run on this transition.`
- Helper for non-empty list: `Processors run sequentially in the order shown.`
- Add/Edit modal with local draft state.
- Apply dispatches one patch; Cancel dispatches no patch.
- Reorder controls dispatch one patch per move.

### Test Plan for Implementation

Add focused tests for:

- no processors summary
- add external processor
- edit external processor
- delete processor
- duplicate processor with collision-free name
- reorder processors
- executionMode required and emitted
- all four execution modes, including `COMMIT_BEFORE_DISPATCH`
- tags chip editor serializes to comma-separated string
- response timeout validation
- `asyncResult` enables/disables `crossoverToAsyncMs`
- context remains string
- Cancel discards draft
- Apply dispatches one patch
- Undo reverts add/edit
- exported workflow JSON includes processor config correctly
- invalid processor blocks Apply

Scheduled tests should wait until runtime scheduled support is confirmed beyond permissive import plus stripped export.

## Commands Run

Non-destructive runtime probes:

- `GET http://127.0.0.1:8080/api/help`
- `GET http://127.0.0.1:8080/openapi.json`
- `POST /api/model/import/JSON/SAMPLE_DATA/{throwaway}/1`
- `POST /api/model/{throwaway}/1/workflow/import`
- `GET /api/model/{throwaway}/1/workflow/export`
- `DELETE /api/model/{throwaway}/1`

Repo inspection:

- `rg --files`
- `rg -n "processor|processors|executionMode|calculationNodesTags|responseTimeout|timeoutMs|delayMs|workflow-core|patch|validate" ...`
- `sed` reads of core schema/type/patch/validation files
- `sed` reads of React inspector/store/test files
- `git status --short`

No implementation test suite was run because this was discovery-only.
