import { useEffect, useMemo, useRef, useState } from "react";
import type { Transition, WorkflowEditorDocument } from "@cyoda/workflow-core";
import type {
  GraphDocument,
  GraphNode,
  StateNode,
  TransitionEdge,
  WorkflowInspection,
} from "@cyoda/workflow-graph";
import { computeHighlightSet, inspectGraphFocus, projectToGraph } from "@cyoda/workflow-graph";
import { simpleLayout, type LayoutResult, type NodePosition } from "../layout.js";
import { usePanZoom } from "../hooks/usePanZoom.js";
import { Defs } from "./Defs.js";
import { StartMarker } from "./StartMarker.js";
import { StateNodeView } from "./StateNode.js";
import { EdgePath, computeEdgeGeometry } from "./EdgePath.js";
import { EdgeLabel } from "./EdgeLabel.js";
import { geometry, workflowPalette } from "../theme/tokens.js";
import { routeEdges, distributeLabels } from "@cyoda/workflow-layout";
import { badgesFor } from "../theme/badges.js";
import { TransitionTooltip } from "./TransitionTooltip.js";

// Mirrors Canvas.tsx measureLabelText — uses Canvas 2D for accurate uppercase width.
let _ctx: CanvasRenderingContext2D | null | undefined;
function measureLabelText(text: string): number {
  if (_ctx === undefined) {
    try {
      const cvs = document.createElement("canvas");
      _ctx = cvs.getContext("2d");
      if (_ctx) _ctx.font = '700 9px -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", system-ui, sans-serif';
    } catch { _ctx = null; }
  }
  if (!_ctx) return text.length * 6;
  return _ctx.measureText(text.toUpperCase()).width + text.length * 0.36;
}

export interface WorkflowViewerProps {
  graph?: GraphDocument;
  document?: WorkflowEditorDocument;
  /**
   * Product layout preset, or a pre-computed graph layout for existing
   * advanced callers. Passing a LayoutResult remains supported.
   */
  layout?: WorkflowViewerLayout | LayoutResult;
  width?: number | string;
  height?: number | string;
  selectedId?: string;
  onSelectionChange?: (id: string | null) => void;
  surface?: WorkflowViewerSurface;
  layoutMode?: WorkflowViewerLayout;
  /** Alias for hosts that need both a pre-computed `layout` and a product preset. */
  viewerLayout?: WorkflowViewerLayout;
  interaction?: WorkflowViewerInteraction;
  /**
   * Receives lightweight adjacent-state/transition inspection for hover-path.
   * TODO: add pathProvider support for explicit STP or representative paths.
   */
  onInspect?: (inspection: WorkflowInspection | null) => void;
  /** Render the synthetic start-marker badge produced by graph projection. */
  showStartMarker?: boolean;
  className?: string;
  /** Dialect version string to display (e.g. "v0.8"). Omit to hide the badge. */
  dialectVersion?: string;
}

export type WorkflowViewerSurface = "website" | "ops-console";
export type WorkflowViewerLayout = "embedded" | "fullWidth";
export type WorkflowViewerInteraction =
  | "none"
  | "select"
  | "hover-highlight"
  | "hover-path";

/**
 * Slim read-only SVG renderer. Renders workflow state nodes, transitions,
 * and edge-label chips using the theme tokens. No editing affordances.
 */
export function WorkflowViewer({
  graph: graphInput,
  document,
  layout,
  width = "100%",
  height = "100%",
  selectedId,
  onSelectionChange,
  surface = "website",
  layoutMode,
  viewerLayout,
  interaction = "hover-highlight",
  onInspect,
  showStartMarker = false,
  className,
  dialectVersion,
}: WorkflowViewerProps) {
  const graph = useMemo(() => {
    if (graphInput) return graphInput;
    if (document) return projectToGraph(document);
    throw new Error("WorkflowViewer requires either graph or document.");
  }, [graphInput, document]);
  const visibleGraph = useMemo<GraphDocument>(() => {
    if (showStartMarker) return graph;
    return {
      ...graph,
      nodes: graph.nodes.filter((node) => node.kind !== "startMarker"),
      edges: graph.edges.filter((edge) => edge.kind !== "startMarker"),
    };
  }, [graph, showStartMarker]);
  const graphLayout = typeof layout === "string" ? undefined : layout;
  const productLayout = viewerLayout ??
    layoutMode ??
    (typeof layout === "string" ? layout : undefined) ??
    "embedded";

  // When no pre-computed layout is supplied, run layoutGraph (same engine as
  // the editor) so the viewer always shows the same arrangement.
  // layoutGraph is loaded dynamically so the viewer can render immediately
  // with simpleLayout while the async result loads.
  const [computedLayout, setComputedLayout] = useState<LayoutResult | null>(
    graphLayout ? normalizeLayoutForVisibleGraph(graphLayout, visibleGraph) ?? null : null,
  );
  useEffect(() => {
    if (graphLayout) {
      setComputedLayout(normalizeLayoutForVisibleGraph(graphLayout, visibleGraph) ?? null);
      return;
    }
    let cancelled = false;
    import("@cyoda/workflow-layout").then(({ layoutGraph }) =>
      layoutGraph(visibleGraph, { preset: "configuratorReadable", orientation: "vertical" })
    ).then(
      (result) => {
        if (!cancelled) setComputedLayout(result as unknown as LayoutResult);
      },
    ).catch(() => {
      // layoutGraph unavailable — simpleLayout fallback stays in place
    });
    return () => { cancelled = true; };
  }, [graphLayout, visibleGraph]);

  const effectiveLayout = computedLayout ?? simpleLayout(visibleGraph);
  const pan = usePanZoom();
  const [internalSelection, setInternalSelection] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const selection = selectedId ?? internalSelection;

  // Tooltip state
  const [tooltipEdgeId, setTooltipEdgeId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build map from edge UUID → Transition for tooltip.
  // Use edge.sourceId → stateCode (via meta.ids.states) + edge.summary.full to find the transition.
  const transitionDataMap = useMemo(() => {
    if (!document) return new Map<string, Transition>();
    const stateCodeByUuid = new Map<string, string>();
    for (const [uuid, ptr] of Object.entries(document.meta.ids.states)) {
      stateCodeByUuid.set(uuid, ptr.state);
    }
    const map = new Map<string, Transition>();
    for (const edge of visibleGraph.edges) {
      if (edge.kind !== "transition") continue;
      const stateCode = stateCodeByUuid.get(edge.sourceId);
      if (!stateCode) continue;
      const wf = document.session.workflows.find(w => w.name === edge.workflow);
      if (!wf) continue;
      const state = wf.states[stateCode];
      if (!state) continue;
      const t = state.transitions.find(tr => tr.name === edge.summary.full);
      if (t) map.set(edge.id, t);
    }
    return map;
  }, [document, visibleGraph]);

  const stateNodes = useMemo(
    () => visibleGraph.nodes.filter((n): n is StateNode => n.kind === "state"),
    [visibleGraph.nodes],
  );
  const stateById = useMemo(() => {
    const m = new Map<string, StateNode>();
    for (const n of stateNodes) m.set(n.id, n);
    return m;
  }, [stateNodes]);

  const transitionEdges = useMemo(
    () => visibleGraph.edges.filter((e): e is TransitionEdge => e.kind === "transition"),
    [visibleGraph.edges],
  );

  // Terminal node IDs — needed by the shared router for terminal-side handles.
  const terminalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of visibleGraph.nodes) {
      if (n.kind === "state" && (n.role === "terminal" || n.role === "initial-terminal")) {
        ids.add(n.id);
      }
    }
    return ids;
  }, [visibleGraph.nodes]);

  // Compute edge paths using the same orthogonal router as the editor canvas.
  // Falls back to ELK pre-computed routes when available, otherwise runs the
  // shared router so edge paths are identical to the editor.
  const computedEdgePaths = useMemo(() => {
    if (effectiveLayout.edges && effectiveLayout.edges.size > 0) return null;
    return routeEdges(transitionEdges, effectiveLayout.positions, "vertical", terminalIds);
  }, [effectiveLayout, transitionEdges, terminalIds]);

  // Distribute labels using the same algorithm as the editor:
  // - horizontal-segment labels (bottom/top exit) → spread in X
  // - vertical-segment labels (left/right exit)   → spread in Y
  // - cross-axis pass clears remaining H vs V conflicts
  const distributedLabelPositions = useMemo(() => {
    const LABEL_PX = geometry.labelPill.paddingX;
    // Match Canvas.tsx exactly: 9px font + 2×3px padding + 2×1px border = 22; badge row = 18
    const LABEL_H_BASE = 22;
    const BADGE_ROW = 18;
    const LABEL_GAP = 4;

    type Slot = { edgeId: string; cx: number; cy: number; w: number; h: number; isHoriz: boolean };
    const slots: Slot[] = [];

    for (const edge of transitionEdges) {
      if (edge.isSelf) continue;
      const routerPath = computedEdgePaths?.get(edge.id);
      const elkRoute = effectiveLayout.edges?.get(edge.id);
      let cx: number, cy: number, isHoriz: boolean;
      if (routerPath) {
        cx = routerPath.labelX; cy = routerPath.labelY; isHoriz = routerPath.isHorizSegment;
      } else if (elkRoute) {
        cx = elkRoute.labelX; cy = elkRoute.labelY; isHoriz = false;
      } else {
        const src = effectiveLayout.positions.get(edge.sourceId);
        const tgt = effectiveLayout.positions.get(edge.targetId);
        if (!src || !tgt) continue;
        const g = computeEdgeGeometry(edge, src, tgt);
        cx = g.midX; cy = g.midY; isHoriz = Math.abs(src.y - tgt.y) < src.height * 0.75;
      }
      const badges = badgesFor(edge.summary, { manual: edge.manual, disabled: edge.disabled });
      const w = Math.max(40, measureLabelText(edge.summary.display) + 2 * LABEL_PX + 2);
      const h = LABEL_H_BASE + (badges.length > 0 ? BADGE_ROW : 0);
      slots.push({ edgeId: edge.id, cx, cy, w, h, isHoriz });
    }

    const xOffsets = distributeLabels(
      slots.filter(s => s.isHoriz).map(s => ({ edgeId: s.edgeId, main: s.cx, mainSize: s.w, cross: s.cy, crossSize: s.h })),
      LABEL_GAP,
    );
    const yOffsets = distributeLabels(
      slots.filter(s => !s.isHoriz).map(s => ({ edgeId: s.edgeId, main: s.cy, mainSize: s.h, cross: s.cx, crossSize: s.w })),
      LABEL_GAP,
    );

    // Cross-axis pass: push horizontal labels clear of vertical label columns.
    const horizSlots = slots.filter(s => s.isHoriz);
    const vertSlots  = slots.filter(s => !s.isHoriz);
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (const h of horizSlots) {
        let hx = h.cx + (xOffsets.get(h.edgeId) ?? 0);
        const hyLo = h.cy - h.h / 2, hyHi = h.cy + h.h / 2;
        for (const v of vertSlots) {
          const vy = v.cy + (yOffsets.get(v.edgeId) ?? 0);
          if (hyHi <= vy - v.h / 2 || hyLo >= vy + v.h / 2) continue;
          const vxLo = v.cx - v.w / 2, vxHi = v.cx + v.w / 2;
          if (hx + h.w / 2 <= vxLo || hx - h.w / 2 >= vxHi) continue;
          hx = hx < v.cx ? vxLo - h.w / 2 - LABEL_GAP : vxHi + h.w / 2 + LABEL_GAP;
          changed = true;
        }
        xOffsets.set(h.edgeId, hx - h.cx);
      }
      if (!changed) break;
    }

    const result = new Map<string, { midX: number; midY: number }>();
    for (const s of slots) {
      result.set(s.edgeId, {
        midX: s.cx + (xOffsets.get(s.edgeId) ?? 0),
        midY: s.cy + (yOffsets.get(s.edgeId) ?? 0),
      });
    }
    return result;
  }, [computedEdgePaths, effectiveLayout, transitionEdges]);

  const focusId = hovered ?? selection;
  const highlightSet = useMemo(() => {
    if (interaction === "none") return null;
    if (interaction === "select") {
      return computeHighlightSet(selection, visibleGraph.nodes, visibleGraph.edges);
    }
    return computeHighlightSet(focusId, visibleGraph.nodes, visibleGraph.edges);
  }, [interaction, focusId, selection, visibleGraph.nodes, visibleGraph.edges]);

  const anythingFocused = highlightSet !== null;

  const handleSelect = (id: string) => {
    if (interaction === "none") return;
    setInternalSelection(id);
    onSelectionChange?.(id);
  };

  const handleBackgroundClick = () => {
    if (interaction === "none") return;
    setInternalSelection(null);
    onSelectionChange?.(null);
  };

  const handleHoverEnter = (id: string) => {
    if (interaction === "hover-highlight" || interaction === "hover-path") {
      setHovered(id);
    }
    if (interaction === "hover-path") {
      onInspect?.(inspectGraphFocus(visibleGraph, id));
    }
  };

  const handleHoverLeave = () => {
    if (interaction === "hover-highlight" || interaction === "hover-path") {
      setHovered(null);
    }
    if (interaction === "hover-path") {
      onInspect?.(null);
    }
  };

  const tooltipTransition = tooltipEdgeId ? transitionDataMap.get(tooltipEdgeId) : undefined;

  return (
    <div ref={containerRef} style={{ position: "relative", width, height, display: "inline-block" }}>
      {dialectVersion && (
        <div
          data-testid="viewer-version-badge"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "3px 9px",
            background: "#F1F5F9",
            color: "#64748B",
            border: "1px solid #E2E8F0",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {dialectVersion}
        </div>
      )}
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${effectiveLayout.width} ${effectiveLayout.height}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleBackgroundClick}
      onWheel={pan.onWheel}
      onMouseDown={pan.onMouseDown}
      onMouseMove={pan.onMouseMove}
      onMouseUp={pan.onMouseUp}
      onMouseLeave={pan.onMouseUp}
      className={className}
      style={{
        background: workflowPalette.neutrals.white,
        fontFamily: "inherit",
        userSelect: "none",
        ...(productLayout === "fullWidth" ? { display: "block", width: "100%", height: "100%" } : null),
      }}
      data-surface={surface}
      data-layout={productLayout}
      data-interaction={interaction}
      data-testid="workflow-viewer"
    >
      <Defs />
      <g
        transform={`translate(${pan.transform.x}, ${pan.transform.y}) scale(${pan.transform.scale})`}
      >
        {/* Edges first so they render behind nodes. */}
        {transitionEdges.map((edge) => {
          const source = effectiveLayout.positions.get(edge.sourceId);
          const target = effectiveLayout.positions.get(edge.targetId);
          if (!source || !target) return null;
          const targetNode = stateById.get(edge.targetId);
          const elkRoute = effectiveLayout.edges?.get(edge.id);
          const routerPath = computedEdgePaths?.get(edge.id);
          const route = elkRoute;
          const isEdgeSelected = selection === edge.id;
          const isHighlighted = highlightSet?.has(edge.id) ?? false;
          const isDimmed = anythingFocused && !isHighlighted;
          return (
            <EdgePath
              key={edge.id}
              edge={edge}
              source={source}
              target={target}
              route={route}
              overridePath={routerPath?.d}
              targetIsTerminal={
                targetNode?.role === "terminal" ||
                targetNode?.role === "initial-terminal"
              }
              highlighted={isHighlighted}
              dimmed={isDimmed}
              selected={isEdgeSelected}
              onSelect={handleSelect}
              onHoverEnter={handleHoverEnter}
              onHoverLeave={handleHoverLeave}
            />
          );
        })}

        {/* Edge labels on top of edges. */}
        {transitionEdges.map((edge) => {
          const source = effectiveLayout.positions.get(edge.sourceId);
          const target = effectiveLayout.positions.get(edge.targetId);
          if (!source || !target) return null;
          const labelPos = distributedLabelPositions?.get(edge.id) ?? computeEdgeGeometry(edge, source, target);
          const isHighlighted = highlightSet?.has(edge.id) ?? false;
          const isDimmed = anythingFocused && !isHighlighted;
          const hasTooltipData = transitionDataMap.has(edge.id);
          return (
            <EdgeLabel
              key={`label-${edge.id}`}
              edge={edge}
              x={labelPos.midX}
              y={labelPos.midY}
              dimmed={isDimmed}
              onMouseEnter={hasTooltipData ? (e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                setTooltipEdgeId(edge.id);
              } : undefined}
              onMouseLeave={hasTooltipData ? () => {
                setTooltipEdgeId(null);
                setTooltipPos(null);
              } : undefined}
            />
          );
        })}

        {/* Nodes on top. */}
        {visibleGraph.nodes.map((node) => renderNode(node, effectiveLayout, {
          selection,
          highlightSet,
          anythingFocused,
          onSelect: handleSelect,
          onHoverEnter: handleHoverEnter,
          onHoverLeave: handleHoverLeave,
        }))}
      </g>
    </svg>
    {tooltipTransition && tooltipPos && (
      <TransitionTooltip
        transition={tooltipTransition}
        x={tooltipPos.x}
        y={tooltipPos.y}
      />
    )}
    </div>
  );
}

function normalizeLayoutForVisibleGraph(
  layout: LayoutResult | undefined,
  graph: GraphDocument,
): LayoutResult | undefined {
  if (!layout) return undefined;
  const visibleNodeIds = new Set(graph.nodes.map((node) => node.id));
  const positions = new Map(
    Array.from(layout.positions.entries()).filter(([nodeId]) => visibleNodeIds.has(nodeId)),
  );
  const visibleEdgeIds = new Set(graph.edges.map((edge) => edge.id));
  const edges = layout.edges
    ? new Map(Array.from(layout.edges.entries()).filter(([edgeId]) => visibleEdgeIds.has(edgeId)))
    : undefined;
  return {
    ...layout,
    positions,
    edges,
    width: computeLayoutBound(positions, "x"),
    height: computeLayoutBound(positions, "y"),
  };
}

function computeLayoutBound(
  positions: Map<string, NodePosition>,
  axis: "x" | "y",
): number {
  let max = 0;
  for (const position of positions.values()) {
    const bound = axis === "x"
      ? position.x + position.width
      : position.y + position.height;
    if (bound > max) max = bound;
  }
  return Math.max(max + 24, 72);
}

interface RenderCtx {
  selection: string | null;
  highlightSet: Set<string> | null;
  anythingFocused: boolean;
  onSelect: (id: string) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
}

function renderNode(
  node: GraphNode,
  layout: LayoutResult,
  ctx: RenderCtx,
) {
  const pos = layout.positions.get(node.id);
  if (!pos) return null;
  if (node.kind === "startMarker") {
    return <StartMarker key={node.id} position={smallPositionForMarker(pos)} />;
  }
  const isHighlighted = ctx.highlightSet?.has(node.id) ?? false;
  const isDimmed = ctx.anythingFocused && !isHighlighted;
  return (
    <StateNodeView
      key={node.id}
      node={node}
      position={pos}
      selected={ctx.selection === node.id}
      highlighted={isHighlighted}
      dimmed={isDimmed}
      onSelect={ctx.onSelect}
      onHoverEnter={ctx.onHoverEnter}
      onHoverLeave={ctx.onHoverLeave}
    />
  );
}

function smallPositionForMarker(pos: NodePosition): NodePosition {
  // Shrink the marker to a small badge centred at the node slot.
  const size = 16;
  return {
    id: pos.id,
    x: pos.x + pos.width / 2 - size / 2,
    y: pos.y + pos.height / 2 - size / 2,
    width: size,
    height: size,
  };
}

/**
 * Compute the set of node/edge IDs to highlight when `focusedId` is hovered
 * or selected. Returns `null` when nothing is focused (all nodes+edges shown
 * at full opacity).
 */
