---
"@cyoda/workflow-monaco": minor
---

Support monaco-editor 0.56 and 0.57; the peer range is now `>=0.45 <0.58`
(was `<0.56`).

- monaco-editor 0.56 removed the `languages.json` alias in favour of the
  top-level `json` namespace, so schema registration
  (`registerWorkflowSchema` / `registerCriterionSchema`) threw on 0.56+. It now
  uses whichever namespace the running monaco provides, and fails with a
  descriptive error if neither is there. New export: `jsonDefaultsOf`.
- `MonacoLike` / `WorkflowJsonMonacoRuntime` now accept the real
  `monaco-editor` module without a cast: `json` is the top-level namespace,
  `languages.json` is optional (0.56+ types it as a `{ deprecated: true }`
  tombstone), `JsonDiagnosticsOptions.schemas[].schema` is optional, and
  `JsonDiagnosticsOptions` no longer has a string index signature. A
  compile-time test checks the real module against these types.
- README: the 0.56+ worker import paths
  (`monaco-editor/editor/editor.worker`,
  `monaco-editor/languages/features/json/json.worker`). The old
  `monaco-editor/esm/vs/...` paths no longer resolve.
