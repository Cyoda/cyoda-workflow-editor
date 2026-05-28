import type { GraphDocument, GraphNode } from "@cyoda/workflow-graph";
import { geometry } from "./theme/tokens.js";

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeWaypoint {
  x: number;
  y: number;
}

export interface EdgeRoute {
  id: string;
  /** Full polyline from source attach point to target attach point. */
  points: EdgeWaypoint[];
  labelX: number;
  labelY: number;
  labelWidth?: number;
  labelHeight?: number;
}

export interface LayoutResult {
  positions: Map<string, NodePosition>;
  /** Optional pre-computed polyline routes (e.g. from ELK). */
  edges?: Map<string, EdgeRoute>;
  width: number;
  height: number;
}

/**
 * Simple deterministic fallback layout used by the viewer when no ELK-computed
 * layout is provided. Groups nodes by workflow and arranges each workflow's
 * states in a BFS-layered top-to-bottom flow.
 *
 * The editor and the website both prefer ELK output (Phase 4). This layout is
 * a dependency-free default so the viewer package can render in isolation.
 */
export function simpleLayout(graph: GraphDocument): LayoutResult {
  const { width: nodeW, height: nodeH } = geometry.node;
  const hGap = 48;
  const vGap = 48;

  const positions = new Map<string, NodePosition>();
  const nodesByWorkflow = groupByWorkflow(graph.nodes);

  let yCursor = 24;
  let maxWidth = 0;

  for (const wfNodes of nodesByWorkflow.values()) {
    const layers = layerByBFS(wfNodes, graph);
    let y = yCursor;
    for (const layer of layers) {
      const layerWidth = layer.length * nodeW + (layer.length - 1) * hGap;
      maxWidth = Math.max(maxWidth, layerWidth + 48);
      let x = Math.max(24, (maxWidth - layerWidth) / 2);
      for (const node of layer) {
        positions.set(node.id, { id: node.id, x, y, width: nodeW, height: nodeH });
        x += nodeW + hGap;
      }
      y += nodeH + vGap;
    }
    yCursor = y + vGap;
  }

  return { positions, width: maxWidth + 24, height: yCursor };
}

/**
 * Greedy label de-overlap pass for fallback (non-ELK) rendering.
 *
 * Takes a list of edges with their tentative label centres and estimated pill
 * dimensions, then nudges any overlapping label downward so pills do not stack.
 * Only applies in the fallback path; ELK already does this via its own label
 * placement algorithm.
 *
 * Returns a Map<edgeId, { midX, midY }> with adjusted centres.
 */
export function nudgeLabels(
  items: Array<{ id: string; midX: number; midY: number; pillW: number; pillH: number }>,
): Map<string, { midX: number; midY: number }> {
  // Sort by x then y so we process left-to-right, top-to-bottom.
  const sorted = [...items].sort((a, b) => a.midX - b.midX || a.midY - b.midY);
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const result = new Map<string, { midX: number; midY: number }>();

  for (const item of sorted) {
    const { midX } = item;
    let { midY } = item;
    const halfW = item.pillW / 2;
    const halfH = item.pillH / 2;

    // Nudge downward until no overlap with already-placed labels.
    let attempts = 0;
    while (attempts < 20) {
      const overlaps = placed.some(
        (p) =>
          midX + halfW > p.x - p.w / 2 &&
          midX - halfW < p.x + p.w / 2 &&
          midY + halfH > p.y - p.h / 2 &&
          midY - halfH < p.y + p.h / 2,
      );
      if (!overlaps) break;
      midY += item.pillH + 4;
      attempts++;
    }

    placed.push({ x: midX, y: midY, w: item.pillW, h: item.pillH });
    result.set(item.id, { midX, midY });
  }

  return result;
}

function groupByWorkflow(nodes: GraphNode[]): Map<string, GraphNode[]> {
  const out = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const wf = "workflow" in n ? n.workflow : "";
    const list = out.get(wf) ?? [];
    list.push(n);
    out.set(wf, list);
  }
  return out;
}

function layerByBFS(nodes: GraphNode[], graph: GraphDocument): GraphNode[][] {
  const stateNodes: GraphNode[] = nodes.filter((n) => n.kind === "state");
  const markers: GraphNode[] = nodes.filter((n) => n.kind === "startMarker");
  if (stateNodes.length === 0) return markers.length > 0 ? [markers] : [];

  // Build adjacency from transition edges (skip loopbacks for layering).
  const adj = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();
  for (const n of stateNodes) {
    adj.set(n.id, new Set());
    indeg.set(n.id, 0);
  }
  for (const e of graph.edges) {
    if (e.kind !== "transition" || e.isLoopback) continue;
    if (!adj.has(e.sourceId) || !adj.has(e.targetId)) continue;
    const set = adj.get(e.sourceId)!;
    if (!set.has(e.targetId)) {
      set.add(e.targetId);
      indeg.set(e.targetId, (indeg.get(e.targetId) ?? 0) + 1);
    }
  }

  const layers: GraphNode[][] = [];
  if (markers.length > 0) layers.push(markers);

  // Topological layering: sources first, then successors.
  const byId = new Map(stateNodes.map((n) => [n.id, n] as const));
  let frontier = stateNodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
  const placed = new Set<string>();
  while (frontier.length > 0) {
    layers.push(frontier);
    const next: GraphNode[] = [];
    for (const n of frontier) {
      placed.add(n.id);
      for (const succ of adj.get(n.id) ?? []) {
        const remaining = (indeg.get(succ) ?? 0) - 1;
        indeg.set(succ, remaining);
        if (remaining === 0 && !placed.has(succ)) {
          const node = byId.get(succ);
          if (node) next.push(node);
        }
      }
    }
    frontier = next;
  }

  // Any unplaced (cycle participants not reachable via in-degree-0) — drop
  // into a trailing layer so they still render.
  const remaining = stateNodes.filter((n) => !placed.has(n.id));
  if (remaining.length > 0) layers.push(remaining);
  return layers;
}
