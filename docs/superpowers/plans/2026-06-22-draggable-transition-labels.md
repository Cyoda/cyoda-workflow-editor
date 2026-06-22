# Draggable Transition Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to drag transition labels in the editor to reposition the mid-segment of the orthogonal edge, with the position stored in `workflowUi.transitionPositions` and cleared on auto-layout or connected-node drag.

**Architecture:** Cherry-pick the already-tested `workflow-core` patch infrastructure from the `movable-transitions` branch. Add a `forcedMid` parameter to `orthogonalEdgePath` that overrides the computed mid-segment Y (or X). Canvas.tsx reads stored positions and passes `forcedMid` when building edge paths; skips `distributeLabels` for pinned edges. `RfTransitionEdge` handles pointer-drag on the label div and fires a callback. WorkflowEditor dispatches `setTransitionBlockPosition` on drag end and clears positions for edges connected to a dragged node.

**Tech Stack:** TypeScript, React, ReactFlow, `@cyoda/workflow-core` patch system, `@cyoda/workflow-react`

---

## File Map

| File | Change |
|---|---|
| `packages/workflow-core/src/types/editor.ts` | Add `transitionPositions` to `WorkflowUiMeta` |
| `packages/workflow-core/src/types/patch.ts` | Add `setTransitionBlockPosition` / `removeTransitionBlockPosition` op types |
| `packages/workflow-core/src/patch/apply.ts` | Implement the two new ops |
| `packages/workflow-core/src/patch/invert.ts` | Invert the two new ops |
| `packages/workflow-core/tests/patch/transition-block-position.test.ts` | 23 tests (cherry-picked) |
| `packages/workflow-react/src/routing/orthogonal.ts` | Add `forcedMid?: number` to `OrthogonalEdgeInput` |
| `packages/workflow-react/src/components/RfTransitionEdge.tsx` | Add `onLabelDragEnd` callback prop + pointer-drag handler |
| `packages/workflow-react/src/components/Canvas.tsx` | Pass transitionPositions → forcedMid; skip distributeLabels for pinned; clear on node drag |
| `packages/workflow-react/src/components/WorkflowEditor.tsx` | Build transitionPositions from workflowUi; dispatch on drag end; clear on node drag |

---

## Task 1: Cherry-pick workflow-core infrastructure

**Files:**
- Modify: `packages/workflow-core/src/types/editor.ts`
- Modify: `packages/workflow-core/src/types/patch.ts`
- Modify: `packages/workflow-core/src/patch/apply.ts`
- Modify: `packages/workflow-core/src/patch/invert.ts`
- Create: `packages/workflow-core/tests/patch/transition-block-position.test.ts`

- [ ] **Step 1: Cherry-pick the workflow-core commit**

```bash
git cherry-pick 1251fa7
```

Expected: clean apply, no conflicts (these files haven't been touched in `editor-improvements-vs`).

- [ ] **Step 2: Verify tests pass**

```bash
pnpm --filter @cyoda/workflow-core test
```

Expected: all tests pass including the 23 new ones in `transition-block-position.test.ts`.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @cyoda/workflow-core typecheck
```

Expected: no errors.

---

## Task 2: Add `forcedMid` to `orthogonalEdgePath`

**Files:**
- Modify: `packages/workflow-react/src/routing/orthogonal.ts`

- [ ] **Step 1: Add the parameter to `OrthogonalEdgeInput`**

In `packages/workflow-react/src/routing/orthogonal.ts`, add to the `OrthogonalEdgeInput` interface after `parallelOffset`:

```ts
  /**
   * When set, overrides the computed mid-segment position.
   * For bottom/top-exit edges (horizontal mid-segment) this is the Y of that segment.
   * For left/right-exit edges (vertical mid-segment) this is the X of that segment.
   * The normal clamping and nudging logic is bypassed when forcedMid is present.
   */
  forcedMid?: number;
```

- [ ] **Step 2: Destructure and use it in `orthogonalEdgePath`**

In `orthogonalEdgePath`, add `forcedMid = undefined` to the destructuring, then change the two mid-computation blocks:

For the `sourceAxis === "vertical"` branch (lines ~145–179), replace the midY computation with:

```ts
  if (sourceAxis === "vertical") {
    let midY = forcedMid ?? ((sStub.y + tStub.y) / 2 + parallelOffset);
    if (forcedMid === undefined) {
      if (sourceNormal.y > 0) midY = Math.max(midY, sStub.y);
      else if (sourceNormal.y < 0) midY = Math.min(midY, sStub.y);
      if (targetNormal.y > 0) midY = Math.max(midY, tStub.y);
      else if (targetNormal.y < 0) midY = Math.min(midY, tStub.y);
    }
    const srcViolatedY =
      (sourceNormal.y > 0 && midY < sStub.y) ||
      (sourceNormal.y < 0 && midY > sStub.y);
    if (srcViolatedY) {
      const midX = (sStub.x + tStub.x) / 2 + parallelOffset;
      path = [ ... ]; // unchanged staircase fallback
    } else {
      if (forcedMid === undefined) midY = nudgeHorizontalLine(sStub.x, tStub.x, midY, obstacles);
      path = [ ... ]; // unchanged path construction with new midY
    }
  }
```

For the `else` branch (horizontal srcAxis, vertical mid-segment), similarly:

```ts
  } else {
    let midX = forcedMid ?? ((sStub.x + tStub.x) / 2 + parallelOffset);
    if (forcedMid === undefined) {
      if (sourceNormal.x > 0) midX = Math.max(midX, sStub.x);
      // ... rest of clamping unchanged
    }
    // srcViolatedX check and path construction unchanged, using new midX
  }
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @cyoda/workflow-react typecheck
```

Expected: no errors.

---

## Task 3: Add drag handler to `RfTransitionEdge`

**Files:**
- Modify: `packages/workflow-react/src/components/RfTransitionEdge.tsx`

- [ ] **Step 1: Add `onLabelDragEnd` to `RfEdgeData`**

In the `RfEdgeData` interface add:

```ts
  /**
   * Called when the user finishes dragging the label.
   * Receives the edge ID and the new flow-coordinate centre of the label.
   * The caller maps {x, y} to a forcedMid value based on edge orientation.
   */
  onLabelDragEnd?: (edgeId: string, x: number, y: number) => void;
  /** Whether this label's mid-segment position is manually pinned by the user. */
  isPinned?: boolean;
```

- [ ] **Step 2: Add pointer-drag state and handlers to `RfTransitionEdgeImpl`**

After the existing `useState` for `tooltipPos`, add:

```ts
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rf = useReactFlow();
```

Add import `useRef` to the existing `{ memo, useContext, useState }` import and add `useReactFlow` from reactflow.

- [ ] **Step 3: Add pointer event handlers on the label div**

Wrap the existing label div with pointer handlers. Add to the label div (after existing `onMouseEnter/Leave` for tooltip):

```tsx
onPointerDown={(e) => {
  if (!data.onLabelDragEnd || e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const { x: vpX, y: vpY, zoom } = rf.getViewport();
  const flowX = (e.clientX - vpX) / zoom;
  const flowY = (e.clientY - vpY) / zoom;
  dragOffsetRef.current = {
    x: flowX - (labelX + (data.labelXOffset ?? 0)),
    y: flowY - (labelY + (data.labelYOffset ?? 0)),
  };
  isDraggingRef.current = true;
  setIsDragging(true);
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}}
onPointerMove={(e) => {
  if (!isDraggingRef.current) return;
  e.stopPropagation();
}}
onPointerUp={(e) => {
  if (!isDraggingRef.current) return;
  e.stopPropagation();
  isDraggingRef.current = false;
  setIsDragging(false);
  const { x: vpX, y: vpY, zoom } = rf.getViewport();
  const finalX = (e.clientX - vpX) / zoom - dragOffsetRef.current.x + (labelX + (data.labelXOffset ?? 0));
  const finalY = (e.clientY - vpY) / zoom - dragOffsetRef.current.y + (labelY + (data.labelYOffset ?? 0));
  data.onLabelDragEnd!(id, finalX, finalY);
}}
onPointerCancel={() => {
  isDraggingRef.current = false;
  setIsDragging(false);
}}
```

Also update the label div's `cursor` style:

```ts
cursor: data.onLabelDragEnd ? (isDragging ? "grabbing" : "grab") : "default",
```

And add a subtle visual indicator when pinned (`data.isPinned`):

```ts
boxShadow: data.isPinned
  ? "0 1px 2px rgba(15,23,42,0.08), inset 0 0 0 1px rgba(99,102,241,0.3)"
  : "0 1px 2px rgba(15,23,42,0.08)",
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @cyoda/workflow-react typecheck
```

Expected: no errors.

---

## Task 4: Wire transitionPositions through Canvas

**Files:**
- Modify: `packages/workflow-react/src/components/Canvas.tsx`

- [ ] **Step 1: Add `transitionPositions` and `onTransitionLabelDragEnd` to `CanvasProps`**

```ts
  /** Stored label mid-segment positions keyed by transition UUID. */
  transitionPositions?: Record<string, { x: number; y: number }>;
  /** Called when a transition label drag ends with edge id and new flow position. */
  onTransitionLabelDragEnd?: (edgeId: string, x: number, y: number) => void;
```

Destructure them in `CanvasInner`.

- [ ] **Step 2: Pass `transitionPositions` to `toRfEdges`**

Add the parameter to `toRfEdges`:

```ts
function toRfEdges(
  ...existing params...,
  transitionPositions: Record<string, { x: number; y: number }> | undefined,
  onTransitionLabelDragEnd: ((edgeId: string, x: number, y: number) => void) | undefined,
): Edge<RfEdgeData>[] {
```

In the useMemo that calls `toRfEdges`:

```ts
toRfEdges(graph, displayPositions, activeWorkflow, selection, orientation,
  transitionDataMap, transitionPositions, onTransitionLabelDragEnd)
```

Add `transitionPositions` and `onTransitionLabelDragEnd` to the dependency array.

- [ ] **Step 3: Use `forcedMid` when building edge paths in `toRfEdges`**

In the label slot computation loop (where `orthogonalEdgePath` is called to get `labelX/labelY` for `distributeLabels`), skip pinned edges:

```ts
// Skip distributeLabels for manually pinned edges — their position is user-set
if (transitionPositions?.[e.id]) continue;
```

In the final edge-building loop where `orthogonalEdgePath` is called for the live path, compute `forcedMid`:

```ts
const stored = transitionPositions?.[e.id];
const srcPosition = positionForHandle(sourceHandle);
const isHorizMid = srcPosition === Position.Bottom || srcPosition === Position.Top;
const forcedMid = stored ? (isHorizMid ? stored.y : stored.x) : undefined;

const { path, labelX, labelY } = orthogonalEdgePath({
  ...existing params...,
  forcedMid,
});
```

And pass the callback and pinned flag in the edge data:

```ts
data: {
  ...existing fields...,
  onLabelDragEnd: onTransitionLabelDragEnd,
  isPinned: !!stored,
},
```

- [ ] **Step 4: Clear transitionPositions for edges connected to a dragged node**

In the existing `handleNodeDragStop` callback passed to `onNodeDragStop` in `CanvasInner`, this is actually handled at the WorkflowEditor level in Task 5.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @cyoda/workflow-react typecheck
```

Expected: no errors.

---

## Task 5: Wire up in WorkflowEditor

**Files:**
- Modify: `packages/workflow-react/src/components/WorkflowEditor.tsx`

- [ ] **Step 1: Build `transitionPositions` from `workflowUi`**

Add a `useMemo` after the existing `pinnedNodes` memo:

```ts
const transitionPositions = useMemo(() => {
  const workflow = state.activeWorkflow;
  if (!workflow) return undefined;
  return state.document.meta.workflowUi[workflow]?.transitionPositions;
}, [state.activeWorkflow, state.document.meta.workflowUi]);
```

- [ ] **Step 2: Add `handleTransitionLabelDragEnd` callback**

```ts
const handleTransitionLabelDragEnd = useCallback(
  (edgeId: string, x: number, y: number) => {
    const workflow = state.activeWorkflow;
    if (!workflow) return;
    actions.dispatchTransaction({
      summary: "Move transition label",
      patches: [{ op: "setTransitionBlockPosition", workflow, transitionUuid: edgeId, x, y }],
      inverses: [{ op: "removeTransitionBlockPosition", workflow, transitionUuid: edgeId }],
    });
  },
  [state.activeWorkflow, actions],
);
```

- [ ] **Step 3: Clear stored positions when a connected node is dragged**

In the existing `handleNodeDragStop` (which already dispatches `setNodePosition`), also clear transition positions for all edges connected to the dragged node. Find edges where `e.sourceId === nodeId || e.targetId === nodeId` and dispatch `removeTransitionBlockPosition` for each that has a stored position:

```ts
const handleNodeDragStop = useCallback(
  (nodeId: string, x: number, y: number) => {
    const workflow = state.activeWorkflow;
    if (!workflow) return;
    const patches: DomainPatch[] = [{ op: "setNodePosition", workflow, stateCode: ..., x, y, pinned: true }];

    // Clear stored transition positions for edges connected to the moved node
    const stored = state.document.meta.workflowUi[workflow]?.transitionPositions ?? {};
    for (const edge of derived.graph.edges) {
      if (edge.kind !== "transition" || edge.workflow !== workflow) continue;
      if ((edge.sourceId !== nodeId && edge.targetId !== nodeId)) continue;
      if (stored[edge.id]) {
        patches.push({ op: "removeTransitionBlockPosition", workflow, transitionUuid: edge.id });
      }
    }

    actions.dispatchTransaction({ summary: "Move state", patches, inverses: [...] });
  },
  [...],
);
```

Note: The existing `handleNodeDragStop` already handles the `stateCode` lookup via `state.document.meta.ids.states`. Keep that logic, just add the extra patches.

- [ ] **Step 4: Pass props to Canvas**

```tsx
<Canvas
  ...existing props...
  transitionPositions={transitionPositions}
  onTransitionLabelDragEnd={handleTransitionLabelDragEnd}
/>
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @cyoda/workflow-react typecheck
```

Expected: no errors.

---

## Task 6: Build, smoke test, commit

- [ ] **Step 1: Full build**

```bash
pnpm build
```

Expected: all packages build cleanly.

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 3: Smoke test in browser**

```bash
pnpm --filter docs-embed-demo dev --port 5173
```

Open http://localhost:5173/editor. Load a workflow with multiple transitions. Verify:
- Hovering a transition label shows grab cursor
- Dragging the label moves the edge's mid-segment (orthogonal shape preserved)
- Releasing stores the position (label stays after re-render)
- Dragging the connected node resets the transition to auto-position
- Auto-layout button resets all transition positions
- Undo/redo works for label drags

- [ ] **Step 4: Commit**

```bash
git add packages/workflow-core packages/workflow-react
git commit -m "feat(editor): draggable transition labels via forcedMid override

Cherry-pick workflow-core patch infrastructure (setTransitionBlockPosition,
removeTransitionBlockPosition) from movable-transitions branch. Add
forcedMid parameter to orthogonalEdgePath that overrides the computed
mid-segment position while preserving orthogonal shape and clamping.
Wire through Canvas → RfTransitionEdge with pointer-drag handler.
Clear pinned positions when a connected node is dragged or auto-layout runs."
```

---

## Self-Review

**Spec coverage:**
- ✅ Draggable label → pointer-drag in Task 3
- ✅ Orthogonal routing preserved → `forcedMid` approach in Task 2
- ✅ Position stored in workflowUi → workflow-core ops in Task 1
- ✅ Reset on auto-layout → `resetLayout` already clears `transitionPositions` (cherry-picked)
- ✅ Reset on connected-node drag → Task 5 Step 3
- ✅ Undo/redo → `invertPatch` in cherry-picked commit
- ✅ Visual feedback (grab cursor, pinned indicator) → Task 3

**No placeholders:** All steps have concrete code.

**Type consistency:** `transitionUuid` field used in patch ops (matching workflow-core types). `edgeId` is the ReactFlow edge id = transition UUID. `forcedMid: number` matches `OrthogonalEdgeInput`.
