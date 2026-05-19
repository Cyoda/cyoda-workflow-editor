# `@cyoda/workflow-react`

Full workflow editor shell for Cyoda workflows, built on React Flow with
an Inspector panel, toolbar, and modals.

## Install

```sh
npm install @cyoda/workflow-core @cyoda/workflow-graph @cyoda/workflow-layout \
            @cyoda/workflow-viewer @cyoda/workflow-react \
            react react-dom reactflow
```

## Quick start

```tsx
import { parseImportPayload } from "@cyoda/workflow-core";
import { WorkflowEditor } from "@cyoda/workflow-react";
import "reactflow/dist/style.css";

const { document } = parseImportPayload(workflowJson);

export function App() {
  return (
    <WorkflowEditor
      document={document}
      mode="editor"
      onSave={(doc) => pushToBackend(doc)}
    />
  );
}
```

## Editing capabilities

- **States**: add (toolbar / `A` key), rename with collision guard, delete
  with cascade confirmation, set initial state, visual badges
  (Initial / Terminal / Unreachable).
- **Transitions**: drag-connect with auto-suggested name, rename with
  collision guard, retarget via inspector dropdown, move to a different
  source state (`moveTransitionSource`), toggle manual/disabled, reorder,
  delete.
- **Criteria**: compact inspector summary cards open a focused modal editor
  for `simple`, `group` (recursive), `function`, `lifecycle`, and `array`
  types; raw JSON escape hatch; draft editing where Apply commits one patch
  and Cancel discards local changes.
- **Processors**: compact transition summary rows for the documented
  `externalized` and `scheduled` processor types; modal-local draft editing
  where Apply commits one patch and Cancel discards local changes;
  externalized support for `SYNC`, `ASYNC_SAME_TX`, `ASYNC_NEW_TX`, and
  `COMMIT_BEFORE_DISPATCH` plus `startNewTxOnDispatch`; scheduled duration
  inputs for `delayMs` and `timeoutMs`; `calculationNodesTags` serialized as
  a comma-separated string; free-form string `context`; no arbitrary custom
  config keys.
- **Manual layout**: drag states to persist positions; Reset Layout /
  Auto Layout toolbar buttons; `L` / `Shift+L` keyboard shortcuts.
- **Comments**: add free-floating sticky notes via `+ Note` toolbar
  button; double-click to edit; drag to reposition; delete.
- **Undo / redo**: every edit creates one undo step including cascading
  operations via `PatchTransaction`; `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`.
- **Validation**: errors/warnings as toolbar pills; inline in inspector.
- **Save**: `Ctrl/Cmd+S`; blocked on validation errors.

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `document` | `WorkflowEditorDocument` | required | From `parseImportPayload`. |
| `mode` | `"viewer" \| "playground" \| "editor"` | `"editor"` | `"viewer"` hides edit affordances. |
| `messages` | `PartialMessages` | English | i18n overrides. |
| `layoutOptions` | `LayoutOptions` | – | ELK preset and orientation. |
| `chrome` | `ChromeOptions` | all true | Toggle toolbar / tabs / inspector / minimap / controls. |
| `localStorageKey` | `string \| null` | `"cyoda-editor-layout"` | localStorage key for editor metadata persistence (`layout`, `comments`, `edgeAnchors`, `viewports`). `null` disables. |
| `layoutMetadata` | `WorkflowUiMeta` | – | Host-controlled UI metadata (overrides localStorage). |
| `onLayoutMetadataChange` | `(meta: WorkflowUiMeta) => void` | – | Fires when editor-only metadata changes. |
| `onChange` | `(doc: WorkflowEditorDocument) => void` | – | Fires after every patch. |
| `onSave` | `(doc: WorkflowEditorDocument) => void` | – | Fires on Ctrl/Cmd+S. |
| `enableJsonEditor` | `boolean` | `false` | Enables the built-in Monaco-backed JSON editor surface. |
| `jsonEditorPlacement` | `"tab" \| "split"` | `"tab"` | Renders JSON as a tab or alongside the graph. |
| `jsonEditor` | `WorkflowJsonEditorConfig \| null` | `null` | Host-supplied Monaco runtime/config. Pass `monaco` here to enable editing. |
| `onJsonStatusChange` | `(status: JsonEditStatus) => void` | – | Reports JSON parse/schema/apply state for host UX. |

## JSON editor

`WorkflowEditor` keeps the graph and JSON views pointed at the same canonical `WorkflowEditorDocument`.

- Graph edit -> JSON sync: visual edits update the Monaco model without recreating the editor instance.
- JSON edit -> graph sync: valid JSON emits a canonical `replaceSession` patch and updates the graph.
- Invalid JSON handling: invalid syntax or schema never mutates the canonical document; `onJsonStatusChange` reports `"invalid-json"` or `"invalid-schema"` and save stays blocked.
- Export cleanliness: `layout`, `comments`, `edgeAnchors`, and `viewports` stay in `doc.meta.workflowUi` and never appear in exported Cyoda workflow JSON.

### JSON types

- `JsonEditStatus`: status union emitted by `onJsonStatusChange`, including idle, invalid JSON/schema, and successful apply states.
- `WorkflowJsonEditorConfig`: host config for the embedded Monaco editor. Supply `monaco`, plus optional `modelUri`, `editorOptions`, and `debounceMs`.

### Minimal JSON-enabled usage

```tsx
import * as monaco from "monaco-editor";
import { parseImportPayload } from "@cyoda/workflow-core";
import {
  WorkflowEditor,
  type JsonEditStatus,
  type WorkflowJsonEditorConfig,
} from "@cyoda/workflow-react";
import "reactflow/dist/style.css";

const { document } = parseImportPayload(workflowJson);

const jsonEditor: WorkflowJsonEditorConfig = {
  monaco,
  debounceMs: 150,
  editorOptions: { glyphMargin: false },
};

export function App() {
  const handleJsonStatusChange = (status: JsonEditStatus) => {
    console.log(status.status);
  };

  return (
    <WorkflowEditor
      document={document}
      enableJsonEditor
      jsonEditorPlacement="split"
      jsonEditor={jsonEditor}
      onJsonStatusChange={handleJsonStatusChange}
    />
  );
}
```

## Keyboard shortcuts

| Key | Action |
|---|---|
| `A` | Add state |
| `L` | Auto layout |
| `Shift+L` | Reset layout |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl/Cmd+S` | Save |

## Exported symbols

```ts
import {
  WorkflowEditor,         // Main editor component
  useSaveFlow,            // Save-flow hook
  SaveConfirmModal,       // MERGE/REPLACE/ACTIVATE confirmation modal
  ConflictBanner,         // HTTP 409 conflict UI
  ConflictBannerProps,
  diffSummary,            // Terse server vs local diff string
  I18nContext,
  useMessages,
  mergeMessages,
  defaultMessages,
} from "@cyoda/workflow-react";
```

## Editor metadata: what stays out of exported JSON

Layout positions, comments, edge anchors, and viewport data live in
`doc.meta.workflowUi` and are **never** written to exported Cyoda workflow
JSON. `serializeImportPayload(doc)` always produces a clean, canonical
output regardless of what has been dragged or annotated.

## Runtime notes

- Browser-only (React 18, DOM required).
- Imports `reactflow/dist/style.css` — ensure your bundler handles CSS.
- `reactflow` must be installed as a peer dependency (`^11`).

## Documentation

See the [repository README](https://github.com/Cyoda-platform/cyoda-workflow-editor#readme).

## License

Apache-2.0
