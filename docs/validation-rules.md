# Workflow validation rules

The editor validates a workflow session and surfaces issues in the toolbar
severity pills and the issues drawer. Each issue has a stable `code`, a
`severity` (`error` / `warning` / `info`), and — where it is scoped to a node —
a `targetId` that makes the drawer's **Jump to** button navigate to the
offending state, transition, processor, or workflow.

Rules live in `packages/workflow-core/src/validate/semantic.ts` (plus the
dynamic `schema-*` family in `schema.ts`, and the import-time codes emitted by
`parse/parse-import.ts`). This catalog is kept in sync by
`packages/workflow-core/tests/validate/rule-catalog.test.ts`, which fails if a
code is added or removed without updating this file.

**Severity meaning**

- **error** — the workflow is invalid, or *every* supported backend will reject
  it; block save.
- **warning** — one of two things: the engine accepts it but it's almost
  certainly a mistake, **or** it is backend-conditional — cyoda-go rejects it
  while Cyoda Cloud accepts and honours it. The second kind (today:
  `async-result-unsupported`, `crossover-unsupported`) is deliberately *not* an
  error: a user targeting Cyoda Cloud is writing a valid document and must not
  be blocked, and the field must still round-trip. The message names the
  backend split explicitly.
- **info** — a neutral observation or a soft heuristic; never alarming.

A rule is an **error** only when no supported backend accepts the document, or
when the editor's own model cannot represent it. Anything that hinges on
*which* backend the user is targeting is a warning.

## Errors

| Code | Scope | Clickable | Meaning |
|------|-------|-----------|---------|
| `duplicate-workflow-name` | workflow | — | Two workflows share a name. |
| `missing-initial-state` | workflow | yes | Workflow has no `initialState`. |
| `unknown-initial-state` | workflow | yes | `initialState` is not a defined state. |
| `name-regex-violation` | any | — | A workflow/state/transition/processor/function name fails the name regex. |
| `name-too-long` | any | — | A name exceeds the maximum length. |
| `unknown-transition-target` | transition | yes | A transition's `next` targets an unknown state. |
| `duplicate-transition-name` | state | yes | Two transitions on one state share a name. |
| `duplicate-processor-name` | transition | yes | Two processors on one transition share a name. |
| `function-missing-name` | criterion | — | A function criterion has an empty name. |
| `invalid-jsonpath-subset` | criterion | — | A simple/array criterion `jsonPath` is not JSON Path under cyoda-go 0.8.4's grammar (`$.` leader required, ASCII `[A-Za-z0-9_-]` names, `[*]` or an int32 index as the only subscripts). |
| `array-path-not-wildcard` | criterion | — | An array criterion `jsonPath` does not end in `[*]`; it must address the array's elements. |
| `array-non-scalar-value` | criterion | — | An array criterion value contains an object or array; entries must be scalars or `null`. |
| `lifecycle-invalid-field` | criterion | — | A lifecycle criterion field is not in the allowed set. |
| `not-with-multiple-conditions` | criterion | — | A `NOT` group does not have exactly one condition. |
| `like-pattern-invalid` | criterion | — | A `LIKE` operand ends in an unpaired escape (`\`); write a literal trailing backslash as `\\`. |
| `simple-between-shape` | criterion | — | `BETWEEN` / `BETWEEN_INCLUSIVE` needs a two-element `[low, high]` value. |
| `criterion-depth-limit` | criterion | — | Criterion tree depth reaches the engine limit. |
| `annotations-too-large` | wf / state / transition | yes | Annotations exceed the 64 KiB cap. |
| `schedule-mode-required` | transition | yes | A `schedule` has neither `delayMs` nor `function` (or both); exactly one is required. |
| `schedule-manual-conflict` | transition | yes | A transition has both `schedule` and `manual: true`; the two are mutually exclusive. |
| `schedule-function-incomplete` | transition | yes | `schedule.function` is missing `name` or `calculationNodesTags`. |
| `workflow-schema-version-malformed` | workflow | yes | The in-document `version` tag is not `MAJOR.MINOR`, uses an unsupported major, or exceeds the max minor the target server accepts. |
| `workflow-schema-version-below-features` | workflow | yes | The in-document `version` tag is below the schema version that introduced a feature the workflow uses (1.2: processor `annotations` / `criterionAnnotations`; 1.3: `schedule.function`; 1.4: `NOT` group). cyoda-go does not enforce this, but the tag would misstate the workflow's contract — it cannot run as designed on a server that only speaks the declared version. Carries a `fix` raising the tag to the required version. |
| `unknown-retry-policy` | processor | yes | Processor `config.retryPolicy` is outside `NONE` / `FIXED` / empty; cyoda-go hard-400s on anything else. |
| `start-new-tx-without-commit-before-dispatch` | processor | yes | `startNewTxOnDispatch` is set but the mode is not `COMMIT_BEFORE_DISPATCH`. |
| `operator-alias-conflict` | — | — | Import only. A criterion carries two spellings of the same operator with different values, so the alias cannot be normalized. |
| `schema-*` | varies | — | A canonical Zod schema check failed; the suffix is the Zod issue code. |

## Warnings

| Code | Scope | Clickable | Meaning |
|------|-------|-----------|---------|
| `operator-not-recognized` | criterion | — | Operator outside the editor's known set; preserved for round-trip. cyoda-go rejects it at import; Cyoda Cloud's operator set is wider. |
| `unsupported-operator` | criterion | — | A known operator cyoda-go does not implement (`IS_CHANGED` / `IS_UNCHANGED`); rejected at import. |
| `matches-pattern-invalid` | criterion | — | A `MATCHES_PATTERN` operand is probably not valid RE2. A JS approximation of Go's RE2, so a warning; cyoda-go rejects invalid patterns at import. |
| `lifecycle-temporal-operator` | criterion | — | A string/pattern operator on `creationDate` / `lastUpdateTime`; cyoda-go accepts only comparison, range and null-presence operators there. |
| `lifecycle-temporal-operand` | criterion | — | A `creationDate` / `lastUpdateTime` operand doesn't look like a date, date-time or time. Heuristic, hence a warning. |
| `array-criterion-legacy-value` | — | — | Import only. Array criteria stored their list under `value`, which cyoda-go ignores, so each such guard currently matches every entity. The editor reads them correctly and writes `values` on save. Also on `ParseResult.warnings`. |
| `function-criterion-in-group` | criterion | — | A function criterion nested in a group; cyoda-go requires it to be the whole criterion and fails the evaluation otherwise (import accepts it). |
| `async-result-unsupported` | processor | yes | `config.asyncResult` is `true`; rejected by cyoda-go, supported on Cyoda Cloud only. |
| `crossover-unsupported` | processor | yes | `config.crossoverToAsyncMs` is set; rejected by cyoda-go, supported on Cyoda Cloud only. |
| `processor-type-internalized` | processor | yes | Processor `type` is the reserved value `"internalized"`; cyoda-go accepts it at import but rejects it at dispatch. |
| `processor-type-non-canonical` | processor | yes | Processor `type` is neither `"externalized"` nor empty; cyoda-go stores and returns it verbatim today. |
| `criterion-depth-warning` | criterion | — | Criterion tree depth is near the engine limit. |
| `unreachable-state` | state | yes | A state is unreachable from the initial state. |
| `null-criterion-not-last` | transition | yes | An automated no-criterion transition isn't last, so it always fires first; later automated transitions on the state are unreachable (they're named in the message). |
| `schedule-timeout-negative` | transition | yes | `schedule.timeoutMs` is negative; the server accepts it but treats it like `0`. |
| `workflow-schema-version-outdated` | workflow | yes | The in-document `version` tag is below the minimum minor the target server accepts; carries a `fix` that rewrites it to the dialect's current tag. |
| `unguarded-automated-cycle` | workflow | yes | A cycle is reachable purely via unguarded automated transitions (`manual: false`, not `disabled`, no `criterion` — a `schedule` does not exempt an edge). cyoda-go rejects this at import unless `allowCycles` is set. Necessary but not sufficient: detection runs against the merged stored result, so a `MERGE` can still be rejected over a cycle this document doesn't contain — never treated as an error. |

## Info

| Code | Scope | Clickable | Meaning |
|------|-------|-----------|---------|
| `terminal-state-derived` | state | — | A state has no outgoing transitions (terminal). |
| `workflow-inactive` | workflow | — | The workflow is marked inactive. |
| `unused-workflow-criterion` | workflow | — | A workflow criterion is set but the session has only one workflow. |
| `excessive-fan-out` | state | yes | A state has more than 8 outgoing transitions. |
| `processor-overload` | transition | yes | A transition has more than 5 processors. |
| `disabled-transition-on-active-workflow` | transition | yes | A disabled transition inside an active workflow. |
| `lifecycle-path-in-simple` | criterion | — | A simple criterion path looks like a `$._meta` lifecycle path. |
| `function-without-quick-exit` | criterion | — | A function criterion has no local quick-exit guard (every eval calls out). |
| `cyoda-version-unresolvable` | — | — | `meta.cyodaVersion` names a cyoda-go dialect this build does not ship (e.g. the removed `"0.7"`), so the workflow schema version-tag checks are skipped. Everything else still validates. |
| `processor-keys-dropped` | — | — | Import only. Processor keys outside the cyoda-go wire format were discarded; the editor cannot round-trip them. Also on `ParseResult.warnings`. |
| `processor-config-keys-dropped` | — | — | Import only. Processor `config` keys outside the cyoda-go wire format were discarded — the editor's only signal that it dropped part of a processor's meaning. Also on `ParseResult.warnings`. |
| `dialect-warning` | — | — | Import only. A `toCanonical` warning from a host-registered dialect whose shape this library does not recognise; surfaced verbatim. |

## Notes

- The heuristic rules in **Info** (fan-out, processor count, disabled-on-active,
  lifecycle-path, quick-exit) flag patterns that are frequently intentional, so
  they're surfaced as neutral observations rather than warnings.
- Several rules were removed because they flag valid designs or judgements the
  editor can't make: `all-transitions-manual`, `sync-on-likely-bottleneck-transition`,
  `matches-pattern-unanchored`, `like-wildcard-warning`. The per-victim
  `unreachable-automated-transition` was folded into `null-criterion-not-last`.
