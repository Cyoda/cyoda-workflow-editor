---
"@cyoda/workflow-core": minor
"@cyoda/workflow-monaco": minor
"@cyoda/workflow-react": minor
---

Replace the structured criterion "assembly" editor with a JSON editor.

The "Edit criterion" popup no longer offers the per-type structured builder
(simple/group/function/lifecycle/array forms, plain-English preview, field-path
combobox). It now edits the criterion as JSON — Monaco when a runtime is
configured (syntax highlighting + live schema validation), with a plain
`<textarea>` fallback otherwise. Apply is gated on the canonical `CriterionSchema`
plus the builder's prior strictness rules (gjson JSONPath subset, `BETWEEN`
arity, required scalar values, recursion into groups and function prechecks), so
no valid criterion the old builder accepted is now rejected. The collapsed
summary card shows the criterion type badge plus a compact read-only JSON
snippet. The committed criterion shape and the `setCriterion` patch are unchanged.

- **`@cyoda/workflow-core`**: add `criterionBlockingError` (the relocated,
  reusable strictness gate). **Breaking:** remove the now-unused
  `EntityFieldHintProvider` and `FieldHint` exports (the field-path autocomplete
  they fed is gone).
- **`@cyoda/workflow-monaco`**: add `registerCriterionSchema`,
  `criterionJsonSchema`, and `CRITERION_SCHEMA_URI`; relocate the Monaco runtime
  types (`WorkflowJsonMonacoRuntime`, …) into the package so a second editor can
  reuse them.
- **`@cyoda/workflow-react`**: add `CriterionJsonEditor` and forward the Monaco
  runtime to the inspector via context. **Breaking:** remove the `hintProvider`
  prop from `WorkflowEditor`/`Inspector` and the re-exported
  `EntityFieldHintProvider`/`FieldHint` types. Consumers (e.g. `cyoda-dev-console`)
  must drop `hintProvider`.

Also fixes (workflow-react): a React Flow idle re-render loop under React 19 that
pinned the main thread on larger graphs (the `updateNodeInternals` effect now
keys on the layout-derived node memo, not live node state), and the suppression
of Monaco's benign "Canceled" disposal rejections (now a precise, permanently
installed filter rather than a racy timing window; note Firefox still surfaces
them via its own devtools rejection tracking).

(Pre-1.0 `minor` per the 0.x convention — the breaking removals above are shipped
as a 0.x minor; the project is intentionally staying in 0.x.)
