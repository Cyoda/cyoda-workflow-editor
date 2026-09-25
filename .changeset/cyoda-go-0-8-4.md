---
"@cyoda/workflow-core": minor
"@cyoda/workflow-graph": patch
"@cyoda/workflow-react": patch
"@cyoda/workflow-viewer": patch
---

Support cyoda-go 0.8.4 (workflow schema 1.4).

- Workflows exported from a 0.8.4 server (tagged `1.4`) no longer open with a
  blocking `workflow-schema-version-malformed` error; the accepted range is now
  `1.1`–`1.4` and new workflows are stamped `1.4`.
- **Fix:** array criteria are now written as `values`, the only key cyoda-go
  reads. They were written as `value`, which cyoda-go ignores, so every array
  guard saved by the editor matched every entity. Files using `value` still
  load and are migrated on save.
- Array criteria: `operation` is optional (cyoda-go ignores it) and entries may
  be strings, numbers, booleans or `null` (skip that index). The path must end
  in `[*]` (new error `array-path-not-wildcard`); object entries are an error
  (`array-non-scalar-value`, replacing `array-non-string-value`).
- Lifecycle criteria accept `lastUpdateTime`, `transitionForLatestSave`,
  `transactionId` and `id`, which previously failed to parse. New warnings
  `lifecycle-temporal-operator` and `lifecycle-temporal-operand` cover
  `creationDate` / `lastUpdateTime`.
- `NOT` groups are supported by cyoda-go: `unsupported-group-operator` is
  removed, and `not-with-multiple-conditions` is now an error (exactly one
  condition is required). `SUPPORTED_GROUP_OPERATORS` includes `"NOT"`.
- The criterion `jsonPath` check now matches cyoda-go 0.8.4 exactly: bare `$` and
  indices above int32 are rejected, and segments may start with a digit or `-`.
- New `like-pattern-invalid` error (a `LIKE` operand ending in an unpaired
  `\`), `matches-pattern-invalid` warning (probable non-RE2 pattern), and
  `function-criterion-in-group` warning.
- Pre-1.0 `minor` per the 0.x convention: `ArrayCriterion` and
  `LifecycleCriterion` widen (canonical-model change).
