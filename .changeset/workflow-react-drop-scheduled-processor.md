---
"@cyoda/workflow-react": minor
---

Remove scheduled processor UI; add transition schedule inspector. (Pre-1.0
`minor` per the 0.x convention — removes UI tied to the dropped `scheduled`
processor type; the project is intentionally staying in 0.x.)

The `scheduled` processor type was removed from `@cyoda/workflow-core` v0.8.
This release removes all corresponding UI: the type selector, duration fields,
transition picker, and validation logic from the processor modal. The only
supported processor type is now `externalized`.

A new "Scheduled transition" section has been added to the transition inspector.
It provides an enable/disable toggle plus `delayMs` (required) and `timeoutMs`
(optional) fields wired through the existing `updateTransition` patch so edits
land on the undo stack. A persistent notice informs users that scheduled
transitions are a schema/SPI placeholder and are not yet executed by the
workflow engine (firing one returns 400 BAD_REQUEST).
