import { useEffect, useMemo, useState } from "react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import type {
  GraphDocument,
  GraphNode,
  StateNode,
  TransitionEdge,
  WorkflowInspection,
} from "@cyoda/workflow-graph";
import { computeHighlightSet, inspectGraphFocus, projectToGraph } from "@cyoda/workflow-graph";
import { simpleLayout, nudgeLabels, type LayoutResult, type NodePosition } from "../layout.js";
import { usePanZoom } from "../hooks/usePanZoom.js";
import { Defs } from "./Defs.js";
import { StartMarker } from "./StartMarker.js";
import { StateNodeView } from "./StateNode.js";
import { EdgePath, computeEdgeGeometry } from "./EdgePath.js";
import { EdgeLabel } from "./EdgeLabel.js";
import { workflowPalette } from "../theme/tokens.js";

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


  // Pre-compute fallback label positions with collision avoidance.
  // Only used when effectiveLayout has no .edges (the ELK path already provides label coords).
  const fallbackLabelPositions = useMemo(() => {
    if (effectiveLayout.edges) return null;
    const CHAR_W = 6.5;
    const PILL_H = 24;
    const items = transitionEdges.flatMap((edge) => {
      const source = effectiveLayout.positions.get(edge.sourceId);
      const target = effectiveLayout.positions.get(edge.targetId);
      if (!source || !target) return [];
      const { midX, midY } = computeEdgeGeometry(edge, source, target);
      const pillW = Math.max(40, edge.summary.display.length * CHAR_W + 12);
      return [{ id: edge.id, midX, midY, pillW, pillH: PILL_H }];
    });
    return nudgeLabels(items);
  }, [effectiveLayout, transitionEdges]);

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

  return (
    <svg
      width={width}
      height={height}
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
          const route = effectiveLayout.edges?.get(edge.id);
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
          const route = effectiveLayout.edges?.get(edge.id);
          // ELK path: use pre-placed label coords from the route.
          // Fallback path: use nudge-adjusted positions (collision-free).
          const labelPos = route
            ? { midX: route.labelX, midY: route.labelY }
            : (fallbackLabelPositions?.get(edge.id) ?? computeEdgeGeometry(edge, source, target));
          const isHighlighted = highlightSet?.has(edge.id) ?? false;
          const isDimmed = anythingFocused && !isHighlighted;
          return (
            <EdgeLabel
              key={`label-${edge.id}`}
              edge={edge}
              x={labelPos.midX}
              y={labelPos.midY}
              width={route?.labelWidth}
              height={route?.labelHeight}
              dimmed={isDimmed}
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
