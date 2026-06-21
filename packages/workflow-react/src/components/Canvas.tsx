import React, { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  applyNodeChanges,
  Background,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type Viewport,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeDragHandler,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import type { ValidationIssue } from "@cyoda/workflow-core";
import type {
  GraphDocument,
  StateNode as GraphStateNode,
  TransitionEdge,
} from "@cyoda/workflow-graph";
import { layoutGraph, estimateNodeSize, type LayoutOptions, type LayoutResult, type NodePosition } from "@cyoda/workflow-layout";
import { ArrowMarkers } from "./ArrowMarkers.js";
import { RfStateNode, type RfStateNodeData } from "./RfStateNode.js";
import { RfTransitionEdge, type RfEdgeData } from "./RfTransitionEdge.js";
import { HoverContext, computeHighlightSet } from "./HoverContext.js";
import { findNonOverlappingCenter, type Rect } from "./newStatePosition.js";
import { orthogonalEdgePath } from "../routing/orthogonal.js";
import { badgesFor } from "@cyoda/workflow-viewer/theme";
import type { Selection } from "../state/types.js";

const nodeTypes = { stateNode: RfStateNode };
const edgeTypes = { transition: RfTransitionEdge };

export interface CanvasProps {
  graph: GraphDocument;
  issues: ValidationIssue[];
  activeWorkflow: string | null;
  selection: Selection;
  layoutOptions?: LayoutOptions;
  savedViewport?: Viewport;
  onSelectionChange: (sel: Selection) => void;
  onViewportChange?: (viewport: Viewport) => void;
  onConnect?: (connection: Connection) => void;
  onReconnect?: (edge: Edge<RfEdgeData>, connection: Connection) => void;
  onNodesDelete?: (nodes: Node<RfStateNodeData>[]) => void;
  onEdgesDelete?: (edges: Edge<RfEdgeData>[]) => void;
  /** Called once per completed drag with the dragged node UUID, its final position, and a snapshot of ALL nodes' positions. */
  onNodeDragStop?: (nodeId: string, x: number, y: number, allPositions: ReadonlyArray<{ id: string; x: number; y: number }>) => void;
  /** Called when the user double-clicks an empty canvas pane location. */
  onPaneDoubleClick?: (x: number, y: number) => void;
  /**
   * Optional ref the canvas populates with a positioner function. Calling it
   * returns a flow-coordinate center point for a new state placed in the centre
   * of the current viewport (nudged to avoid overlapping existing nodes), or
   * null when no canvas is mounted/measured. Used by the "Add State" toolbar
   * button and keyboard shortcut, which live outside the React Flow provider
   * and so cannot read the viewport directly.
   */
  newStatePositionRef?: React.MutableRefObject<(() => { x: number; y: number } | null) | null>;
  /**
   * Increment this counter to force a layout re-run without changing the graph.
   * Useful for the "Auto Layout" toolbar button.
   */
  layoutKey?: number;
  readOnly?: boolean;
  showMinimap?: boolean;
  showControls?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onAutoLayout?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /**
   * Increment when the canvas container changes size without changing graph
   * data, so React Flow can recompute handles and edge attachments.
   */
  resizeKey?: number;
  /** Opens the editor's quick-reference help modal. Omit to hide the button. */
  onHelp?: () => void;
  /** Accessible label / tooltip for the help button. */
  helpLabel?: string;
  /** Transition label positions, keyed by transition UUID (flow coordinates). */
  transitionPositions?: Record<string, { x: number; y: number }>;
  /** Called when the user finishes dragging a transition label. */
  onTransitionLabelDragEnd?: (transitionId: string, x: number, y: number) => void;
}

function toRfNodes(
  graph: GraphDocument,
  layout: LayoutResult,
  activeWorkflow: string | null,
  issuesByNode: Map<string, ValidationIssue[]>,
  selection: Selection,
): Node<RfStateNodeData>[] {
  const stateNodes: Node<RfStateNodeData>[] = graph.nodes
    .filter((n): n is GraphStateNode => n.kind === "state")
    .filter((n) => !activeWorkflow || n.workflow === activeWorkflow)
    .map((n) => {
      const pos = layout.positions.get(n.id);
      const nodeIssues = issuesByNode.get(n.id) ?? [];
      const hasError = nodeIssues.some((i) => i.severity === "error");
      const hasWarning = nodeIssues.some((i) => i.severity === "warning");
      const selected =
        selection?.kind === "state" && selection.nodeId === n.id;
      const size = pos
        ? { width: pos.width, height: pos.height }
        : estimateNodeSize(n.stateCode);
      return {
        id: n.id,
        type: "stateNode",
        data: {
          node: n,
          hasError,
          hasWarning,
          size,
        },
        position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
        selected,
        // width/height on the node object tells ReactFlow the dimensions
        // before ResizeObserver fires. fitView's nodesInitialized guard
        // (nodes.every(n => n.width && n.height)) requires these to be set
        // or it returns false and leaves the viewport at {x:0, y:0, zoom:1}.
        width: size.width,
        height: size.height,
        style: { width: size.width, height: size.height },
      };
    });

  return stateNodes;
}

// Module-level canvas context for label text measurement (created once).
let _labelMeasureCtx: CanvasRenderingContext2D | null | undefined;
function measureLabelText(text: string): number {
  if (_labelMeasureCtx === undefined) {
    try {
      const cvs = document.createElement("canvas");
      _labelMeasureCtx = cvs.getContext("2d");
      if (_labelMeasureCtx) {
        _labelMeasureCtx.font =
          '700 9px -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif';
      }
    } catch {
      _labelMeasureCtx = null;
    }
  }
  if (!_labelMeasureCtx) return text.length * 6;
  // measureText doesn't account for CSS letter-spacing (0.04em @ 9px = 0.36px/char).
  return _labelMeasureCtx.measureText(text.toUpperCase()).width + text.length * 0.36;
}

/**
 * Cluster overlapping labels along one axis and distribute them symmetrically
 * around their cluster mean.
 *
 * "main" axis = the axis along which we separate labels (X for horizontal
 * segments, Y for vertical segments). "cross" axis = the perpendicular axis
 * used only to decide whether two labels are in the same band.
 */
function distributeLabels(
  slots: Array<{ edgeId: string; main: number; mainSize: number; cross: number; crossSize: number }>,
  gap: number,
): Map<string, number> {
  const n = slots.length;
  if (n <= 1) return new Map();

  // Union-Find with path compression.
  const parent: number[] = [];
  for (let i = 0; i < n; i++) parent.push(i);
  const find = (i: number): number => {
    let j = i;
    while (parent[j] !== j) j = parent[j]!;
    while (parent[i] !== j) { const nx = parent[i]!; parent[i] = j; i = nx; }
    return j;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = slots[i]!, b = slots[j]!;
      const crossOverlap = Math.abs(a.cross - b.cross) < (a.crossSize + b.crossSize) / 2;
      const mainNear = Math.abs(a.main - b.main) < (a.mainSize + b.mainSize) / 2 + gap;
      if (crossOverlap && mainNear) parent[find(i)] = find(j);
    }
  }

  const clusters = new Map<number, typeof slots>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(slots[i]!);
  }

  const offsets = new Map<string, number>();
  for (const cluster of clusters.values()) {
    if (cluster.length <= 1) continue;
    cluster.sort((a, b) => a.main - b.main);
    const total = cluster.reduce((s, c) => s + c.mainSize, 0) + gap * (cluster.length - 1);
    const mean = cluster.reduce((s, c) => s + c.main, 0) / cluster.length;
    let pos = mean - total / 2;
    for (const slot of cluster) {
      const target = pos + slot.mainSize / 2;
      const delta = target - slot.main;
      if (Math.abs(delta) > 0.5) offsets.set(slot.edgeId, delta);
      pos += slot.mainSize + gap;
    }
  }
  return offsets;
}

function toRfEdges(
  graph: GraphDocument,
  displayPositions: Map<string, NodePosition>,
  activeWorkflow: string | null,
  selection: Selection,
  orientation: "vertical" | "horizontal",
  transitionPositions: Record<string, { x: number; y: number }> | undefined,
  onTransitionLabelDragEnd: ((transitionId: string, x: number, y: number) => void) | undefined,
): Edge<RfEdgeData>[] {
  const stateById = new Map(
    graph.nodes
      .filter((n): n is GraphStateNode => n.kind === "state")
      .map((n) => [n.id, n]),
  );
  // Precompute obstacle bounding boxes from the currently displayed node
  // positions. These can differ from the latest ELK result during and shortly
  // after a manual drag.
  const allObstacles = Array.from(displayPositions.values())
    .map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
    }));
  const transitions = graph.edges
    .filter((e): e is TransitionEdge => e.kind === "transition")
    .filter((e) => !activeWorkflow || e.workflow === activeWorkflow);
  const terminalIds = new Set(
    graph.nodes
      .filter((n): n is GraphStateNode => n.kind === "state" && (n.role === "terminal" || n.role === "initial-terminal"))
      .map((n) => n.id),
  );
  const autoHandles = computeAutoHandles(
    transitions,
    displayPositions,
    orientation,
    terminalIds,
  );

  // Compute lateral offsets for parallel edges (same source→target pair).
  const PARALLEL_STEP = 36;
  const pairGroups = new Map<string, string[]>();
  for (const e of transitions) {
    const key = `${e.sourceId}->${e.targetId}`;
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key)!.push(e.id);
  }
  const parallelOffsets = new Map<string, number>();
  for (const [, group] of pairGroups.entries()) {
    if (group.length <= 1) continue;
    const n = group.length;
    // group is already in parallelIndex order (push order = transitions order).
    // parallelIndex=0 gets the center/leftmost source handle (same tiebreaker
    // used in sortEndpointAssignments), so it should bend LOWER (more positive
    // midY) to avoid path crossings with the right-handle edge.
    for (let i = 0; i < n; i++) {
      const idx = n - 1 - i;
      parallelOffsets.set(group[i]!, (idx - (n - 1) / 2) * PARALLEL_STEP);
    }
  }

  // Fan-out offset: when a source has edges to multiple targets on the same Y
  // row, all edges compute the same midY bend → horizontal segments overlap.
  // Group by unique TARGET (not by edge) so that a parallel pair of edges to
  // the same target counts as ONE slot. Compute a fan-out offset per slot and
  // ADD it to whatever pair-group offset the edges already have — the two
  // adjustments are orthogonal (pair shifts lateral position, fan-out shifts
  // bend height).
  // Sort: left-going slots by ascending tgtX (furthest-left bends highest),
  // then right-going slots by descending tgtX (furthest-right bends next
  // highest). This prevents horizontal/vertical crossings between slots.
  const fanGroups = new Map<
    string,
    { srcId: string; tgtId: string; tgtX: number; srcX: number; slotSize: number }[]
  >();
  for (const e of transitions) {
    const tgtPos = displayPositions.get(e.targetId);
    const srcPos = displayPositions.get(e.sourceId);
    if (!tgtPos || !srcPos) continue;
    const rowY = Math.round(tgtPos.y);
    const key = `${e.sourceId}|row${rowY}`;
    if (!fanGroups.has(key)) fanGroups.set(key, []);
    const arr = fanGroups.get(key)!;
    if (!arr.some((t) => t.tgtId === e.targetId)) {
      // slotSize = how many parallel edges share this source→target pair.
      // Used to scale the fan step so that even the innermost pair edge
      // lands on the correct side of zero after combining with its pair offset.
      const slotSize = pairGroups.get(`${e.sourceId}->${e.targetId}`)?.length ?? 1;
      arr.push({
        srcId: e.sourceId,
        tgtId: e.targetId,
        tgtX: tgtPos.x + tgtPos.width / 2,
        srcX: srcPos.x + srcPos.width / 2,
        slotSize,
      });
    }
  }
  // Build per-(source→target) fan-out offsets.
  // fanStep scales with the largest slot so that combined offsets (pair + fan)
  // are always on the correct side of the midY default for every edge.
  const pairFanOffsets = new Map<string, number>();
  for (const group of fanGroups.values()) {
    if (group.length <= 1) continue;
    const maxSlotSize = Math.max(...group.map((s) => s.slotSize));
    const fanStep = maxSlotSize * PARALLEL_STEP;
    const left  = group.filter((e) => e.tgtX <  e.srcX).sort((a, b) => a.tgtX - b.tgtX);
    const right = group.filter((e) => e.tgtX >= e.srcX).sort((a, b) => b.tgtX - a.tgtX);
    const sorted = [...left, ...right];
    const n = sorted.length;
    for (let i = 0; i < n; i++) {
      pairFanOffsets.set(
        `${sorted[i]!.srcId}→${sorted[i]!.tgtId}`,
        (i - (n - 1) / 2) * fanStep,
      );
    }
  }
  // Apply fan-out offsets additively to parallelOffsets.
  for (const e of transitions) {
    const fanOffset = pairFanOffsets.get(`${e.sourceId}→${e.targetId}`);
    if (fanOffset === undefined) continue;
    parallelOffsets.set(e.id, (parallelOffsets.get(e.id) ?? 0) + fanOffset);
  }

  // ── Stub conflict: handle reassignment ──────────────────────────────────
  // When two edges from different source nodes at the same Y exit in opposite
  // horizontal directions and their first stubs overlap in X, reassign one to
  // the -top sub-handle and the other to the -bottom sub-handle so they
  // naturally start at different Y positions without any path kink.
  const ROUTE_STUB = 48; // keep in sync with DEFAULT_STUB in orthogonal.ts
  {
    type SI = { edgeId: string; srcNodeId: string; srcHandle: string; srcX: number; srcY: number; midX: number };
    const stubInfos: SI[] = [];
    for (const e of transitions) {
      if (e.isSelf) continue;
      const srcPos = displayPositions.get(e.sourceId);
      const tgtPos = displayPositions.get(e.targetId);
      if (!srcPos || !tgtPos) continue;
      const srcHandle = autoHandles.get(`${e.id}:source`);
      const tgtHandle = autoHandles.get(`${e.id}:target`);
      // Only process center handles — sub-handles are already separated by splitHandleFor.
      if (srcHandle !== "right" && srcHandle !== "left") continue;
      const srcPt = pointForHandle(srcPos, srcHandle);
      const tgtPt = pointForHandle(tgtPos, tgtHandle);
      if (!srcPt || !tgtPt) continue;
      const srcP = positionForHandle(srcHandle);
      const tgtP = positionForHandle(tgtHandle);
      const snx = srcP === Position.Right ? 1 : -1;
      const tnx = tgtP === Position.Right ? 1 : tgtP === Position.Left ? -1 : 0;
      const sStubX = srcPt.x + snx * ROUTE_STUB;
      const tStubX = tgtPt.x + tnx * ROUTE_STUB;
      let midX = (sStubX + tStubX) / 2;
      if (snx > 0) midX = Math.max(midX, sStubX);
      else midX = Math.min(midX, sStubX);
      if (tnx > 0) midX = Math.max(midX, tStubX);
      else midX = Math.min(midX, tStubX);
      stubInfos.push({ edgeId: e.id, srcNodeId: e.sourceId, srcHandle, srcX: srcPt.x, srcY: srcPt.y, midX });
    }
    const reassigned = new Set<string>();
    for (let i = 0; i < stubInfos.length; i++) {
      for (let j = i + 1; j < stubInfos.length; j++) {
        const a = stubInfos[i]!, b = stubInfos[j]!;
        if (a.srcNodeId === b.srcNodeId) continue; // same node: splitHandleFor already handles this
        if (Math.abs(a.srcY - b.srcY) > 2) continue;
        const aLo = Math.min(a.srcX, a.midX), aHi = Math.max(a.srcX, a.midX);
        const bLo = Math.min(b.srcX, b.midX), bHi = Math.max(b.srcX, b.midX);
        if (Math.min(aHi, bHi) - Math.max(aLo, bLo) <= 0) continue;
        if (!reassigned.has(a.edgeId) && !reassigned.has(b.edgeId)) {
          autoHandles.set(`${a.edgeId}:source`, `${a.srcHandle}-top`);
          autoHandles.set(`${b.edgeId}:source`, `${b.srcHandle}-bottom`);
          reassigned.add(a.edgeId);
          reassigned.add(b.edgeId);
        } else if (!reassigned.has(b.edgeId)) {
          const aNew = autoHandles.get(`${a.edgeId}:source`)!;
          autoHandles.set(`${b.edgeId}:source`, `${b.srcHandle}-${aNew.endsWith('-top') ? 'bottom' : 'top'}`);
          reassigned.add(b.edgeId);
        } else if (!reassigned.has(a.edgeId)) {
          const bNew = autoHandles.get(`${b.edgeId}:source`)!;
          autoHandles.set(`${a.edgeId}:source`, `${a.srcHandle}-${bNew.endsWith('-top') ? 'bottom' : 'top'}`);
          reassigned.add(a.edgeId);
        }
      }
    }
  }

  // ── Obstacle-clearing handle adjustment ─────────────────────────────────
  // When a Left/Right-exit edge's horizontal stub passes through a non-endpoint
  // node, try the -top and -bottom sub-handles and pick the first that clears
  // the obstacle — no kink needed, the exit Y simply shifts up or down.
  {
    for (const e of transitions) {
      if (e.isSelf) continue;
      const srcPos = displayPositions.get(e.sourceId);
      const tgtPos = displayPositions.get(e.targetId);
      if (!srcPos || !tgtPos) continue;
      const currentHandle = autoHandles.get(`${e.id}:source`);
      if (!currentHandle) continue;
      const baseSide = currentHandle.startsWith("right") ? "right"
                     : currentHandle.startsWith("left")  ? "left"
                     : null;
      if (!baseSide) continue;

      const edgeObstacles = allObstacles.filter(
        (o) => o.id !== e.sourceId && o.id !== e.targetId,
      );
      if (edgeObstacles.length === 0) continue;

      const tgtHandle = autoHandles.get(`${e.id}:target`);
      const srcPt = pointForHandle(srcPos, currentHandle);
      const tgtPt = pointForHandle(tgtPos, tgtHandle);
      if (!srcPt || !tgtPt) continue;

      const srcP = positionForHandle(currentHandle);
      const tgtP = positionForHandle(tgtHandle);
      const snx = srcP === Position.Right ? 1 : -1;
      const tnx = tgtP === Position.Right ? 1 : tgtP === Position.Left ? -1 : 0;
      const sStubX = srcPt.x + snx * ROUTE_STUB;
      const tStubX = tgtPt.x + tnx * ROUTE_STUB;
      let midX = (sStubX + tStubX) / 2;
      if (snx > 0) midX = Math.max(midX, sStubX);
      else midX = Math.min(midX, sStubX);
      if (tnx > 0) midX = Math.max(midX, tStubX);
      else midX = Math.min(midX, tStubX);

      if (!stubHitsObstacle(srcPt.x, midX, srcPt.y, edgeObstacles)) continue;

      // Current stub is blocked — try same-side sub-handles first, then
      // bottom/top as fallback (their vertical stubs naturally avoid horizontal obstacles).
      const candidates = [
        `${baseSide}-top`, `${baseSide}-bottom`, baseSide,
        "bottom", "top",
      ] as const;
      for (const h of candidates) {
        if (h === currentHandle) continue;
        const pt = pointForHandle(srcPos, h);
        if (!pt) continue;
        // bottom/top exits have vertical stubs — skip the horizontal obstacle check.
        const isVerticalExit = h === "bottom" || h === "top";
        if (!isVerticalExit && stubHitsObstacle(pt.x, midX, pt.y, edgeObstacles)) continue;
        autoHandles.set(`${e.id}:source`, h);
        break;
      }
    }
  }

  // ── Corridor spread ──────────────────────────────────────────────────────
  // Detect edges from different source/target pairs that happen to route
  // through the same segment corridor, then spread them apart by adding a
  // per-edge delta to parallelOffset so the router pushes their mid-segments
  // to distinct lanes before the final path is computed.
  const CORRIDOR_GAP = 20;  // minimum px between mid-segment centre-lines
  const CROSS_TOLERANCE = 24; // treat segments within 24px as touching (catches adjacent, non-overlapping ranges)
  {
    type CS = { edgeId: string; main: number; mainSize: number; cross: number; crossSize: number };
    const horizCS: CS[] = [];
    const vertCS: CS[] = [];

    for (const e of transitions) {
      if (e.isSelf) continue;
      const srcNodePos = displayPositions.get(e.sourceId);
      const tgtNodePos = displayPositions.get(e.targetId);
      if (!srcNodePos || !tgtNodePos) continue;
      const srcHandle = autoHandles.get(`${e.id}:source`);
      const tgtHandle = autoHandles.get(`${e.id}:target`);
      const srcPt = pointForHandle(srcNodePos, srcHandle);
      const tgtPt = pointForHandle(tgtNodePos, tgtHandle);
      if (!srcPt || !tgtPt) continue;

      const srcP = positionForHandle(srcHandle);
      const tgtP = positionForHandle(tgtHandle);
      const snx = srcP === Position.Right ? 1 : srcP === Position.Left ? -1 : 0;
      const sny = srcP === Position.Bottom ? 1 : srcP === Position.Top ? -1 : 0;
      const tnx = tgtP === Position.Right ? 1 : tgtP === Position.Left ? -1 : 0;
      const tny = tgtP === Position.Bottom ? 1 : tgtP === Position.Top ? -1 : 0;

      const sStubX = srcPt.x + snx * ROUTE_STUB;
      const sStubY = srcPt.y + sny * ROUTE_STUB;
      const tStubX = tgtPt.x + tnx * ROUTE_STUB;
      const tStubY = tgtPt.y + tny * ROUTE_STUB;
      const existing = parallelOffsets.get(e.id) ?? 0;

      if (snx === 0) {
        // Top/Bottom handle → horizontal mid-segment; parallelOffset shifts it in Y
        let midY = (sStubY + tStubY) / 2 + existing;
        if (sny > 0) midY = Math.max(midY, sStubY);
        else if (sny < 0) midY = Math.min(midY, sStubY);
        if (tny > 0) midY = Math.max(midY, tStubY);
        else if (tny < 0) midY = Math.min(midY, tStubY);
        if ((sny > 0 && midY < sStubY) || (sny < 0 && midY > sStubY)) continue;
        const loX = Math.min(sStubX, tStubX);
        const hiX = Math.max(sStubX, tStubX);
        if (hiX - loX < 1) continue;
        horizCS.push({ edgeId: e.id, main: midY, mainSize: 0, cross: (loX + hiX) / 2, crossSize: hiX - loX + 2 * CROSS_TOLERANCE });
      } else {
        // Left/Right handle → vertical mid-segment; parallelOffset shifts it in X
        let midX = (sStubX + tStubX) / 2 + existing;
        if (snx > 0) midX = Math.max(midX, sStubX);
        else if (snx < 0) midX = Math.min(midX, sStubX);
        if (tnx > 0) midX = Math.max(midX, tStubX);
        else if (tnx < 0) midX = Math.min(midX, tStubX);
        if ((snx > 0 && midX < sStubX) || (snx < 0 && midX > sStubX)) continue;
        const loY = Math.min(sStubY, tStubY);
        const hiY = Math.max(sStubY, tStubY);
        if (hiY - loY < 1) continue; // zero-height (same-row) → skip
        vertCS.push({ edgeId: e.id, main: midX, mainSize: 0, cross: (loY + hiY) / 2, crossSize: hiY - loY + 2 * CROSS_TOLERANCE });
      }
    }

    for (const [id, delta] of distributeLabels(horizCS, CORRIDOR_GAP)) {
      parallelOffsets.set(id, (parallelOffsets.get(id) ?? 0) + delta);
    }
    for (const [id, delta] of distributeLabels(vertCS, CORRIDOR_GAP)) {
      parallelOffsets.set(id, (parallelOffsets.get(id) ?? 0) + delta);
    }
  }

  // ── Label overlap detection ──────────────────────────────────────────────
  // Pre-compute each edge's label position and size, then separate overlapping
  // labels by sliding them along the segment they sit on:
  //   • horizontal mid-segment (Bottom/Top handles) → offset in X
  //   • vertical mid-segment   (Left/Right handles)  → offset in Y
  const LABEL_H_BASE = 22;  // 9px font + 2×3px padding + 2×1px border
  const LABEL_H_BADGE = 18; // extra for one badge row (badge + gap)
  const LABEL_GAP = 4;      // minimum gap between bounding boxes
  const LABEL_PX = 6;       // geometry.labelPill.paddingX

  type LabelSlot = {
    edgeId: string; cx: number; cy: number; w: number; h: number; isHoriz: boolean;
  };
  const labelSlots: LabelSlot[] = [];

  for (const e of transitions) {
    if (e.isSelf) continue;
    const srcPos = displayPositions.get(e.sourceId);
    const tgtPos = displayPositions.get(e.targetId);
    if (!srcPos || !tgtPos) continue;
    const srcHandle = autoHandles.get(`${e.id}:source`);
    const tgtHandle = autoHandles.get(`${e.id}:target`);
    const srcPt = pointForHandle(srcPos, srcHandle);
    const tgtPt = pointForHandle(tgtPos, tgtHandle);
    if (!srcPt || !tgtPt) continue;
    const srcPosition = positionForHandle(srcHandle);
    const { labelX, labelY } = orthogonalEdgePath({
      sourceX: srcPt.x,
      sourceY: srcPt.y,
      targetX: tgtPt.x,
      targetY: tgtPt.y,
      sourcePosition: srcPosition,
      targetPosition: positionForHandle(tgtHandle),
      sourceRect: srcPos,
      targetRect: tgtPos,
      parallelOffset: parallelOffsets.get(e.id),
    });
    const textW = measureLabelText(e.summary.display);
    const badges = badgesFor(e.summary, { manual: e.manual, disabled: e.disabled });
    const labelH = LABEL_H_BASE + (badges.length > 0 ? LABEL_H_BADGE : 0);
    // Bottom/Top exit → horizontal mid-segment → slide label left/right.
    const isHoriz = srcPosition === Position.Bottom || srcPosition === Position.Top;
    labelSlots.push({
      edgeId: e.id,
      cx: labelX,
      cy: labelY,
      w: textW + 2 * LABEL_PX + 2,
      h: labelH,
      isHoriz,
    });
  }

  // Horizontal-segment labels: cluster by same Y-band, distribute in X.
  const labelXOffsets = distributeLabels(
    labelSlots
      .filter((s) => s.isHoriz)
      .map((s) => ({ edgeId: s.edgeId, main: s.cx, mainSize: s.w, cross: s.cy, crossSize: s.h })),
    LABEL_GAP,
  );
  // Vertical-segment labels: cluster by same X-band, distribute in Y.
  const labelYOffsets = distributeLabels(
    labelSlots
      .filter((s) => !s.isHoriz)
      .map((s) => ({ edgeId: s.edgeId, main: s.cy, mainSize: s.h, cross: s.cx, crossSize: s.w })),
    LABEL_GAP,
  );

  // ── Cross-axis label collision ───────────────────────────────────────────
  // The two passes above only handle same-axis pairs. Here we shift
  // horizontal labels in X to clear any overlapping vertical label column.
  // Up to 3 passes to handle cascading effects.
  {
    const horizList = labelSlots.filter((s) => s.isHoriz);
    const vertList  = labelSlots.filter((s) => !s.isHoriz);
    for (let pass = 0; pass < 3; pass++) {
      let anyChanged = false;
      for (const h of horizList) {
        let hx = h.cx + (labelXOffsets.get(h.edgeId) ?? 0);
        const hyLo = h.cy - h.h / 2;
        const hyHi = h.cy + h.h / 2;
        for (const v of vertList) {
          const vy = v.cy + (labelYOffsets.get(v.edgeId) ?? 0);
          if (hyHi <= vy - v.h / 2 || hyLo >= vy + v.h / 2) continue; // no Y overlap
          const vxLo = v.cx - v.w / 2;
          const vxHi = v.cx + v.w / 2;
          if (hx + h.w / 2 <= vxLo || hx - h.w / 2 >= vxHi) continue; // no X overlap
          // Conflict — push h past v's X column.
          hx = hx < v.cx
            ? vxLo - h.w / 2 - LABEL_GAP
            : vxHi + h.w / 2 + LABEL_GAP;
          anyChanged = true;
        }
        labelXOffsets.set(h.edgeId, hx - h.cx);
      }
      if (!anyChanged) break;
    }
  }

  return transitions.map((e) => {
      const target = stateById.get(e.targetId);
      const targetIsTerminal =
        target?.role === "terminal" || target?.role === "initial-terminal";
      const selected =
        selection?.kind === "transition" && selection.transitionUuid === e.id;
      const obstacles = allObstacles.filter(
        (o) => o.id !== e.sourceId && o.id !== e.targetId,
      );

      const sourceHandle = autoHandles.get(`${e.id}:source`);
      const targetHandle = autoHandles.get(`${e.id}:target`);
      const sourcePosition = positionForHandle(sourceHandle);
      const targetPosition = positionForHandle(targetHandle);

      return {
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        sourceHandle,
        targetHandle,
        type: "transition",
        data: {
          edge: e,
          targetIsTerminal: !!targetIsTerminal,
          obstacles,
          liveSource: pointForHandle(displayPositions.get(e.sourceId), sourceHandle),
          liveTarget: pointForHandle(displayPositions.get(e.targetId), targetHandle),
          liveSourcePosition: sourcePosition,
          liveTargetPosition: targetPosition,
          liveSourceRect: displayPositions.get(e.sourceId),
          liveTargetRect: displayPositions.get(e.targetId),
          parallelOffset: parallelOffsets.get(e.id),
          labelXOffset: labelXOffsets.get(e.id),
          labelYOffset: labelYOffsets.get(e.id),
          transitionPosition: transitionPositions?.[e.id],
          onLabelDragEnd: onTransitionLabelDragEnd,
        },
        reconnectable: true,
        interactionWidth: selected ? 28 : 18,
        selected,
      };
    });
}

function stubHitsObstacle(
  x1: number,
  x2: number,
  y: number,
  obstacles: { x: number; y: number; width: number; height: number }[],
  pad = 8,
): boolean {
  const loX = Math.min(x1, x2);
  const hiX = Math.max(x1, x2);
  for (const o of obstacles) {
    if (hiX <= o.x - pad || loX >= o.x + o.width + pad) continue;
    if (y <= o.y - pad || y >= o.y + o.height + pad) continue;
    return true;
  }
  return false;
}

function samePosition(
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
): boolean {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

function positionForHandle(handle: string | undefined): Position {
  if (handle?.startsWith("top")) return Position.Top;
  if (handle?.startsWith("right")) return Position.Right;
  if (handle?.startsWith("left")) return Position.Left;
  return Position.Bottom;
}

function pointForHandle(
  node: NodePosition | undefined,
  handle: string | undefined,
): { x: number; y: number } | undefined {
  if (!node) return undefined;
  const position = positionForHandle(handle);
  const handleInset = insetForHandle(handle);
  if (position === Position.Top) {
    return { x: node.x + node.width * handleInset, y: node.y };
  }
  if (position === Position.Right) {
    return { x: node.x + node.width, y: node.y + node.height * handleInset };
  }
  if (position === Position.Left) {
    return { x: node.x, y: node.y + node.height * handleInset };
  }
  return { x: node.x + node.width * handleInset, y: node.y + node.height };
}

function positionsFromNodes(
  nodes: Node<RfStateNodeData>[],
): Map<string, { x: number; y: number }> {
  return new Map(nodes.map((node) => [node.id, node.position]));
}

function reconcileNodes(
  previousNodes: Node<RfStateNodeData>[],
  nextBaseNodes: Node<RfStateNodeData>[],
  previousBasePositions: Map<string, { x: number; y: number }> | null,
  draggingIds: ReadonlySet<string>,
): Node<RfStateNodeData>[] {
  if (previousNodes.length === 0) return nextBaseNodes;

  const previousById = new Map(previousNodes.map((node) => [node.id, node]));
  return nextBaseNodes.map((baseNode) => {
    const previous = previousById.get(baseNode.id);
    if (!previous) return baseNode;

    const previousBase = previousBasePositions?.get(baseNode.id);
    const basePositionChanged = !samePosition(previousBase, baseNode.position);
    const position =
      draggingIds.has(baseNode.id) || !basePositionChanged
        ? previous.position
        : baseNode.position;

    return { ...baseNode, position };
  });
}

/**
 * Resolve the React Flow handle ID for an edge endpoint.
 *
 * Explicit per-edge anchor overrides always win. When no override is stored,
 * defaults depend on orientation and whether the edge is a back-edge:
 *
 * | orientation | edge type | source  | target |
 * |-------------|-----------|---------|--------|
 * | vertical    | any       | bottom  | top    |
 * | horizontal  | forward   | right   | left   |
 * | horizontal  | back      | bottom  | bottom |
 *
 * Back-edges in horizontal mode use bottom/bottom because the layout engine
 * synthesises their routes as U-arcs that exit and enter from the node bottom.
 */
function anchorHandleId(
  anchor: TransitionEdge["sourceAnchor"],
  role: "source" | "target",
  orientation: "vertical" | "horizontal",
  isBackEdge = false,
  toTerminalSide?: "left" | "right",
  backEdgeSide?: "left" | "right",
): string | undefined {
  if (anchor) return anchor;
  if (orientation === "horizontal") {
    if (isBackEdge) return "bottom";
    return role === "source" ? "right" : "left";
  }
  // Vertical: edges to terminal exit/enter from the sides.
  if (toTerminalSide) {
    return role === "source" ? toTerminalSide : (toTerminalSide === "left" ? "right" : "left");
  }
  // Vertical back-edges: caller pre-computes the correct side for each role
  // (source and target may differ), so just return it directly.
  if (isBackEdge) {
    return backEdgeSide ?? "right";
  }
  return role === "source" ? "bottom" : "top";
}


type BaseHandle = "top" | "right" | "bottom" | "left";

type EndpointAssignment = {
  edgeId: string;
  parallelIndex: number;
  role: "source" | "target";
  nodeId: string;
  oppositeId: string;
  baseSide: BaseHandle;
};

function computeAutoHandles(
  edges: TransitionEdge[],
  displayPositions: Map<string, NodePosition>,
  orientation: "vertical" | "horizontal",
  terminalIds: Set<string> = new Set(),
): Map<string, string> {
  const assignments = new Map<string, string>();
  const grouped = new Map<string, EndpointAssignment[]>();

  // Pre-group self-loops by node so each gets a distinct corner.
  const selfLoopsByNode = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.isSelf) {
      const list = selfLoopsByNode.get(edge.sourceId) ?? [];
      list.push(edge.id);
      selfLoopsByNode.set(edge.sourceId, list);
    }
  }

  for (const edge of edges) {
    if (edge.isSelf) {
      const idx = (selfLoopsByNode.get(edge.sourceId) ?? []).indexOf(edge.id);
      const corner = SELF_LOOP_CORNERS[idx % SELF_LOOP_CORNERS.length]!;
      assignments.set(`${edge.id}:source`, edge.sourceAnchor ?? corner.source);
      assignments.set(`${edge.id}:target`, edge.targetAnchor ?? corner.target);
      continue;
    }

    // In vertical mode, edges targeting a terminal on the same row exit/enter
    // from the sides. When the terminal sits in a row below its source, the
    // normal bottom→top entry is preferred instead.
    let toTerminalSide: "left" | "right" | undefined;
    if (orientation === "vertical" && terminalIds.has(edge.targetId)) {
      const srcPos = displayPositions.get(edge.sourceId);
      const tgtPos = displayPositions.get(edge.targetId);
      if (srcPos && tgtPos) {
        const sameRow = Math.abs(srcPos.y - tgtPos.y) < srcPos.height * 0.75;
        if (sameRow) {
          const srcCX = srcPos.x + srcPos.width / 2;
          const tgtCX = tgtPos.x + tgtPos.width / 2;
          toTerminalSide = tgtCX <= srcCX ? "left" : "right";
        }
      }
    }

    // In vertical mode, back-edge side assignment depends on relative X:
    //   • horizontally offset  → opposite near sides (source toward target, target toward source)
    //   • vertically aligned (≈same X) → same side (default right) for a clean U-arc
    let backEdgeSrcSide: "left" | "right" | undefined;
    let backEdgeTgtSide: "left" | "right" | undefined;
    const back = isBackEdge(edge, displayPositions, orientation);
    if (back && orientation === "vertical") {
      const srcPos = displayPositions.get(edge.sourceId);
      const tgtPos = displayPositions.get(edge.targetId);
      if (srcPos && tgtPos) {
        const srcCX = srcPos.x + srcPos.width / 2;
        const tgtCX = tgtPos.x + tgtPos.width / 2;
        const xDiff = srcCX - tgtCX;
        if (Math.abs(xDiff) < 10) {
          // Nodes are vertically aligned — U-arc on the right side.
          backEdgeSrcSide = "right";
          backEdgeTgtSide = "right";
        } else {
          // Source exits from the near side (toward target);
          // target enters from its own near side (toward source).
          backEdgeSrcSide = xDiff > 0 ? "left" : "right";
          backEdgeTgtSide = xDiff > 0 ? "right" : "left";
        }
      }
    }

    // Same-level forward edges: arc below (right-going) or above (left-going)
    // so the label is placed outside the node bodies rather than through them.
    let sameLevelSide: BaseHandle | undefined;
    if (orientation === "vertical" && !back && !toTerminalSide) {
      const sp = displayPositions.get(edge.sourceId);
      const tp = displayPositions.get(edge.targetId);
      if (sp && tp && Math.abs(sp.y - tp.y) < sp.height * 0.75) {
        const sCX = sp.x + sp.width / 2, tCX = tp.x + tp.width / 2;
        if (Math.abs(sCX - tCX) > 10) sameLevelSide = sCX < tCX ? "bottom" : "top";
      }
    }

    const sourceSide = (sameLevelSide && !edge.sourceAnchor)
      ? sameLevelSide
      : anchorHandleId(edge.sourceAnchor, "source", orientation, back, toTerminalSide, backEdgeSrcSide) as BaseHandle;
    const targetSide = (sameLevelSide && !edge.targetAnchor)
      ? sameLevelSide
      : anchorHandleId(edge.targetAnchor, "target", orientation, back, toTerminalSide, backEdgeTgtSide) as BaseHandle;

    if (edge.sourceAnchor) {
      assignments.set(`${edge.id}:source`, edge.sourceAnchor);
    } else {
      pushAssignment(grouped, {
        edgeId: edge.id,
        parallelIndex: edge.parallelIndex,
        role: "source",
        nodeId: edge.sourceId,
        oppositeId: edge.targetId,
        baseSide: sourceSide,
      });
    }
    if (edge.targetAnchor) {
      assignments.set(`${edge.id}:target`, edge.targetAnchor);
    } else {
      pushAssignment(grouped, {
        edgeId: edge.id,
        parallelIndex: edge.parallelIndex,
        role: "target",
        nodeId: edge.targetId,
        oppositeId: edge.sourceId,
        baseSide: targetSide,
      });
    }
  }

  // Build a map of handles claimed on each node that auto-assignment must avoid:
  // - explicit anchors stored on regular edges (sourceAnchor / targetAnchor)
  // - both endpoints of every self-loop (their corner handles are reserved)
  const explicitByNode = new Map<string, Set<string>>();
  function markOccupied(nodeId: string, handle: string) {
    const s = explicitByNode.get(nodeId) ?? new Set<string>();
    s.add(handle);
    explicitByNode.set(nodeId, s);
  }
  for (const edge of edges) {
    if (edge.sourceAnchor) markOccupied(edge.sourceId, edge.sourceAnchor);
    if (edge.targetAnchor) markOccupied(edge.targetId, edge.targetAnchor);
    if (edge.isSelf) {
      // Self-loop handles were already assigned above — reserve both corners
      // so regular edges can't land on them.
      const src = assignments.get(`${edge.id}:source`);
      const tgt = assignments.get(`${edge.id}:target`);
      if (src) markOccupied(edge.sourceId, src);
      if (tgt) markOccupied(edge.sourceId, tgt); // same node for self-loop
    }
  }

  for (const [groupKey, endpoints] of grouped) {
    const [nodeId, baseSide] = groupKey.split("|") as [string, BaseHandle];
    const occupied = explicitByNode.get(nodeId) ?? new Set<string>();
    const sorted = [...endpoints].sort((a, b) =>
      sortEndpointAssignments(a, b, baseSide, displayPositions),
    );
    // Always use split handles — every node has 12 anchor points (3 per side).
    sorted.forEach((endpoint, index) => {
      const handleId = splitHandleFor(baseSide, index, sorted.length, occupied);
      // Mark as occupied so subsequent groups on the same node don't reuse it.
      occupied.add(handleId);
      explicitByNode.set(nodeId, occupied);
      assignments.set(`${endpoint.edgeId}:${endpoint.role}`, handleId);
    });
  }

  // ── Bidirectional same-level pairs ──────────────────────────────────────
  // Two edges between the same node pair at the same y-level both get
  // bottom→top routing with identical midY, drawing an X. Fix: route the
  // going-right edge via bottom→bottom (arc below) and the going-left edge
  // via top→top (arc above). orthogonalEdgePath already handles these
  // correctly without any additional changes.
  const edgeByPair = new Map<string, TransitionEdge>();
  for (const edge of edges) {
    if (!edge.isSelf) edgeByPair.set(`${edge.sourceId}->${edge.targetId}`, edge);
  }
  for (const edge of edges) {
    if (edge.isSelf) continue;
    const reverse = edgeByPair.get(`${edge.targetId}->${edge.sourceId}`);
    if (!reverse || edge.id >= reverse.id) continue; // process each pair once
    const srcPos = displayPositions.get(edge.sourceId);
    const tgtPos = displayPositions.get(edge.targetId);
    if (!srcPos || !tgtPos) continue;
    // Helper: pick a free sub-handle on a top/bottom side, preferring the one
    // closest to the opposite node in X. Releases the current group-phase
    // assignment so the pair can "swap" sides cleanly.
    const assignBiDir = (
      edgeId: string,
      role: "source" | "target",
      nodeId: string,
      side: "top" | "bottom",
      oppositeNodeId: string,
    ) => {
      const occ = explicitByNode.get(nodeId) ?? new Set<string>();
      const currentHandle = assignments.get(`${edgeId}:${role}`);
      if (currentHandle) occ.delete(currentHandle);
      const nodePos = displayPositions.get(nodeId);
      const oppPos = displayPositions.get(oppositeNodeId);
      const nodeCX = nodePos ? nodePos.x + nodePos.width / 2 : 0;
      const oppCX  = oppPos  ? oppPos.x  + oppPos.width  / 2 : nodeCX;
      const closer  = oppCX < nodeCX ? `${side}-left`  : `${side}-right`;
      const farther = oppCX < nodeCX ? `${side}-right` : `${side}-left`;
      const candidates = [closer, farther, side] as const;
      const h = candidates.find((c) => !occ.has(c));
      if (!h) { if (currentHandle) occ.add(currentHandle); return; }
      occ.add(h);
      explicitByNode.set(nodeId, occ);
      assignments.set(`${edgeId}:${role}`, h);
    };

    if (Math.abs(srcPos.y - tgtPos.y) < srcPos.height * 0.75) {
      // Same-level bidirectional pair: route via top/bottom arcs to avoid an X.
      const srcCX = srcPos.x + srcPos.width / 2;
      const tgtCX = tgtPos.x + tgtPos.width / 2;
      // edge goes right → bottom arc; reverse goes left → top arc
      const [rightEdge, leftEdge] = srcCX <= tgtCX ? [edge, reverse] : [reverse, edge];
      if (!rightEdge.sourceAnchor) assignBiDir(rightEdge.id, "source", rightEdge.sourceId, "bottom", rightEdge.targetId);
      if (!rightEdge.targetAnchor) assignBiDir(rightEdge.id, "target", rightEdge.targetId, "bottom", rightEdge.sourceId);
      if (!leftEdge.sourceAnchor)  assignBiDir(leftEdge.id,  "source", leftEdge.sourceId,  "top",    leftEdge.targetId);
      if (!leftEdge.targetAnchor)  assignBiDir(leftEdge.id,  "target", leftEdge.targetId,  "top",    leftEdge.sourceId);
    } else {
      // Different-Y bidirectional pair: route the back-edge outward so it
      // arcs around the outside of the diagram rather than crossing the
      // forward edge's path through the centre (the ∞ / figure-eight shape).
      // The forward edge keeps its normal bottom→top routing; the back-edge
      // exits and enters from the same outward side of both nodes.
      //
      // Critically: source and target receive the SAME sub-handle so that
      // multiple parallel back-edges fan out in parallel rather than crossing.
      const backEdge = srcPos.y > tgtPos.y ? edge : reverse;
      const backSrcPos = displayPositions.get(backEdge.sourceId);
      const backTgtPos = displayPositions.get(backEdge.targetId);
      if (!backSrcPos || !backTgtPos) continue;
      const xDiff = (backSrcPos.x + backSrcPos.width / 2) - (backTgtPos.x + backTgtPos.width / 2);
      if (Math.abs(xDiff) < 10) continue; // vertically aligned — existing back-edge logic handles this
      const outwardSide: "left" | "right" = xDiff < 0 ? "left" : "right";

      // Release existing group-phase assignments on both nodes before picking.
      const srcOcc = explicitByNode.get(backEdge.sourceId) ?? new Set<string>();
      const tgtOcc = explicitByNode.get(backEdge.targetId) ?? new Set<string>();
      const curSrc = assignments.get(`${backEdge.id}:source`);
      const curTgt = assignments.get(`${backEdge.id}:target`);
      if (!backEdge.sourceAnchor && curSrc) srcOcc.delete(curSrc);
      if (!backEdge.targetAnchor && curTgt) tgtOcc.delete(curTgt);

      // Pick the first sub-handle free on BOTH endpoints — this keeps the
      // source and target on the same "slot" so paths are parallel, not X.
      const sharedCandidates = [`${outwardSide}-top`, `${outwardSide}-bottom`, outwardSide] as const;
      const shared = sharedCandidates.find(h => !srcOcc.has(h) && !tgtOcc.has(h));
      if (!shared) {
        // No shared slot available; restore and leave current assignment.
        if (!backEdge.sourceAnchor && curSrc) srcOcc.add(curSrc);
        if (!backEdge.targetAnchor && curTgt) tgtOcc.add(curTgt);
        continue;
      }
      if (!backEdge.sourceAnchor) {
        srcOcc.add(shared);
        explicitByNode.set(backEdge.sourceId, srcOcc);
        assignments.set(`${backEdge.id}:source`, shared);
      }
      if (!backEdge.targetAnchor) {
        tgtOcc.add(shared);
        explicitByNode.set(backEdge.targetId, tgtOcc);
        assignments.set(`${backEdge.id}:target`, shared);
      }
    }
  }

  // ── N≥3 parallel pair side routing ──────────────────────────────────────
  // When 3+ parallel edges go from the same source to the same target,
  // routing all of them via bottom→top produces overlapping Z-paths.
  // Route the inner edges (parallelIndex 1..N-2) via side handles (left or
  // right) to create a clear U-shaped arc that doesn't overlap the Z-paths.
  // Side choice: the side with fewer occupied handles on source + target
  // combined. For N=4 the two inner edges use opposite sides.

  // Build a complete occupancy map from all current assignments.
  const sideOcc = new Map<string, Set<string>>();
  const markSide = (nodeId: string, handle: string) => {
    const s = sideOcc.get(nodeId) ?? new Set<string>();
    s.add(handle);
    sideOcc.set(nodeId, s);
  };
  for (const edge of edges) {
    const srcH = assignments.get(`${edge.id}:source`);
    const tgtH = assignments.get(`${edge.id}:target`);
    if (srcH) markSide(edge.sourceId, srcH);
    if (tgtH) markSide(edge.isSelf ? edge.sourceId : edge.targetId, tgtH);
  }

  const countSide = (nodeId: string, side: "left" | "right"): number => {
    const occ = sideOcc.get(nodeId) ?? new Set<string>();
    let n = 0;
    for (const h of occ) if (h === side || h.startsWith(`${side}-`)) n++;
    return n;
  };

  const pickSideHandle = (nodeId: string, side: "left" | "right"): string => {
    const candidates = side === "left"
      ? (["left", "left-top", "left-bottom"] as const)
      : (["right", "right-top", "right-bottom"] as const);
    const occ = sideOcc.get(nodeId) ?? new Set<string>();
    return candidates.find((h) => !occ.has(h)) ?? candidates[0]!;
  };

  // Group non-self edges that belong to a parallel group of size ≥ 3.
  const trioPairs = new Map<string, TransitionEdge[]>();
  for (const edge of edges) {
    if (edge.isSelf || edge.parallelGroupSize < 3) continue;
    const key = `${edge.sourceId}->${edge.targetId}`;
    const list = trioPairs.get(key) ?? [];
    list.push(edge);
    trioPairs.set(key, list);
  }

  for (const [, group] of trioPairs) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.parallelIndex - b.parallelIndex);
    // Inner edges: all except the outermost (first and last by parallelIndex).
    const inner = sorted.slice(1, -1);

    let prevSide: "left" | "right" | null = null;

    for (let k = 0; k < inner.length; k++) {
      const edge = inner[k]!;
      if (edge.sourceAnchor || edge.targetAnchor) continue;

      let side: "left" | "right";
      if (prevSide === null) {
        // First inner edge: pick the less occupied side.
        const leftTotal  = countSide(edge.sourceId, "left")  + countSide(edge.targetId, "left");
        const rightTotal = countSide(edge.sourceId, "right") + countSide(edge.targetId, "right");
        side = leftTotal <= rightTotal ? "left" : "right";
      } else {
        // Subsequent inner edges alternate to the opposite side.
        side = prevSide === "left" ? "right" : "left";
      }
      prevSide = side;

      const srcHandle = pickSideHandle(edge.sourceId, side);
      const tgtHandle = pickSideHandle(edge.targetId, side);

      // Release the previous bottom/top handles from the occupancy map.
      const prevSrc = assignments.get(`${edge.id}:source`);
      const prevTgt = assignments.get(`${edge.id}:target`);
      if (prevSrc) sideOcc.get(edge.sourceId)?.delete(prevSrc);
      if (prevTgt) sideOcc.get(edge.targetId)?.delete(prevTgt);

      // Assign side handles and mark them occupied.
      assignments.set(`${edge.id}:source`, srcHandle);
      assignments.set(`${edge.id}:target`, tgtHandle);
      markSide(edge.sourceId, srcHandle);
      markSide(edge.targetId, tgtHandle);
    }
  }

  return assignments;
}

/** Corner handle pairs for self-loops, assigned round-robin when there are
 *  multiple loops on the same node and no explicit anchor is stored. */
const SELF_LOOP_CORNERS = [
  { source: "right-top",   target: "top-right"   },
  { source: "left-top",    target: "top-left"    },
  { source: "bottom-right", target: "right-bottom" },
  { source: "bottom-left",  target: "left-bottom"  },
] as const;

function pushAssignment(
  grouped: Map<string, EndpointAssignment[]>,
  assignment: EndpointAssignment,
) {
  const key = `${assignment.nodeId}|${assignment.baseSide}`;
  const list = grouped.get(key) ?? [];
  list.push(assignment);
  grouped.set(key, list);
}

function sortEndpointAssignments(
  a: EndpointAssignment,
  b: EndpointAssignment,
  baseSide: BaseHandle,
  displayPositions: Map<string, NodePosition>,
): number {
  const aPos = displayPositions.get(a.oppositeId);
  const bPos = displayPositions.get(b.oppositeId);
  const aAxis =
    baseSide === "top" || baseSide === "bottom"
      ? aPos?.x ?? 0
      : aPos?.y ?? 0;
  const bAxis =
    baseSide === "top" || baseSide === "bottom"
      ? bPos?.x ?? 0
      : bPos?.y ?? 0;
  if (aAxis !== bAxis) return aAxis - bAxis;
  return a.parallelIndex - b.parallelIndex;
}

/**
 * When more than 3 edges share the same base side on a node, overflow handles
 * fan out to adjacent sides so every edge gets a unique departure point.
 * No repeats for up to 12 edges per side.
 */
const HANDLE_OVERFLOW: Record<BaseHandle, readonly string[]> = {
  bottom: ["bottom-left", "bottom", "bottom-right", "left-bottom", "right-bottom", "left", "right", "left-top", "right-top", "top-left", "top", "top-right"],
  top:    ["top-left",    "top",    "top-right",    "right-top",   "left-top",    "right", "left", "right-bottom", "left-bottom", "bottom-left", "bottom", "bottom-right"],
  right:  ["right-top",   "right",  "right-bottom", "bottom-right","top-right",   "bottom","top",  "bottom-left",  "top-left",    "left-bottom", "left",   "left-top"],
  left:   ["left-top",    "left",   "left-bottom",  "top-left",    "bottom-left", "top",   "bottom","top-right",   "bottom-right","right-top",   "right",  "right-bottom"],
};

/**
 * For exactly 4 edges on one side, the two extreme slots (sorted by the
 * opposite node's coordinate) wrap onto the adjacent side near each corner,
 * so the edge heading furthest in either direction exits toward that side
 * instead of doubling back across the node.
 */
const HANDLE_FOUR: Record<BaseHandle, readonly string[]> = {
  top:    ["left-top",    "top-left",   "top-right",    "right-top"],
  right:  ["top-right",   "right-top",  "right-bottom", "bottom-right"],
  bottom: ["left-bottom", "bottom-left","bottom-right", "right-bottom"],
  left:   ["top-left",    "left-top",   "left-bottom",  "bottom-left"],
};

function splitHandleFor(
  side: BaseHandle,
  index: number,
  total: number,
  occupied: ReadonlySet<string> = new Set(),
): string {
  // Full ordered candidate list for this side — 12 unique handles, no repeats.
  const overflow = HANDLE_OVERFLOW[side];

  // Prefer the "natural" assignment first, then fall back to any free slot.
  function natural(): string {
    const variants =
      side === "top"
        ? ["top-left", "top", "top-right"]
        : side === "right"
          ? ["right-top", "right", "right-bottom"]
          : side === "bottom"
            ? ["bottom-left", "bottom", "bottom-right"]
            : ["left-top", "left", "left-bottom"];

    if (total <= 1) return variants[1]!;
    if (total === 2) return variants[index === 0 ? 0 : 2]!;
    if (total === 3) return variants[index]!;
    if (total === 4) return HANDLE_FOUR[side][index]!;
    return overflow[index % overflow.length]!;
  }

  const preferred = natural();
  if (!occupied.has(preferred)) return preferred;

  // Preferred slot is taken — find the next free handle in the fan order.
  for (const candidate of overflow) {
    if (!occupied.has(candidate)) return candidate;
  }
  return preferred; // all 12 taken (shouldn't happen in practice)
}

function insetForHandle(handle: string | undefined): number {
  switch (handle) {
    case "top-left":
    case "right-top":
    case "bottom-left":
    case "left-top":
      return 0.28;
    case "top-right":
    case "right-bottom":
    case "bottom-right":
    case "left-bottom":
      return 0.72;
    default:
      return 0.5;
  }
}

function isBackEdge(
  edge: TransitionEdge,
  displayPositions: Map<string, NodePosition>,
  orientation: "vertical" | "horizontal",
): boolean {
  if (edge.isSelf) return false;
  const source = displayPositions.get(edge.sourceId);
  const target = displayPositions.get(edge.targetId);
  if (!source || !target) return false;
  if (orientation === "horizontal") return source.x > target.x;
  if (source.y !== target.y) return source.y > target.y;
  // Same-row edges going leftward are treated as back-edges so they get
  // side handles (Left→Right) instead of Bottom→Top — which would produce
  // a staircase detour below both nodes.
  return source.x > target.x;
}

function groupIssuesByNode(
  graph: GraphDocument,
  issues: ValidationIssue[],
): Map<string, ValidationIssue[]> {
  const byNode = new Map<string, ValidationIssue[]>();
  for (const ann of graph.annotations) {
    const list = byNode.get(ann.targetId) ?? [];
    const issue = issues.find((i) => i.code === ann.code);
    if (issue) list.push(issue);
    byNode.set(ann.targetId, list);
  }
  return byNode;
}

function CanvasInner({
  graph,
  issues,
  activeWorkflow,
  selection,
  layoutOptions,
  savedViewport,
  onSelectionChange,
  onViewportChange,
  onConnect,
  onReconnect,
  onNodesDelete,
  onEdgesDelete,
  onNodeDragStop,
  onPaneDoubleClick,
  newStatePositionRef,
  layoutKey = 0,
  readOnly,
  showMinimap = true,
  showControls = true,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onAutoLayout,
  isFullscreen = false,
  onToggleFullscreen,
  resizeKey = 0,
  onHelp,
  helpLabel,
  transitionPositions,
  onTransitionLabelDragEnd,
}: CanvasProps) {
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [nodes, setNodes] = useState<Node<RfStateNodeData>[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const previousBasePositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  // When true, the next reconcileNodes pass will skip drag-position preservation
  // and apply ELK-computed positions directly. Set when a forced re-layout is
  // triggered (Auto-arrange / Reset positions) and cleared after reconcileNodes
  // consumes it.
  const forceBasePositionsRef = useRef(false);
  // Set of node IDs currently being dragged. Cleared to an empty set on drag
  // stop. Only changes at drag-start / drag-stop (not on every mousemove), so
  // the dependent `edges` useMemo recomputes at most twice per drag gesture.
  const [draggingIds, setDraggingIds] = useState<ReadonlySet<string>>(new Set<string>());
  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  // Wraps the React Flow pane; used to read the visible viewport's screen-space
  // centre when placing a toolbar/keyboard-added state.
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Extract primitive fields so the effect dep array is stable even when the
  // consumer passes a new object literal on every parent render.
  const preset = layoutOptions?.preset ?? "configuratorReadable";
  const orientation = layoutOptions?.orientation ?? "vertical";
  const nodeSize = layoutOptions?.nodeSize;
  const pinned = layoutOptions?.pinned;

  const effectiveOpts = useMemo<LayoutOptions>(
    () => ({ preset, orientation, nodeSize, pinned }),
    // nodeSize / pinned are objects; reference equality is fine
    // here — a new object passed by the consumer signals an intentional re-layout.
    [preset, orientation, nodeSize, pinned],
  );

  // Filter graph to the active workflow so ELK lays out only its nodes.
  // Without this, nodes from all workflows are laid out together, pushing
  // the new workflow's states to unexpected positions.
  const activeGraph = useMemo(() => {
    if (!activeWorkflow) return graph;
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => n.workflow === activeWorkflow),
      edges: graph.edges.filter((e) => e.workflow === activeWorkflow),
    };
  }, [graph, activeWorkflow]);

  // Track which orientation was in effect when each layout was triggered, so
  // that the fitView guard can tell whether layout changed due to an
  // orientation switch (which requires a refit) vs. a graph edit (no refit).
  const orientationAtLayoutRef = useRef(orientation);

  useEffect(() => {
    let cancelled = false;
    orientationAtLayoutRef.current = orientation;
    previousBasePositionsRef.current = null;
    layoutGraph(activeGraph, effectiveOpts).then((result) => {
      if (!cancelled) {
        // Always force the next reconcileNodes pass to apply ELK-computed
        // positions directly, discarding any drag offsets.  This is safe
        // because:
        //  • After a user drag, ELK re-runs with the pin and returns the
        //    same coordinates the user dragged to — no visual jump.
        //  • After undo/redo of a position change, ELK re-runs without the
        //    pin and returns the free-form position — node snaps back.
        //  • After Auto-arrange / Reset, same as undo — free positions.
        forceBasePositionsRef.current = true;
        setLayout(result);
      }
    });
    return () => {
      cancelled = true;
    };
    // layoutKey is an external force-re-run trigger; bumping it causes a re-layout
    // without changing any of the other dependencies.
  }, [activeGraph, effectiveOpts, orientation, layoutKey]);

  // ── Viewport fit ────────────────────────────────────────────────────────────
  //
  // Rules:
  //  1. Never fit while layout is still pending — nodes would be at (0,0).
  //  2. Fit once on the first completed layout (initial load / reload).
  //  3. Refit when the graph orientation changes (new layout = different bounds).
  //  4. Do NOT refit on subsequent graph edits — preserve the user's zoom/pan.
  //  5. Cap maxZoom at 1.2 so small graphs do not blow up absurdly.
  //
  // A requestAnimationFrame defers the call until React Flow has committed the
  // new node positions to the DOM, which is required for correct bounds.

  const lastHandledViewportKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!layout) return;
    const viewportKey = `${activeWorkflow ?? "__all__"}:${orientationAtLayoutRef.current}`;
    if (lastHandledViewportKeyRef.current === viewportKey) return;

    const stateCount = graph.nodes.filter(
      (node): node is GraphStateNode =>
        node.kind === "state" &&
        (!activeWorkflow || node.workflow === activeWorkflow),
    ).length;
    const fitOptions =
      stateCount <= 6
        ? { padding: 0.2, maxZoom: 1 }
        : { padding: 0.18 };

    let rafId: ReturnType<typeof requestAnimationFrame>;
    let attempts = 0;

    const tryApply = () => {
      if (savedViewport) {
        void rf.setViewport(savedViewport, { duration: 0 });
        lastHandledViewportKeyRef.current = viewportKey;
        return;
      }
      // fitView returns false when ReactFlow hasn't measured nodes yet.
      // Retry on successive frames until it succeeds (cap at 20 frames).
      const fitted = rf.fitView(fitOptions);
      if (fitted) {
        lastHandledViewportKeyRef.current = viewportKey;
      } else if (++attempts < 20) {
        rafId = requestAnimationFrame(tryApply);
      }
    };

    rafId = requestAnimationFrame(tryApply);
    return () => cancelAnimationFrame(rafId);
  }, [activeWorkflow, graph.nodes, layout, rf, savedViewport]);

  // ── Derived RF data ─────────────────────────────────────────────────────────
  //
  // Critically: nodes and edges are EMPTY until the layout result is available.
  //
  // Before layout resolves, every node position is (0,0). React Flow would
  // then compute edge handles at the origin, causing all edge-label overlays to
  // pile up in the top-left corner — and fitView would zoom into empty space.
  // Deferring until layout is ready avoids both problems with no user-visible
  // cost (ELK typically resolves in < 150 ms for typical workflow sizes).

  const issuesByNode = useMemo(() => groupIssuesByNode(graph, issues), [graph, issues]);

  const baseNodes = useMemo(
    () =>
      layout
        ? toRfNodes(graph, layout, activeWorkflow, issuesByNode, selection)
        : [],
    [graph, layout, activeWorkflow, issuesByNode, selection],
  );

  useEffect(() => {
    if (forceBasePositionsRef.current) {
      // Fresh ELK result: apply positions directly, preserving only active
      // drags (nodes the user is currently holding).
      forceBasePositionsRef.current = false;
      previousBasePositionsRef.current = positionsFromNodes(baseNodes);
      if (draggingIds.size > 0) {
        // Some nodes are mid-drag — keep their current screen position.
        setNodes((prev) => {
          const prevById = new Map(prev.map((n) => [n.id, n]));
          return baseNodes.map((bn) => {
            if (draggingIds.has(bn.id)) {
              const p = prevById.get(bn.id);
              return p ? { ...bn, position: p.position } : bn;
            }
            return bn;
          });
        });
      } else {
        setNodes(baseNodes);
      }
      return;
    }
    setNodes((previousNodes) =>
      reconcileNodes(
        previousNodes,
        baseNodes,
        previousBasePositionsRef.current,
        draggingIds,
      ),
    );
    previousBasePositionsRef.current = positionsFromNodes(baseNodes);
  }, [baseNodes, draggingIds]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const nonRemoveChanges = changes.filter((change) => change.type !== "remove");
    if (nonRemoveChanges.length === 0) return;
    setNodes((currentNodes) => applyNodeChanges(nonRemoveChanges, currentNodes));
  }, []);

  const displayPositions = useMemo(() => {
    const positions = new Map<string, NodePosition>(layout?.positions ?? []);
    for (const node of nodes) {
      const stateNodeData = node.data as RfStateNodeData;
      const layoutPosition = layout?.positions.get(node.id);
      const size = stateNodeData.size ?? {
        width: layoutPosition?.width ?? estimateNodeSize(stateNodeData.node.stateCode).width,
        height: layoutPosition?.height ?? estimateNodeSize(stateNodeData.node.stateCode).height,
      };
      positions.set(node.id, {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: size.width,
        height: size.height,
      });
    }
    return positions;
  }, [layout, nodes]);

  const edges = useMemo(
    () =>
      layout
        ? toRfEdges(
            graph,
            displayPositions,
            activeWorkflow,
            selection,
            orientation,
            transitionPositions,
            onTransitionLabelDragEnd,
          )
        : [],
    [graph, layout, displayPositions, activeWorkflow, selection, orientation, transitionPositions, onTransitionLabelDragEnd],
  );

  const highlightSet = useMemo(
    () => computeHighlightSet(hoveredId, graph.nodes, graph.edges),
    [hoveredId, graph.nodes, graph.edges],
  );

  useEffect(() => {
    if (!layout) return;
    const rafId = requestAnimationFrame(() => {
      for (const node of nodes) updateNodeInternals(node.id);
    });
    return () => cancelAnimationFrame(rafId);
  }, [layout, nodes, resizeKey, updateNodeInternals]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => setHoveredId(node.id), []);
  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => setHoveredId(null), []);
  const onEdgeMouseEnter: EdgeMouseHandler = useCallback((_, edge) => setHoveredId(edge.id), []);
  const onEdgeMouseLeave: EdgeMouseHandler = useCallback(() => setHoveredId(null), []);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const data = node.data as RfStateNodeData;
    onSelectionChange({
      kind: "state",
      workflow: data.node.workflow,
      stateCode: data.node.stateCode,
      nodeId: data.node.id,
    });
  };

  const onEdgeClick: EdgeMouseHandler = (_, edge) => {
    onSelectionChange({ kind: "transition", transitionUuid: edge.id });
  };

  const handleNodeDragStart: NodeDragHandler = (_, node) => {
    setDraggingIds(new Set([node.id]));
  };

  const handleNodeDrag: NodeDragHandler = (_, node) => {
    setNodes((currentNodes) =>
      currentNodes.map((currentNode) =>
        currentNode.id === node.id
          ? { ...currentNode, position: { ...node.position } }
          : currentNode,
      ),
    );
  };

  const handleNodeDragStop: NodeDragHandler = (_, node) => {
    // Snapshot all node positions before the state update — rf.getNodes() reflects
    // the pre-update positions for every node except the one being dragged.
    const allPositions = rf.getNodes().map((n) => ({
      id: n.id,
      x: n.id === node.id ? node.position.x : n.position.x,
      y: n.id === node.id ? node.position.y : n.position.y,
    }));
    setNodes((currentNodes) =>
      currentNodes.map((currentNode) =>
        currentNode.id === node.id
          ? { ...currentNode, position: { ...node.position } }
          : currentNode,
      ),
    );
    onNodeDragStop?.(node.id, node.position.x, node.position.y, allPositions);
    setDraggingIds(new Set<string>());
  };

  const handleCanvasDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onPaneDoubleClick) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap")) {
      return;
    }
    if (!target.closest(".react-flow__pane, .react-flow__background") && target !== event.currentTarget) return;
    const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    onPaneDoubleClick(position.x, position.y);
  }, [onPaneDoubleClick, rf]);

  // Computes a flow-coordinate centre for a new state at the middle of the
  // visible viewport, nudged off any existing node so it lands in view and
  // doesn't overlap. The new node's exact footprint depends on the name (not
  // known until the modal is confirmed), so an approximate size is used here;
  // confirmAddState re-centres using the real size.
  const computeNewStatePosition = useCallback((): { x: number; y: number } | null => {
    const el = wrapperRef.current;
    if (!el) return null;
    const bounds = el.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    const center = rf.screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
    const newSize = estimateNodeSize("");
    const obstacles: Rect[] = rf.getNodes().map((n) => {
      const stateCode = (n.data as RfStateNodeData | undefined)?.node?.stateCode ?? "";
      const fallback = estimateNodeSize(stateCode);
      return {
        x: n.position.x,
        y: n.position.y,
        width: n.width ?? fallback.width,
        height: n.height ?? fallback.height,
      };
    });
    return findNonOverlappingCenter(center, newSize, obstacles);
  }, [rf]);

  useEffect(() => {
    if (!newStatePositionRef) return;
    newStatePositionRef.current = computeNewStatePosition;
    return () => {
      newStatePositionRef.current = null;
    };
  }, [newStatePositionRef, computeNewStatePosition]);

  return (
    <HoverContext.Provider value={{ highlightSet }}>
      <div
        ref={wrapperRef}
        style={{ width: "100%", height: "100%", background: "white", position: "relative" }}
        data-testid="workflow-canvas"
        onDoubleClick={readOnly ? undefined : handleCanvasDoubleClick}
      >
        <ArrowMarkers />
        {showControls && (
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              bottom: 16,
              left: 16,
              zIndex: 5,
              display: "flex",
              flexDirection: "column",
              background: "white",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              boxShadow: "0 1px 4px rgba(15,23,42,0.10)",
              overflow: "hidden",
            }}
          >
            {!readOnly && onUndo && (
              <>
                <CtrlBtn onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" testId="canvas-undo">
                  <UndoIcon />
                </CtrlBtn>
                <CtrlBtn onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" testId="canvas-redo">
                  <RedoIcon />
                </CtrlBtn>
                <div style={{ height: 1, background: "#E2E8F0" }} />
              </>
            )}
            <CtrlBtn
              onClick={() => {
                rf.fitView({ padding: 0.18 });
                requestAnimationFrame(() => {
                  if (layout) onViewportChange?.(rf.getViewport());
                });
              }}
              title="Fit view"
            >
              <FitViewIcon />
            </CtrlBtn>
            <CtrlBtn onClick={onToggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
            </CtrlBtn>
            {!readOnly && onAutoLayout && (
              <>
                <div style={{ height: 1, background: "#E2E8F0" }} />
                <CtrlBtn onClick={onAutoLayout} title="Auto-arrange (L)" testId="canvas-auto-layout">
                  <AutoArrangeIcon />
                </CtrlBtn>
              </>
            )}
            {onHelp && (
              <>
                <div style={{ height: 1, background: "#E2E8F0" }} />
                <CtrlBtn onClick={onHelp} title={helpLabel ?? "Help"} testId="canvas-help">
                  <HelpIcon />
                </CtrlBtn>
              </>
            )}
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={readOnly ? undefined : handleNodesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={() => onSelectionChange(activeWorkflow ? { kind: "workflow", workflow: activeWorkflow } : null)}
          onConnect={readOnly ? undefined : onConnect}
          onReconnect={readOnly ? undefined : onReconnect}
          onNodesDelete={readOnly ? undefined : onNodesDelete}
          onEdgesDelete={readOnly ? undefined : onEdgesDelete}
          onNodeDragStart={readOnly ? undefined : handleNodeDragStart}
          onNodeDrag={readOnly ? undefined : handleNodeDrag}
          onNodeDragStop={readOnly ? undefined : handleNodeDragStop}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          edgesUpdatable={!readOnly}
          deleteKeyCode={null}
          elementsSelectable
          // fitView is intentionally absent — handled imperatively after layout.
          // See the fitView useEffect above for the reasoning.
          zoomOnDoubleClick={false}
          snapToGrid
          snapGrid={[16, 16]}
          minZoom={0.1}
          maxZoom={4}
          onMoveEnd={(_, viewport) => {
            if (layout) onViewportChange?.(viewport);
          }}
        >
          <Background />
          {showMinimap && <MiniMap zoomable pannable />}
        </ReactFlow>
      </div>
    </HoverContext.Provider>
  );
}

function CtrlBtn({
  onClick,
  disabled,
  title,
  testId,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      style={{
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#CBD5E1" : "#475569",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function FitViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 15l6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
    </svg>
  );
}

function EnterFullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function AutoArrangeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="0" width="10" height="5" rx="1.5" />
      <line x1="11" y1="5" x2="11" y2="9" />
      <line x1="4" y1="9" x2="18" y2="9" />
      <line x1="4" y1="9" x2="4" y2="12" />
      <line x1="18" y1="9" x2="18" y2="12" />
      <rect x="0" y="12" width="8" height="5" rx="1.5" />
      <rect x="14" y="12" width="8" height="5" rx="1.5" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
