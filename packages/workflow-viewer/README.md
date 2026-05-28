# `@cyoda/workflow-viewer`

Slim read-only SVG viewer for Cyoda workflow graphs. No React Flow, no
Monaco, no editor-only dependencies.

## Install

```sh
npm install @cyoda/workflow-core @cyoda/workflow-graph @cyoda/workflow-viewer react react-dom
```

## Usage

```tsx
import { parseImportPayload } from "@cyoda/workflow-core";
import { projectToGraph } from "@cyoda/workflow-graph";
import { WorkflowViewer } from "@cyoda/workflow-viewer";

const { document } = parseImportPayload(workflowJson);

export function Embed() {
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

## Optional ELK layout

```tsx
import { layoutGraph } from "@cyoda/workflow-layout";

const layout = await layoutGraph(graph, { preset: "configuratorReadable" });
<WorkflowViewer graph={graph} layout={layout} />
```

Without a `layout` prop the viewer uses its own simple fallback layout.

## What this package provides

- SVG rendering of states and transitions using Cyoda visual conventions
  (initial marker, terminal pill, role-coloured borders, dashed loopbacks,
  manual/disabled/criteria/processor badges).
- Pan and zoom via mouse drag and Ctrl+wheel.
- Click-to-select; selection value is the synthetic node UUID.
- Theme tokens from `@cyoda/workflow-viewer/theme` (override via CSS
  custom properties).

## What this package does NOT provide

- No drag-connect, delete, or edit affordances — use `@cyoda/workflow-react`.
- No JSON editor — pair with `@cyoda/workflow-monaco`.
- No React Flow — this package is intentionally free of React Flow to keep
  the display-only bundle small.
- No editor metadata (layout positions, comments) — those live in
  `@cyoda/workflow-core`'s `WorkflowUiMeta` and are managed by the editor
  shell, not the viewer.

## Bundle boundary guarantee

`@cyoda/workflow-viewer` depends only on `@cyoda/workflow-graph` and React.
It has no dependency on `@cyoda/workflow-react`, `@cyoda/workflow-layout`,
`@cyoda/workflow-monaco`, or `reactflow`. This boundary is enforced by
the package manifest and verified in the bundle audit.

## Documentation

See the [repository README](https://github.com/Cyoda-platform/cyoda-workflow-editor#readme).

## License

Apache-2.0
