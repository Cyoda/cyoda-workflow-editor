# `@cyoda/workflow-monaco`

Monaco editor integration for Cyoda workflow JSON: schema registration,
validation markers, patch lifting, and canvas ↔ JSON selection sync.

## Install

```sh
npm install @cyoda/workflow-core @cyoda/workflow-monaco monaco-editor
```

Supported `monaco-editor` versions: `>=0.45 <0.58` (the demo runs on `0.57.x`).

The JSON language defaults are found wherever the running monaco-editor keeps
them: the top-level `monaco.json` namespace (0.55+, the only location from
0.56) or the legacy `monaco.languages.json` (before 0.56). `jsonDefaultsOf(monaco)`
exposes that lookup.

**Workers with monaco-editor ≥ 0.56.** 0.56 added an `exports` map
(`monaco-editor/<path>` → `esm/vs/<path>.js`), so the old deep imports such as
`monaco-editor/esm/vs/editor/editor.worker` and
`monaco-editor/min/vs/editor/editor.main.css` no longer resolve. With Vite:

```ts
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/languages/features/json/json.worker?worker";

self.MonacoEnvironment = {
  getWorker: (_id, label) => (label === "json" ? new jsonWorker() : new editorWorker()),
};
```

The ESM build imports its own CSS, so no stylesheet import is needed.

## Usage

```ts
import * as monaco from "monaco-editor";
import {
  registerWorkflowSchema,
  attachWorkflowJsonController,
} from "@cyoda/workflow-monaco";

registerWorkflowSchema(monaco);

const controller = attachWorkflowJsonController({
  monaco,
  editor,                          // Monaco editor instance
  debounceMs: 300,
  autoApply: true,
  onPatch: (patch) => store.dispatch(patch),
  onStatus: (result) => console.log(result.status),
  onIssues: (issues) => renderMarkers(issues),
});

// Sync external doc changes back into the editor:
controller.syncFromDocument(updatedDoc);

// Later:
controller.dispose();
```

## Behaviour

- **Valid JSON** → a `replaceSession` patch is emitted; synthetic UUIDs
  are reused by passing the prior `EditorMetadata` to `parseImportPayload`.
- **Invalid JSON** → canonical model is left untouched; status is
  `"invalid-json"` or `"invalid-schema"`.
- **Semantic errors** → patch still dispatched; issues available via
  `onIssues` callback; canvas reflects the new session with error markers.
- **After `replaceSession`** → stale layout positions and comment
  attachments for deleted states/transitions are cleaned automatically.

## Selection sync

```ts
import {
  attachCursorSelectionBridge,
  revealIdInEditor,
  idAtOffset,
} from "@cyoda/workflow-monaco";

// Canvas → JSON: reveal the JSON range for a selected node UUID.
revealIdInEditor(editor, document, selectedUuid);

// JSON → Canvas: translate the cursor offset to a graph entity UUID.
const uuid = idAtOffset(document, offset);
```

## Invalid JSON isolation

The controller never writes a partially-invalid JSON edit to the canonical
document. The `replaceSession` patch is only emitted when JSON parsing
succeeds and the Zod schema validates. Semantic errors (e.g. missing
transition target) produce a patch with issues but do not block dispatch —
the editor marks the save button as disabled.

## Runtime notes

- No runtime `monaco-editor` import — all Monaco surfaces use structural
  `MonacoLike` / `TextModelLike` / `EditorLike` interfaces.
- Consumers supply their own Monaco build and pass a compatible runtime.

## Documentation

See the [repository README](https://github.com/Cyoda/cyoda-workflow-editor#readme).

## License

Apache-2.0
