# `@cyoda/workflow-layout`

ELK-based automatic layout for Cyoda workflow graphs with support for
pinned/manual node positions.

## Install

```sh
npm install @cyoda/workflow-core @cyoda/workflow-graph @cyoda/workflow-layout
```

## Usage

```ts
import { layoutGraph } from "@cyoda/workflow-layout";

const result = await layoutGraph(graph, {
  preset: "configuratorReadable",  // "websiteCompact" | "configuratorReadable" | "opsAudit"
  orientation: "vertical",          // "vertical" | "horizontal"
  pinned: [
    { id: stateNodeUuid, x: 100, y: 200 },  // pinned positions are respected as-is
  ],
});

// result.positions  — Map<nodeId, { x, y, width, height }>
// result.edges      — Map<edgeId, { points, labelX, labelY }>
```

## Pinned / manual positions

Pass `pinned` in `LayoutOptions` to preserve specific node positions while
ELK places the rest automatically. This is used by `@cyoda/workflow-react`
to implement drag-and-persist layout:

- Dragging a state calls `setNodePosition` → stored in
  `WorkflowUiMeta.layout.nodes` (editor metadata only, never exported).
- On the next layout run, the pinned positions from metadata are passed
  into `layoutGraph`, so dragged states keep their coordinates.
- **Reset Layout** clears all pinned positions; ELK then places everything.
- **Auto Layout** reruns ELK while respecting existing pins.

## Layout presets

| Preset | Description |
|---|---|
| `websiteCompact` | Tight horizontal flow for docs embeds. |
| `configuratorReadable` | Balanced vertical flow for editors. |
| `opsAudit` | Spread layout for operations dashboards. |

## Documentation

See the [repository README](https://github.com/Cyoda-platform/cyoda-workflow-editor#readme).

## License

Apache-2.0
