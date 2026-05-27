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
  /** Called once per completed drag with the node UUID and its final position. */
  onNodeDragStop?: (nodeId: string, x: number, y: number) => void;
  /** Called when the user double-clicks an empty canvas pane location. */
  onPaneDoubleClick?: (x: number, y: number) => void;
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
}

function toRfNodes(
  graph: GraphDocument,
  layout: LayoutResult,
  activeWorkflow: string | null,
  issuesByNode: Map<string, ValidationIssue[]>,
  selection: Selection,
): Node<RfStateNodeData>[] {
  return graph.nodes
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
}

function toRfEdges(
  graph: GraphDocument,
  displayPositions: Map<string, NodePosition>,
  activeWorkflow: string | null,
  selection: Selection,
  orientation: "vertical" | "horizontal",
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
  for (const group of pairGroups.values()) {
    if (group.length <= 1) continue;
    const n = group.length;
    for (let i = 0; i < n; i++) {
      parallelOffsets.set(group[i]!, (i - (n - 1) / 2) * PARALLEL_STEP);
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
        },
        reconnectable: true,
        interactionWidth: selected ? 28 : 18,
        selected,
      };
    });
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
  if (isBackEdge) return "right";
  return role === "source" ? "bottom" : "top";
}


type BaseHandle = "top" | "right" | "bottom" | "left";

type EndpointAssignment = {
  edgeId: string;
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

    // In vertical mode, edges targeting a terminal exit/enter from the sides.
    let toTerminalSide: "left" | "right" | undefined;
    if (orientation === "vertical" && terminalIds.has(edge.targetId)) {
      const srcPos = displayPositions.get(edge.sourceId);
      const tgtPos = displayPositions.get(edge.targetId);
      if (srcPos && tgtPos) {
        const srcCX = srcPos.x + srcPos.width / 2;
        const tgtCX = tgtPos.x + tgtPos.width / 2;
        toTerminalSide = tgtCX <= srcCX ? "left" : "right";
      }
    }

    const sourceSide = anchorHandleId(
      edge.sourceAnchor,
      "source",
      orientation,
      isBackEdge(edge, displayPositions, orientation),
      toTerminalSide,
    ) as BaseHandle;
    const targetSide = anchorHandleId(
      edge.targetAnchor,
      "target",
      orientation,
      isBackEdge(edge, displayPositions, orientation),
      toTerminalSide,
    ) as BaseHandle;

    if (edge.sourceAnchor) {
      assignments.set(`${edge.id}:source`, edge.sourceAnchor);
    } else {
      pushAssignment(grouped, {
        edgeId: edge.id,
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
        role: "target",
        nodeId: edge.targetId,
        oppositeId: edge.sourceId,
        baseSide: targetSide,
      });
    }
  }

  for (const [groupKey, endpoints] of grouped) {
    const [, baseSide] = groupKey.split("|") as [string, BaseHandle];
    const sorted = [...endpoints].sort((a, b) =>
      sortEndpointAssignments(a, b, baseSide, displayPositions),
    );
    // Always use split handles — every node has 12 anchor points (3 per side).
    sorted.forEach((endpoint, index) => {
      const handleId = splitHandleFor(baseSide, index, sorted.length);
      assignments.set(`${endpoint.edgeId}:${endpoint.role}`, handleId);
    });
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
  return a.edgeId.localeCompare(b.edgeId);
}

function splitHandleFor(
  side: BaseHandle,
  index: number,
  total: number,
): string {
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
  return variants[index % variants.length]!;
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
  return orientation === "horizontal"
    ? source.x > target.x
    : source.y > target.y;
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

  // Track which orientation was in effect when each layout was triggered, so
  // that the fitView guard can tell whether layout changed due to an
  // orientation switch (which requires a refit) vs. a graph edit (no refit).
  const orientationAtLayoutRef = useRef(orientation);

  useEffect(() => {
    let cancelled = false;
    orientationAtLayoutRef.current = orientation;
    previousBasePositionsRef.current = null;
    layoutGraph(graph, effectiveOpts).then((result) => {
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
  }, [graph, effectiveOpts, orientation, layoutKey]);

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

    const rafId = requestAnimationFrame(() => {
      if (savedViewport) {
        void rf.setViewport(savedViewport, { duration: 0 });
        lastHandledViewportKeyRef.current = viewportKey;
      } else {
        const stateCount = graph.nodes.filter(
          (node): node is GraphStateNode =>
            node.kind === "state" &&
            (!activeWorkflow || node.workflow === activeWorkflow),
        ).length;
        const fitOptions =
          stateCount <= 6
            ? { padding: 0.2, maxZoom: 1 }
            : { padding: 0.18 };
        // fitView returns false if nodes are not yet initialized in the
        // ReactFlow store (nodesInitialized guard). Only mark the key as
        // handled when the fit actually ran, so a retry happens if needed.
        const fitted = rf.fitView(fitOptions);
        if (fitted) lastHandledViewportKeyRef.current = viewportKey;
      }
    });
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
      const layoutPosition = layout?.positions.get(node.id);
      const size = node.data.size ?? {
        width: layoutPosition?.width ?? estimateNodeSize(node.data.node.stateCode).width,
        height: layoutPosition?.height ?? estimateNodeSize(node.data.node.stateCode).height,
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
          )
        : [],
    [graph, layout, displayPositions, activeWorkflow, selection, orientation],
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
    setNodes((currentNodes) =>
      currentNodes.map((currentNode) =>
        currentNode.id === node.id
          ? { ...currentNode, position: { ...node.position } }
          : currentNode,
      ),
    );
    onNodeDragStop?.(node.id, node.position.x, node.position.y);
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

  return (
    <HoverContext.Provider value={{ highlightSet }}>
      <div
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
            <CtrlBtn onClick={() => rf.fitView({ padding: 0.18 })} title="Fit view">
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
          onPaneClick={() => onSelectionChange(null)}
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
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
