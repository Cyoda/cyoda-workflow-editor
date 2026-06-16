---
"@cyoda/workflow-core": major
---

Major bump for cyoda-go v0.8.0 support.

- **Removed `ScheduledProcessorSchema`** (and the `ScheduledProcessor` type). The
  `scheduled` processor type — an unsupported v0.7 platform hack — is gone from
  the canonical model; `ProcessorSchema` is now `externalized`-only, matching the
  v0.8.0 wire format. The 0.7 dialect drops any `{type:"scheduled"}` processor on
  import and reports it via `ParseResult.warnings`.
- **Added `TransitionScheduleSchema`** as optional `transitions[].schedule`
  (`{ delayMs, timeoutMs? }`). A schema/SPI placeholder — configurable and
  importable, but not yet executed by the workflow engine.
- **New `cyoda-0_8` dialect** (`"0.8"`), registered alongside `"0.7"`.
  `LATEST_CYODA_VERSION` is now `"0.8"`. Its `workflowsToWire` emits
  `transitions[].schedule` and enforces a strict field allowlist so output is
  clean against v0.8.0's `DisallowUnknownFields` import rejection.
- **Added `ParseResult.warnings`** (optional `string[]`) carrying the dialect's
  `toCanonical` notes. Additive — existing call sites are unaffected.
- **Name length cap (256 chars)** enforced in `NameSchema` and mirrored as a
  `name-too-long` semantic error.

BREAKING CHANGE: `ScheduledProcessorSchema` and the `ScheduledProcessor` type are
no longer exported; consumers must update. `LATEST_CYODA_VERSION` changed from
`"0.7"` to `"0.8"`.
