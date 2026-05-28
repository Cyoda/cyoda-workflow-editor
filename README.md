# Cyoda Workflow Editor

A TypeScript monorepo of reusable packages for parsing, projecting,
rendering, and **editing** Cyoda workflow JSON. The same building blocks
power three distinct use cases:

1. **Display-only embeds** — a slim SVG viewer for static websites and
   documentation pages.
2. **Full editor** — a React Flow canvas + Inspector shell for read/write
   editing of states, transitions, criteria, processors, and comments.
3. **Developer playground** — Monaco JSON editing kept in sync with the
   canvas, both driving the same canonical model.

**Canonical state is the Cyoda workflow JSON.** The graph, layout, and
canvas comments are projections and editor metadata only — they never
appear in exported Cyoda workflow JSON. Round-tripping is byte-identical.

---

## Repository layout

```
cyoda-workflow-editor/
├── packages/
│   ├── workflow-core      # Domain: parse, normalize, validate, patch, serialize, transaction
│   ├── workflow-graph     # Projection: domain → nodes/edges/annotations
│   ├── workflow-viewer    # Slim read-only SVG renderer (no React Flow, no Monaco)
│   ├── workflow-layout    # ELK adapter (presets, pinned/manual positions)
│   ├── workflow-react     # Full editor shell (React Flow + Inspector + modals + toolbar)
│   └── workflow-monaco    # Monaco JSON editor wired to the domain
├── apps/
│   └── docs-embed-demo    # Internal demo and regression harness (private)
├── pnpm-workspace.yaml
└── package.json
```

Package dependency graph:

```
workflow-core
   ├── workflow-graph ──┬── workflow-viewer
   │                    ├── workflow-layout
   │                    └── workflow-react ── (peer: react, reactflow)
   └── workflow-monaco  ── (peer: monaco-editor)
```

All packages use explicit `exports` (no `export *`) and ship ESM + CJS +
`.d.ts` via `tsup`.

## Published packages

| Package | Purpose |
|---|---|
| `@cyoda/workflow-core` | Domain model, patches, validation, serialization |
| `@cyoda/workflow-graph` | Graph projection |
| `@cyoda/workflow-layout` | ELK layout engine |
| `@cyoda/workflow-monaco` | Monaco JSON editor bridge |
| `@cyoda/workflow-react` | Full editor shell |
| `@cyoda/workflow-viewer` | Slim read-only viewer |

Private (not published):
- `cyoda-workflow-editor` (root workspace package)
- `@cyoda/docs-embed-demo` (internal demo app)

---

## Quick start

```sh
# Prerequisites: Node ≥ 20, pnpm ≥ 9
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint

# Launch the capability showcase demo
pnpm --filter @cyoda/docs-embed-demo dev
# → http://localhost:5173
```

Per-package commands:

```sh
pnpm --filter @cyoda/workflow-core test
pnpm --filter @cyoda/workflow-core test:watch
pnpm --filter @cyoda/workflow-core bench
pnpm --filter @cyoda/workflow-core build
```

---

## Use case 1 — Display-only viewer

Install:

```sh
npm i @cyoda/workflow-core @cyoda/workflow-graph @cyoda/workflow-viewer react react-dom
```

Minimal embed:

```tsx
import { parseImportPayload } from "@cyoda/workflow-core";
import { projectToGraph } from "@cyoda/workflow-graph";
import { WorkflowViewer } from "@cyoda/workflow-viewer";

const { document } = parseImportPayload(workflowJson);
if (!document) throw new Error("Invalid workflow JSON");

export function Embedded() {
  return (
    <WorkflowViewer
      graph={projectToGraph(document)}
      width="100%"
      height={600}
      onSelectionChange={(id) => console.log("selected", id)}
    />
  );
}
```

What the viewer gives you:

- SVG state nodes + transition edges with Cyoda visual conventions
  (initial marker, terminal pill, role-coloured borders, dashed loopbacks).
- Pan / zoom via mouse drag and Ctrl+wheel.
- Click-to-select; the selection value is the synthetic node UUID — map it
  back to domain objects via `document.meta.ids.*`.
- Theme tokens from `@cyoda/workflow-viewer/theme`; override via CSS custom
  properties.

What it does **not** do:

- No drag-connect, delete, or edit affordances — use `@cyoda/workflow-react`.
- No JSON editor — pair with `@cyoda/workflow-monaco`.
- Automatic layout is optional: pass a `LayoutResult` from
  `@cyoda/workflow-layout` via the `layout` prop.

---

## Use case 2 — Full editor

Install:

```sh
npm i @cyoda/workflow-core @cyoda/workflow-graph @cyoda/workflow-layout \
      @cyoda/workflow-viewer @cyoda/workflow-react \
      react react-dom reactflow
```

Minimal editor shell:

```tsx
import { parseImportPayload } from "@cyoda/workflow-core";
import { WorkflowEditor } from "@cyoda/workflow-react";
import "reactflow/dist/style.css";

const { document } = parseImportPayload(workflowJson);
if (!document) throw new Error("Invalid workflow JSON");

export function EditorPage() {
  return (
    <WorkflowEditor
      document={document}
      mode="editor"
      onChange={(doc) => autosave(doc)}
      onSave={(doc) => pushToBackend(doc)}
    />
  );
}
```

### `WorkflowEditorProps`

| Prop | Type | Default | Notes |
|---|---|---|---|
| `document` | `WorkflowEditorDocument` | required | Parsed + normalized model from `parseImportPayload`. |
| `mode` | `"viewer" \| "playground" \| "editor"` | `"editor"` | `"viewer"` hides all edit affordances. |
| `messages` | `PartialMessages` | English | i18n override. |
| `layoutOptions` | `LayoutOptions` | – | ELK layout preset and orientation. |
| `chrome` | `ChromeOptions` | all `true` | Toggle toolbar / tabs / inspector / minimap / controls. |
| `localStorageKey` | `string \| null` | `"cyoda-editor-layout"` | Key for editor metadata persistence (`layout`, `comments`, `edgeAnchors`, `viewports`). Pass `null` to disable. |
| `layoutMetadata` | `WorkflowUiMeta` | – | Host-controlled metadata (overrides localStorage). |
| `onLayoutMetadataChange` | `(meta: WorkflowUiMeta) => void` | – | Called when editor-only metadata changes. Use to persist externally. |
| `onChange` | `(doc: WorkflowEditorDocument) => void` | – | Fires after every patch. |
| `onSave` | `(doc: WorkflowEditorDocument) => void` | – | Fires on Ctrl/Cmd+S when validation passes. |
| `enableJsonEditor` | `boolean` | `false` | Enables the Monaco-backed JSON editor surface. |
| `jsonEditorPlacement` | `"tab" \| "split"` | `"tab"` | Places JSON in a tab or split pane. |
| `jsonEditor` | `WorkflowJsonEditorConfig \| null` | `null` | Host-supplied Monaco runtime/configuration. |
| `onJsonStatusChange` | `(status: JsonEditStatus) => void` | – | Reports invalid JSON/schema or successful apply state. |
| `hintProvider` | `EntityFieldHintProvider` | – | Optional model-schema autocomplete source for criterion `jsonPath` inputs. When omitted, `jsonPath` fields render as plain free-text. |
| `developerMode` | `boolean` | `false` | Show developer-oriented affordances (raw JSON tab in the inspector). Defaults to `false` so business users see a clean view. Hosts that need the JSON tab must opt in explicitly. |

### JSON editor

`WorkflowEditor` can embed a Monaco JSON editor that stays synchronized with the graph.

- Host-supplied runtime/config: pass your Monaco runtime through `jsonEditor.monaco`; no Monaco runtime is bundled by `@cyoda/workflow-react`.
- Invalid JSON handling: bad syntax or schema never mutates the canonical document; `onJsonStatusChange` reports the current state and save remains blocked while invalid.
- Graph-to-JSON sync: canvas and inspector edits update the current Monaco model.
- JSON-to-graph sync: valid JSON emits a canonical session patch and updates the graph without leaking editor metadata into exported workflow JSON.
- Metadata exclusion: `layout`, `comments`, `edgeAnchors`, and `viewports` stay in `doc.meta.workflowUi` only.

Minimal setup:

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
if (!document) throw new Error("Invalid workflow JSON");

const jsonEditor: WorkflowJsonEditorConfig = {
  monaco,
  debounceMs: 150,
};

export function EditorPage() {
  const onJsonStatusChange = (status: JsonEditStatus) => {
    console.log(status.status);
  };

  return (
    <WorkflowEditor
      document={document}
      enableJsonEditor
      jsonEditorPlacement="split"
      jsonEditor={jsonEditor}
      onJsonStatusChange={onJsonStatusChange}
    />
  );
}
```

### Full editor capabilities

**States**
- Add state via toolbar button or `A` keyboard shortcut (collision-free default name).
- Rename state with inline collision guard.
- Delete state with cascade confirmation (counts outgoing + incoming transitions).
- Set as initial state.
- Visual badges: Initial / Terminal / Unreachable.

**Transitions**
- Add transition by dragging between states (modal suggests a collision-free default name).
- Rename transition with collision guard.
- Retarget to a different target state via inspector dropdown.
- Move to a different source state via inspector dropdown (`moveTransitionSource` patch).
- Toggle `manual` and `disabled` flags.
- Reorder within source state.
- Delete with `removeTransition` inverse for clean undo.

**Criteria** (on each transition)
- Add / edit / delete criterion.
- The inspector shows a compact summary card; add/edit opens a focused
  modal editor.
- Structured editors for all five types: `simple`, `group`, `function`,
  `lifecycle`, `array`.
- Recursive editing of nested `group` conditions (add/remove/reorder).
- Raw JSON escape hatch inside the modal.
- Draft editing: Apply commits one criterion patch/undo step; Cancel discards
  local changes, and invalid local state never corrupts the canonical document.

**Processors** (on each transition)
- Add / edit / delete / duplicate / reorder processors.
- Compact summary rows open a focused modal editor; Apply commits one patch
  and Cancel discards local edits.
- Supported processor types are the OpenAPI-documented lowercase literals
  `externalized` and `scheduled`.
- Externalized processor editing covers `executionMode`
  (`SYNC`, `ASYNC_SAME_TX`, `ASYNC_NEW_TX`, `COMMIT_BEFORE_DISPATCH`),
  `startNewTxOnDispatch`, `attachEntity`, `responseTimeoutMs`,
  `calculationNodesTags` as a comma-separated string, `retryPolicy`,
  free-form string `context`, `asyncResult`, and `crossoverToAsyncMs`.
- Scheduled processor editing uses duration inputs for `delayMs` and
  optional `timeoutMs`, plus a structured `transition` selector/input.
- Arbitrary custom processor config JSON is intentionally not supported;
  unknown keys are stripped to match the documented contract.

**Manual layout**
- Drag states to reposition — position is persisted as editor metadata.
- Positions survive tab/session reload via localStorage.
- `Reset Layout` toolbar button (clears all manual positions; not on undo stack).
- `Auto Layout` toolbar button re-runs ELK while respecting pinned positions.
- `Shift+L` resets layout; `L` re-runs auto-layout.
- Host apps can replace localStorage with the `layoutMetadata` /
  `onLayoutMetadataChange` props.

**Canvas comments**
- Add free-floating sticky-note comments via `+ Note` toolbar button.
- Double-click to edit text.
- Delete via × button.
- Comments persist in localStorage alongside layout metadata.
- Comments are **never** exported to Cyoda workflow JSON.

**Undo / redo**
- Every edit creates one undo step, including cascading operations
  (rename state, move transition source) via `PatchTransaction`.
- `addTransition` and `addProcessor` have exact UUID-based inverses.
- `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` redo.

**Validation and save**
- Validation errors/warnings shown as toolbar pills and inline in inspector.
- Save blocked when there are validation errors.
- `Ctrl/Cmd+S` triggers `onSave` when enabled and validation passes.

**Keyboard shortcuts**

| Key | Action |
|---|---|
| `A` | Add state |
| `L` | Auto layout |
| `Shift+L` | Reset layout |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl/Cmd+S` | Save |

### Editor metadata: what stays out of exported JSON

Layout positions, comments, edge anchors, and viewport state are stored
in `WorkflowEditorDocument.meta.workflowUi`. They are **never** included
in the output of `serializeImportPayload`. The exported Cyoda workflow JSON
is always deterministic and clean.

```ts
import { serializeImportPayload } from "@cyoda/workflow-core";

// This output is byte-identical regardless of how many states you've dragged
// around or what comments you've added:
const cleanJson = serializeImportPayload(doc);
```

### Local metadata persistence

By default the editor persists layout positions and comments in
`localStorage` under the key `"cyoda-editor-layout"`. On mount it merges
saved data into the initial document without touching the Cyoda workflow
JSON.

To disable localStorage:

```tsx
<WorkflowEditor document={doc} localStorageKey={null} />
```

To manage persistence yourself (e.g. save to your own backend):

```tsx
<WorkflowEditor
  document={doc}
  localStorageKey={null}
  layoutMetadata={myStoredUiMeta}
  onLayoutMetadataChange={(meta) => saveUiMetaToBackend(meta)}
/>
```

---

## Use case 3 — JSON editor (Monaco)

Install:

```sh
npm i @cyoda/workflow-core @cyoda/workflow-monaco monaco-editor
```

Attach to an existing Monaco editor instance:

```ts
import * as monaco from "monaco-editor";
import {
  registerWorkflowSchema,
  attachWorkflowJsonController,
} from "@cyoda/workflow-monaco";

registerWorkflowSchema(monaco);

const editor = monaco.editor.create(containerEl, {
  model: monaco.editor.createModel(workflowJson, "json"),
});

const controller = attachWorkflowJsonController({
  monaco,
  editor,
  debounceMs: 300,
  onPatch: (patch) => store.dispatch(patch),  // replaceSession patch
  onStatus: (s) => setStatus(s),
  onIssues: (issues) => setMarkers(issues),
});

// later
controller.dispose();
```

Behaviour:

- 300 ms debounce on edits.
- Valid JSON → `replaceSession` patch dispatched; synthetic UUIDs reused
  across edits.
- Invalid JSON → canonical model untouched; status `"invalid-json"`.
- `ValidationIssue[]` mapped to Monaco markers via `issuesToMarkers(...)`.
- `idAtOffset` / `revealIdInEditor` / `attachCursorSelectionBridge` wire
  canvas ↔ JSON bidirectional selection.
- When `replaceSession` removes states, stale layout positions and comment
  attachments are cleaned automatically.

The package has **no runtime Monaco imports** — all Monaco surfaces are
described by structural `MonacoLike` / `TextModelLike` / `EditorLike`
interfaces so consumers inject their own Monaco build.

---

## Backend integration

Implement `WorkflowApi` from `@cyoda/workflow-core` and wire it into the
editor via `useSaveFlow`:

```ts
import type { WorkflowApi } from "@cyoda/workflow-core";
import {
  WorkflowApiConflictError,
  WorkflowApiTransportError,
} from "@cyoda/workflow-core";

export const myApi: WorkflowApi = {
  async exportWorkflows(entity) {
    const res = await fetch(`/api/workflows/${entity.id}`);
    if (!res.ok) throw new WorkflowApiTransportError(res, res.statusText);
    return res.json();
  },
  async importWorkflows(entity, payload, opts) {
    const res = await fetch(`/api/workflows/${entity.id}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(opts?.concurrencyToken ? { "if-match": opts.concurrencyToken } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 409) throw new WorkflowApiConflictError(entity, (await res.json()).concurrencyToken);
    if (!res.ok) throw new WorkflowApiTransportError(res, res.statusText);
    return res.json();
  },
};
```

```tsx
import { useSaveFlow, SaveConfirmModal, ConflictBanner } from "@cyoda/workflow-react";

function SaveShell({ doc, api }) {
  const save = useSaveFlow({ api, document: doc });
  return (
    <>
      <button onClick={() => save.requestSave("MERGE")} disabled={save.status.kind === "saving"}>
        Save
      </button>
      {save.status.kind === "confirming" && (
        <SaveConfirmModal status={save.status} diff={save.diff} onConfirm={save.confirmSave} onCancel={save.cancel} />
      )}
      {save.status.kind === "conflict" && (
        <ConflictBanner onReload={save.reload} onForceOverwrite={save.forceOverwrite} />
      )}
    </>
  );
}
```

Import modes: `MERGE` (default, no ack), `REPLACE` (requires ack),
`ACTIVATE` (requires ack). HTTP 409 → non-dismissable `ConflictBanner`.

---

## Domain model

- `parseImportPayload(json, prior?)` — JSON.parse → Zod schema → operator
  alias normalisation → input normalisation → synthetic-ID assignment →
  semantic validation. When `prior` (`EditorMetadata`) is supplied, UUIDs
  are reused by `(workflow, state, ordinal)` identity.
- `projectToGraph(document)` — one `StateNode` per state, one transition
  edge per transition with criterion/processor/execution summaries.
- `applyPatch(document, patch)` — Immer-backed; bumps `meta.revision`;
  UI-only patches (`setNodePosition`, `addComment`, etc.) short-circuit the
  session pipeline and do not touch exported JSON.
- `applyTransaction(document, tx)` — applies a `PatchTransaction`
  (multiple patches as one undo step).
- `invertPatch(document, patch)` / `invertTransaction(document, tx)` —
  exact inverses for all patch families; powers undo/redo.
- `serializeImportPayload(document)` — byte-stable output; excludes all
  editor metadata.

---

## Accessibility

- Modals: `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape cancels,
  focus traps on mount and restores on unmount.
- Validation pills: `role="status"` with `aria-live="polite"`.
- Inline validation errors: `role="alert"`.
- Keyboard: all core editing actions reachable without a mouse (see
  keyboard shortcut table above).

---

## Testing and quality gates

```sh
pnpm test       # all unit + integration tests
pnpm typecheck  # TypeScript across all packages
pnpm build      # tsup build for all packages
pnpm lint       # ESLint across packages + apps
pnpm bench      # micro-benchmarks for core parse/validate/serialize/patch
```

Current test counts (all green):

| Package | Tests |
|---|---:|
| `workflow-core` | 63 |
| `workflow-graph` | 13 |
| `workflow-viewer` | 8 |
| `workflow-layout` | 24 |
| `workflow-react` | 66 |
| `workflow-monaco` | 12 |
| **Total** | **186** |

Perf budgets (M1-class CPU, `pnpm bench`; budgets match `packages/workflow-core/tests/perf/bench.bench.ts`):

- parse + validate at 50 states: < 30 ms
- parse + validate at 500 states: < 250 ms (dense `generateGrid(500, 4)` fixture; typical real workflows are faster)
- serialize at 500 states: < 100 ms
- applyPatch on 100-state graph: < 8 ms

> **Note:** The 500-state parse benchmark uses an artificially dense grid fixture (~2000 transitions). Measured mean on M1 Pro at the time of the v0.1 release review was ~630 ms, which exceeds this budget. This is a known tracking item; the budget will be revised or the fixture replaced in a follow-up.

Visual regression: `apps/docs-embed-demo/tests/visual/` drives Playwright
against the running dev server. Capture baselines with
`pnpm --filter @cyoda/docs-embed-demo visual:update` before the first
CI run.

---

## Release model

Uses [Changesets](https://github.com/changesets/changesets) for versioning;
CI is the only publisher.

```sh
# 1. Add a changeset in your PR
pnpm changeset

# 2. Merge PRs to main; CI maintains the Version Packages PR

# 3. Merge the Version Packages PR to publish
```

Rules:
- Do not run `npm publish` from a laptop.
- `cyoda-workflow-editor` and `@cyoda/docs-embed-demo` remain private.
- Changesets drives all semver decisions.

---

## Deferred / future work

- Arrow-key navigation between connected nodes on the canvas.
- ELK worker offload for workflows with > 30 states (sync path is in
  place; worker wrapper not yet wired).
- Storybook catalogue for Inspector editor components.
- `@cyoda/workflow-svg-export` — server-side SVG generation.
- Visual regression baselines (capture before first `test:visual` CI run).

---

## Licence

Licensed under Apache-2.0. See [LICENSE](LICENSE).
