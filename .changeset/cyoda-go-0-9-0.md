---
"@cyoda/workflow-core": minor
"@cyoda/workflow-react": minor
"@cyoda/workflow-viewer": minor
"@cyoda/workflow-graph": patch
"@cyoda/workflow-monaco": patch
---

Support cyoda-go 0.9.0 (workflow schema 1.5); drop cyoda-go 0.8.x.

- **New `"0.9"` dialect; `"0.8"` is removed.** `SUPPORTED_CYODA_VERSIONS` and
  `LATEST_CYODA_VERSION` are `"0.9"`. cyoda-go 0.9.0 refuses the 0.8.x wire
  format, so the two cannot share a dialect. `getDialect("0.8")` throws a
  removal message. Files and exports written for 0.8.x still open under
  `"0.9"` and re-save in the 0.9.0 shape. Hosts must switch their configured
  version from `"0.8"` to `"0.9"`.
- **`startNewTxOnDispatch` moves from a processor's `config` onto the
  processor**, beside `executionMode`, where 0.9.0 reads it (it refuses it
  inside `config`). The legacy position is migrated on parse.
- Schema tag `1.5`: new workflows are stamped `1.5`, and `1.1`–`1.5` are
  accepted. New fields: processor `config.idempotent` and
  `schedule.function.retryPolicy`. Function conditions may sit inside
  `AND`/`OR`/`NOT` groups, so `function-criterion-in-group` is removed.
  `workflow-schema-version-below-features` knows the three 1.5 features.
- `ArrayCriterion.operation` is now required (0.9.0 applies it at every
  position). A clause without one is given `EQUALS`, the comparison 0.8.x
  used, with an `array-criterion-operator-defaulted` warning.
- The `operator` spelling of a leaf condition's operator is now read; the
  0.9.0 export echoes it.
- Array criterion entries may be `[low, high]` pairs under `BETWEEN` /
  `BETWEEN_INCLUSIVE` (`ArrayCriterionValue` widens; new `ArrayCriterionScalar`
  export). A pair under any other operator is `operand-not-scalar`; a
  malformed pair is `simple-between-shape`.
- Undeclared criterion members (which 0.9.0 refuses and Zod used to drop
  silently) are now reported on import as a `criterion-keys-dropped` warning,
  and blocked in the criterion JSON editor. New `findUnknownCriterionMembers`
  export.
- New errors mirroring 0.9.0's import checks: `schedule-delay-with-function`,
  `response-timeout-negative`, `operand-missing`, `operand-not-scalar`,
  `array-no-position`, `array-path-inner-wildcard`, `precheck-function` and
  `criterion-entry-limit`.
- Extended rules: `unknown-retry-policy` now also checks criterion functions
  and `schedule.function`. `simple-between-shape` requires two non-null scalar
  bounds and now applies to lifecycle criteria too.
- Rules promoted to errors: `schedule-timeout-negative`,
  `processor-type-internalized` and `processor-type-non-canonical`.
- New warning `response-timeout-above-default-max`: the server's upper bound
  is a per-deployment setting, so exceeding the default of 60000 ms is only a
  warning.
- workflow-react: the processor editor writes `startNewTxOnDispatch` on the
  processor, adds an *Idempotent* field and refuses a negative response
  timeout. The schedule-function editor gains *Retry policy*. The criterion
  JSON editor blocks the new criterion errors.
- workflow-viewer / workflow-react tooltips read `startNewTxOnDispatch` from
  the processor.
- Pre-1.0 `minor` per the 0.x convention (canonical-model change).
