---
"@cyoda/workflow-core": minor
"@cyoda/workflow-react": minor
---

Add draggable transition block nodes to the workflow canvas.

Each transition now renders a compact labelled block node on the canvas that can be dragged to any position independently of the source/target state nodes. The block shows the transition name, a processor count badge, and a criterion indicator.

**workflow-core**: New `setTransitionBlockPosition` and `removeTransitionBlockPosition` patch operations write per-transition block positions to `WorkflowUiMeta.transitionPositions`. Both are UI-only patches (do not touch the session, do not appear in serialized workflow JSON). `resetLayout` now also clears `transitionPositions`.

**workflow-react**: New `RfTransitionBlockNode` component registered as `transitionBlock` node type in the React Flow canvas. Transition blocks float over the existing transition edge path. Clicking a block selects the transition. Dragging a block dispatches `setTransitionBlockPosition` and puts the move on the undo stack. Auto Layout clears stored block positions so blocks recompute to midpoints. Retargeting a transition (changing source or next state) also clears the stored block position.
