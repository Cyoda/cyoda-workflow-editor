---
"@cyoda/workflow-react": minor
---

Criterion editor: the simple/array condition now presents a field-first picker instead of a raw "JSON path" box. When a hint provider is configured, the input is labelled **Field** with a searchable dropdown that shows a readable leaf name (disambiguated by readable path when leaf names collide) above the technical JSONPath; with no provider it falls back to a labelled **Field path** input. Validation copy is friendlier ("Choose a field for this condition.") and a non-blocking warning surfaces when a valid path is not in the current entity's field list. An "Enter raw JSONPath" disclosure documents manual entry, which remains available at all times. Value inputs are now type-aware for `number` (numeric input) and `boolean` (true/false control) fields in addition to the existing date/datetime handling. The committed criterion shape (raw `jsonPath` string and typed value) is unchanged.
