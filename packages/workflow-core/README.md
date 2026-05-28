# `@cyoda/workflow-core`

Core domain package for parsing, normalizing, validating, patching, and
serializing Cyoda workflow documents.

## Install

```sh
npm install @cyoda/workflow-core
```

## Highlights

- Parse and validate workflow import/export payloads (Zod schemas).
- Normalize documents into canonical `WorkflowEditorDocument` state.
- Apply and invert domain patches with exact inverses.
- `PatchTransaction` — group multiple patches into one atomic undo step.
- Deterministic serialization — exported JSON excludes all editor metadata.
- Editor metadata types: `WorkflowUiMeta`, `CommentMeta` (layout/comments
  never appear in exported Cyoda JSON).

## Patch families

| Op | Description |
|---|---|
| `addState` / `renameState` / `removeState` | State lifecycle |
| `setInitialState` | Promote a state to initial |
| `addTransition` / `updateTransition` / `removeTransition` | Transition editing |
| `reorderTransition` | Reorder within source state |
| `moveTransitionSource` | Move transition to a different source state |
| `addProcessor` / `updateProcessor` / `removeProcessor` / `reorderProcessor` | Processor editing |
| `setCriterion` | Set or clear a criterion at an arbitrary path |
| `addWorkflow` / `removeWorkflow` / `updateWorkflowMeta` / `renameWorkflow` | Workflow lifecycle |
| `setImportMode` / `setEntity` | Session metadata |
| `replaceSession` | Replace full session (Monaco JSON edits) |
| `setEdgeAnchors` | UI-only: edge anchor overrides |
| `setNodePosition` / `removeNodePosition` / `resetLayout` | UI-only: manual layout |
| `addComment` / `updateComment` / `removeComment` | UI-only: canvas comments |

All UI-only patches write to `meta.workflowUi` and are excluded from
`serializeImportPayload` output.

## Exact inverses

`invertPatch(doc, patch)` returns a patch that, when applied after the
original, restores the document to its prior state. Exact inverses are
implemented for all patch families including reorder, moveTransitionSource,
and all UI-only metadata ops.

`PatchTransaction` groups forward patches with pre-computed inverses for
multi-patch undo in one step:

```ts
import { applyTransaction, invertTransaction } from "@cyoda/workflow-core";

const tx = {
  summary: "Add state at position",
  patches: [
    { op: "addState", workflow: "wf", stateCode: "new" },
    { op: "setNodePosition", workflow: "wf", stateCode: "new", x: 50, y: 100 },
  ],
  inverses: [
    { op: "removeNodePosition", workflow: "wf", stateCode: "new" },
    { op: "removeState", workflow: "wf", stateCode: "new" },
  ],
};
const after = applyTransaction(doc, tx);
const undoTx = invertTransaction(doc, tx);
```

## Deterministic serialization

```ts
import { serializeImportPayload } from "@cyoda/workflow-core";

// Always produces clean, canonical Cyoda workflow JSON.
// Layout positions, comments, edge anchors, and viewport state are excluded.
const json = serializeImportPayload(doc);
```

Fixed key order, 2-space indent, LF, trailing newline. No `operatorType`
aliases in output.

## Editor metadata types

```ts
// WorkflowUiMeta lives in doc.meta.workflowUi[workflowName].
// It is never serialised into exported Cyoda JSON.
interface WorkflowUiMeta {
  layout?: { nodes: Record<StateCode, { x: number; y: number; pinned?: boolean }> };
  comments?: Record<string, CommentMeta>;
  edgeAnchors?: Record<string, EdgeAnchorPair>;
  viewports?: Partial<Record<"vertical" | "horizontal", EditorViewport>>;
}

interface CommentMeta {
  id: string;
  text: string;
  x: number;
  y: number;
  attachedTo?: { kind: "state"; stateCode: string }
             | { kind: "transition"; sourceState: string; transitionName: string }
             | { kind: "free" };
}
```

## Documentation

See the [repository README](https://github.com/Cyoda-platform/cyoda-workflow-editor#readme).

## License

Apache-2.0
