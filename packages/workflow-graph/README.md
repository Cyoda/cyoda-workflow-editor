# `@cyoda/workflow-graph`

Projects Cyoda workflow documents into graph nodes, edges, and annotations
for visual rendering and editing.

## Install

```sh
npm install @cyoda/workflow-core @cyoda/workflow-graph
```

## Projection rules

`projectToGraph(document)` converts a `WorkflowEditorDocument` into a
`GraphDocument` containing:

- **`StateNode`** — one per state; carries `stateCode`, `role` (initial /
  terminal / initial-terminal / normal), `workflow`, and `annotations`
  (validation issues mapped by code).
- **`StartMarkerNode` + start edge** — one per workflow; non-interactive,
  points to the initial state.
- **`TransitionEdge`** — one per transition; carries criterion/processor/
  execution summaries, `isSelf`, `parallelIndex`, `parallelGroupSize`,
  `manual`, `disabled`, and optional per-edge anchor overrides from
  `meta.workflowUi`.

**What does NOT appear in the graph:**

- Layout positions — live in `WorkflowUiMeta.layout`; consumed by
  `@cyoda/workflow-layout`.
- Canvas comments — live in `WorkflowUiMeta.comments`; rendered by the
  editor shell.
- Criterion or processor nodes — these are summaries on edges only.
- Synthetic UUIDs never leak into exported Cyoda workflow JSON.

## Usage

```ts
import { parseImportPayload } from "@cyoda/workflow-core";
import { projectToGraph } from "@cyoda/workflow-graph";

const { document } = parseImportPayload(workflowJson);
const graph = projectToGraph(document);

// graph.nodes — StateNode | StartMarkerNode
// graph.edges — TransitionEdge | StartMarkerEdge
// graph.annotations — GraphAnnotation[]
```

## `applyGraphEdit`

Translates canvas events into `DomainPatch[]`:

```ts
import { applyGraphEdit } from "@cyoda/workflow-graph";

const patches = applyGraphEdit(document, {
  kind: "toggleDisabled",
  transitionUuid: "...",
  disabled: true,
});
```

Supported event kinds: `moveState` (no-op — use `setNodePosition` in
`@cyoda/workflow-core` instead), `renameState`, `deleteState`,
`addTransition`, `deleteTransition`, `reorderTransition`, `toggleDisabled`,
`toggleManual`.

## Documentation

See the [repository README](https://github.com/Cyoda-platform/cyoda-workflow-editor#readme).

## License

Apache-2.0
