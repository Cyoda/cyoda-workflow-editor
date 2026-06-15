import type {
  GraphDocument,
  StateNode,
  TransitionEdge,
} from "@cyoda/workflow-graph";
import type {
  LayoutOptions,
  LayoutPreset,
  LayoutResult,
  NodePosition,
  PinnedNode,
} from "./types.js";
import { estimateNodeSize } from "./nodeSize.js";

const DEFAULT_PRESET: LayoutPreset = "configuratorReadable";


// ─── Happy path detection ────────────────────────────────────────────────────

/**
 * Compute the "happy path" — the longest route from the initial state to a
 * terminal state (or the farthest reachable state if no terminal exists),
 * preferring non-manual, non-disabled edges when paths are equal length.
 *
 * Returns a set of transition-edge IDs that lie on this path. The caller can
 * boost their ELK priority so the layered algorithm straightens them along the
 * main axis while pushing branches to the side.
 *
 * Uses topological-order longest-path DP on the forward DAG (non-loopback,
 * non-self edges). Edges that are manual or disabled receive a small penalty
 * so automated paths are preferred when path lengths are tied.
 */
function computeHappyPathEdges(graph: GraphDocument): Set<string> {
  const stateNodes = graph.nodes.filter(
    (n): n is StateNode => n.kind === "state",
  );
  const initialNode = stateNodes.find(
    (n) => n.role === "initial" || n.role === "initial-terminal",
  );
  if (!initialNode) return new Set();
  if (initialNode.role === "initial-terminal") return new Set();

  const terminalIds = new Set(
    stateNodes.filter((n) => n.role === "terminal").map((n) => n.id),
  );

  // Build forward adjacency (DAG after removing loopbacks/self-edges).
  const forwardEdges = graph.edges.filter(
    (e): e is TransitionEdge =>
      e.kind === "transition" && !e.isSelf && !e.isLoopback,
  );
  const adj = new Map<string, TransitionEdge[]>();
  const inDeg = new Map<string, number>();
  const allNodeIds = new Set<string>();
  for (const n of stateNodes) {
    allNodeIds.add(n.id);
    inDeg.set(n.id, 0);
  }
  for (const e of forwardEdges) {
    const list = adj.get(e.sourceId) ?? [];
    list.push(e);
    adj.set(e.sourceId, list);
    inDeg.set(e.targetId, (inDeg.get(e.targetId) ?? 0) + 1);
  }

  // Topological sort (Kahn's algorithm).
  const topoOrder: string[] = [];
  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    topoOrder.push(nodeId);
    for (const edge of adj.get(nodeId) ?? []) {
      const newDeg = (inDeg.get(edge.targetId) ?? 1) - 1;
      inDeg.set(edge.targetId, newDeg);
      if (newDeg === 0) queue.push(edge.targetId);
    }
  }

  // Longest-path DP from initial.
  // Score = path length in edges; manual/disabled edges penalised by 0.5
  // so automated paths win when equal length.
  const dist = new Map<string, number>();
  const pred = new Map<string, TransitionEdge>();
  dist.set(initialNode.id, 0);

  for (const nodeId of topoOrder) {
    const d = dist.get(nodeId);
    if (d === undefined) continue; // unreachable from initial
    for (const edge of adj.get(nodeId) ?? []) {
      const penalty = (edge.manual ? 0.4 : 0) + (edge.disabled ? 0.4 : 0);
      const nd = d + 1 - penalty;
      if (nd > (dist.get(edge.targetId) ?? -Infinity)) {
        dist.set(edge.targetId, nd);
        pred.set(edge.targetId, edge);
      }
    }
  }

  // Pick the best target: prefer terminals, then pick the farthest reachable.
  let bestTarget: string | null = null;
  let bestDist = -Infinity;
  for (const [nodeId, d] of dist) {
    if (nodeId === initialNode.id) continue;
    const isTerminal = terminalIds.has(nodeId);
    // Terminals get a large bonus so they always win over non-terminals.
    const score = isTerminal ? d + 1000 : d;
    if (score > bestDist) {
      bestDist = score;
      bestTarget = nodeId;
    }
  }

  if (!bestTarget) return new Set();

  // Trace back from target to initial.
  const pathEdgeIds = new Set<string>();
  let cur = bestTarget;
  while (pred.has(cur)) {
    const edge = pred.get(cur)!;
    pathEdgeIds.add(edge.id);
    cur = edge.sourceId;
  }
  return pathEdgeIds;
}

// ─── Reingold-Tilford tree layout ─────────────────────────────────────────────

interface TreeNode {
  id: string;
  children: string[];
  width: number;
  height: number;
}

/**
 * Maps each id in `siblingIds` to the set of other siblings it shares a
 * direct edge with (in either direction). Used to pull siblings that are
 * only connected to each other — e.g. a "happy path" state with separate
 * exits to two terminals — next to one another, instead of leaving their
 * relative order to depend solely on declaration order / happy-path centering.
 */
function buildSameLevelLinks(
  edges: readonly TransitionEdge[],
  siblingIds: readonly string[],
): Map<string, Set<string>> {
  const siblingSet = new Set(siblingIds);
  const links = new Map<string, Set<string>>();
  for (const id of siblingIds) links.set(id, new Set());
  for (const e of edges) {
    if (e.isSelf || e.sourceId === e.targetId) continue;
    if (siblingSet.has(e.sourceId) && siblingSet.has(e.targetId)) {
      links.get(e.sourceId)!.add(e.targetId);
      links.get(e.targetId)!.add(e.sourceId);
    }
  }
  return links;
}

/**
 * Single best-effort pass that moves siblings connected by a same-level link
 * next to one another. For each sibling not already adjacent to one of its
 * linked siblings, swap it next to the nearest linked sibling, displacing
 * whichever of that sibling's neighbours has the fewest links of its own (so
 * we avoid undoing an adjacency we just created).
 */
function reorderForSameLevelLinks(
  children: readonly string[],
  links: Map<string, Set<string>>,
): string[] {
  const order = [...children];
  const neighborIndices = (idx: number): number[] => {
    const out: number[] = [];
    if (idx > 0) out.push(idx - 1);
    if (idx < order.length - 1) out.push(idx + 1);
    return out;
  };
  const isSatisfied = (id: string): boolean => {
    const linked = links.get(id);
    if (!linked || linked.size === 0) return true;
    const idx = order.indexOf(id);
    return neighborIndices(idx).some((i) => linked.has(order[i]!));
  };

  for (const id of children) {
    const linked = links.get(id);
    if (!linked || linked.size === 0 || isSatisfied(id)) continue;

    const idx = order.indexOf(id);
    let target: string | undefined;
    let bestDist = Infinity;
    for (const candidate of linked) {
      const d = Math.abs(order.indexOf(candidate) - idx);
      if (d < bestDist) {
        bestDist = d;
        target = candidate;
      }
    }
    if (target === undefined) continue;

    const targetIdx = order.indexOf(target);
    const swapCandidates = neighborIndices(targetIdx).filter((i) => order[i] !== id);
    if (swapCandidates.length === 0) continue;
    swapCandidates.sort(
      (a, b) => (links.get(order[a]!)?.size ?? 0) - (links.get(order[b]!)?.size ?? 0),
    );
    const swapIdx = swapCandidates[0]!;
    const curIdx = order.indexOf(id);
    [order[curIdx], order[swapIdx]] = [order[swapIdx]!, order[curIdx]!];
  }

  return order;
}

/**
 * Build a spanning tree via BFS from the initial node.
 *
 * Each node is assigned to exactly one parent (the first to reach it).
 * Among a node's children, the happy-path child is inserted at index
 * floor(N/2) so it lands at the center for odd N (N=3 → index 1) and
 * right-of-center for even N (N=2 → index 1, i.e. right of sibling). The
 * resulting order is then adjusted by reorderForSameLevelLinks so siblings
 * with a direct edge between them end up next to each other.
 */
function buildLayoutTree(
  graph: GraphDocument,
  happyPathEdgeIds: Set<string>,
  options: LayoutOptions,
): Map<string, TreeNode> {
  const stateNodes = graph.nodes.filter((n): n is StateNode => n.kind === "state");
  const tree = new Map<string, TreeNode>();
  for (const n of stateNodes) {
    const size = options.nodeSize ?? estimateNodeSize(n.stateCode);
    tree.set(n.id, { id: n.id, children: [], width: size.width, height: size.height });
  }

  const initialNode = stateNodes.find(
    (n) => n.role === "initial" || n.role === "initial-terminal",
  );
  if (!initialNode) return tree;

  const linkEdges = graph.edges.filter(
    (e): e is TransitionEdge => e.kind === "transition" && !e.isSelf,
  );
  const forwardEdges = linkEdges.filter((e) => !e.isLoopback);
  const adj = new Map<string, { targetId: string; isHappy: boolean }[]>();
  for (const e of forwardEdges) {
    const list = adj.get(e.sourceId) ?? [];
    list.push({ targetId: e.targetId, isHappy: happyPathEdgeIds.has(e.id) });
    adj.set(e.sourceId, list);
  }

  const visited = new Set<string>([initialNode.id]);
  const queue: string[] = [initialNode.id];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const unvisited = (adj.get(nodeId) ?? []).filter((e) => !visited.has(e.targetId));
    for (const e of unvisited) visited.add(e.targetId);

    const happyEdge = unvisited.find((e) => e.isHappy);
    const otherIds = unvisited.filter((e) => !e.isHappy).map((e) => e.targetId);
    const totalN = otherIds.length + (happyEdge ? 1 : 0);
    const treeChildren = [...otherIds];
    if (happyEdge) treeChildren.splice(Math.floor(totalN / 2), 0, happyEdge.targetId);

    const sameLevelLinks = buildSameLevelLinks(linkEdges, treeChildren);
    const reordered = reorderForSameLevelLinks(treeChildren, sameLevelLinks);

    for (const childId of reordered) queue.push(childId);
    const node = tree.get(nodeId);
    if (node) node.children = reordered;
  }
  return tree;
}

/**
 * Returns the span that the subtree rooted at nodeId requires so siblings
 * don't overlap.  "Span" is width for vertical layout, height for horizontal.
 */
function computeSubtreeSpan(
  nodeId: string,
  tree: Map<string, TreeNode>,
  nodeSpacing: number,
  orientation: "vertical" | "horizontal",
  memo: Map<string, number>,
): number {
  const cached = memo.get(nodeId);
  if (cached !== undefined) return cached;

  const node = tree.get(nodeId);
  if (!node) return 0;

  const selfSpan = orientation === "vertical" ? node.width : node.height;
  if (node.children.length === 0) {
    memo.set(nodeId, selfSpan);
    return selfSpan;
  }

  const childSpans = node.children.map((id) =>
    computeSubtreeSpan(id, tree, nodeSpacing, orientation, memo),
  );
  const span = Math.max(
    selfSpan,
    childSpans.reduce((s, w) => s + w, 0) + nodeSpacing * (node.children.length - 1),
  );
  memo.set(nodeId, span);
  return span;
}

/**
 * Recursively place every node in the subtree.
 *
 * centerSpan  — centre of this subtree in the spread direction (X for vertical)
 * depthOffset — top-left in the depth direction (Y for vertical)
 */
function placeTreeNodes(
  nodeId: string,
  centerSpan: number,
  depthOffset: number,
  tree: Map<string, TreeNode>,
  nodeSpacing: number,
  layerGap: number,
  orientation: "vertical" | "horizontal",
  positions: Map<string, { x: number; y: number }>,
  memo: Map<string, number>,
): void {
  const node = tree.get(nodeId);
  if (!node) return;

  if (node.children.length === 0) {
    if (orientation === "vertical") {
      positions.set(nodeId, { x: centerSpan - node.width / 2, y: depthOffset });
    } else {
      positions.set(nodeId, { x: depthOffset, y: centerSpan - node.height / 2 });
    }
    return;
  }

  const childSpans = node.children.map((id) =>
    computeSubtreeSpan(id, tree, nodeSpacing, orientation, memo),
  );
  const totalChildrenSpan =
    childSpans.reduce((s, w) => s + w, 0) + nodeSpacing * (node.children.length - 1);

  const selfDepth = orientation === "vertical" ? node.height : node.width;
  const childCursor0 = centerSpan - totalChildrenSpan / 2;

  // For N=2: center the node between the two children (equidistant), rather than
  // over the combined subtree span. This prevents a leaf sibling from ending up
  // very far away when the other sibling has a large subtree.
  let nodeCenterSpan = centerSpan;
  if (node.children.length === 2) {
    const firstChildCenter = childCursor0 + childSpans[0]! / 2;
    const lastChildCenter = childCursor0 + totalChildrenSpan - childSpans[1]! / 2;
    nodeCenterSpan = (firstChildCenter + lastChildCenter) / 2;
  }

  if (orientation === "vertical") {
    positions.set(nodeId, { x: nodeCenterSpan - node.width / 2, y: depthOffset });
  } else {
    positions.set(nodeId, { x: depthOffset, y: nodeCenterSpan - node.height / 2 });
  }

  let childCursor = childCursor0;

  for (let i = 0; i < node.children.length; i++) {
    const childId = node.children[i]!;
    const childSpan = childSpans[i]!;
    placeTreeNodes(
      childId,
      childCursor + childSpan / 2,
      depthOffset + selfDepth + layerGap,
      tree,
      nodeSpacing,
      layerGap,
      orientation,
      positions,
      memo,
    );
    childCursor += childSpan + nodeSpacing;
  }
}

function computeTreePositions(
  graph: GraphDocument,
  happyPathEdgeIds: Set<string>,
  preset: LayoutPreset,
  orientation: "vertical" | "horizontal",
  options: LayoutOptions,
): Map<string, PinnedNode> {
  const stateNodes = graph.nodes.filter((n): n is StateNode => n.kind === "state");
  const tree = buildLayoutTree(graph, happyPathEdgeIds, options);
  const scale = degreeSpacingScale(computeMaxEdgeDegree(graph));
  const nodeSpacing = nodeSpacingForPreset(preset) * scale;
  const layerGap = layerGapForPreset(preset, orientation) * scale;
  const memo = new Map<string, number>();
  const rawPositions = new Map<string, { x: number; y: number }>();

  const initialNode = stateNodes.find(
    (n) => n.role === "initial" || n.role === "initial-terminal",
  );

  if (initialNode) {
    const totalSpan = computeSubtreeSpan(initialNode.id, tree, nodeSpacing, orientation, memo);
    placeTreeNodes(
      initialNode.id,
      totalSpan / 2,
      0,
      tree,
      nodeSpacing,
      layerGap,
      orientation,
      rawPositions,
      memo,
    );
  }

  // Place orphan nodes (unreachable from initial) in a row below/right of the tree.
  let treeExtent = 0;
  for (const [nodeId, pos] of rawPositions) {
    const node = tree.get(nodeId);
    if (!node) continue;
    const extent = orientation === "vertical" ? pos.y + node.height : pos.x + node.width;
    if (extent > treeExtent) treeExtent = extent;
  }
  const orphanStart = treeExtent > 0 ? treeExtent + layerGap : 0;
  let orphanCursor = 0;

  for (const n of stateNodes) {
    if (!rawPositions.has(n.id)) {
      const size = options.nodeSize ?? estimateNodeSize(n.stateCode);
      if (orientation === "vertical") {
        rawPositions.set(n.id, { x: orphanCursor, y: orphanStart });
        orphanCursor += size.width + nodeSpacing;
      } else {
        rawPositions.set(n.id, { x: orphanStart, y: orphanCursor });
        orphanCursor += size.height + nodeSpacing;
      }
    }
  }

  const pinnedMap = new Map<string, PinnedNode>();
  for (const [nodeId, pos] of rawPositions) {
    pinnedMap.set(nodeId, { id: nodeId, x: pos.x, y: pos.y });
  }
  return pinnedMap;
}

/** Layer gap (nodeNodeBetweenLayers) matching each preset's ELK options. */
function layerGapForPreset(
  preset: LayoutPreset,
  orientation: "vertical" | "horizontal",
): number {
  switch (preset) {
    case "websiteCompact":       return orientation === "horizontal" ? 120 : 64;
    case "configuratorReadable": return orientation === "horizontal" ? 140 : 140;
    case "opsAudit":             return orientation === "horizontal" ? 180 : 128;
  }
}

/** nodeNode spacing matching each preset's ELK options. */
function nodeSpacingForPreset(preset: LayoutPreset): number {
  switch (preset) {
    case "websiteCompact":       return 40;
    case "configuratorReadable": return 150;
    case "opsAudit":             return 72;
  }
}

/**
 * Computes the maximum total degree (in + out, non-self edges) across all
 * nodes. A node with 3 outgoing + 3 incoming = 6 total, which is what
 * matters for label crowding between layers.
 */
function computeMaxEdgeDegree(graph: GraphDocument): number {
  const totalDeg = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.kind !== "transition" || e.isSelf) continue;
    totalDeg.set(e.sourceId, (totalDeg.get(e.sourceId) ?? 0) + 1);
    totalDeg.set(e.targetId, (totalDeg.get(e.targetId)  ?? 0) + 1);
  }
  return totalDeg.size > 0 ? Math.max(...totalDeg.values()) : 0;
}

/**
 * Spacing scale factor based on the busiest node's total edge count.
 * Kicks in above 4 total edges, adds 25% per step, capped at 3×.
 *
 *   total ≤ 4 → 1.0×
 *   total = 6 → 1.5×
 *   total = 8 → 2.0×
 *   total ≥ 12 → 3.0× (cap)
 */
function degreeSpacingScale(maxDegree: number): number {
  return Math.min(3, 1 + Math.max(0, maxDegree - 4) * 0.25);
}

function buildLayoutResult(
  graph: GraphDocument,
  pinnedPositions: Map<string, PinnedNode>,
  preset: LayoutPreset,
  orientation: "vertical" | "horizontal",
  options: LayoutOptions,
): LayoutResult {
  const stateNodes = graph.nodes.filter((n): n is StateNode => n.kind === "state");
  const positions = new Map<string, NodePosition>();

  for (const [nodeId, pin] of pinnedPositions) {
    const stateNode = stateNodes.find((n) => n.id === nodeId);
    if (!stateNode) continue;
    const size = options.nodeSize ?? estimateNodeSize(stateNode.stateCode);
    positions.set(nodeId, { id: nodeId, x: pin.x, y: pin.y, width: size.width, height: size.height });
  }

  // Position startMarker nodes relative to the workflow's initial state.
  for (const node of graph.nodes) {
    if (node.kind !== "startMarker") continue;
    const initial = stateNodes.find(
      (n): n is StateNode =>
        n.kind === "state" &&
        n.workflow === node.workflow &&
        (n.role === "initial" || n.role === "initial-terminal"),
    );
    if (!initial) continue;
    const pos = positions.get(initial.id);
    if (!pos) continue;
    if (orientation === "horizontal") {
      positions.set(node.id, {
        id: node.id,
        x: Math.max(0, pos.x - 32),
        y: pos.y + pos.height / 2 - 8,
        width: 16,
        height: 16,
      });
    } else {
      positions.set(node.id, {
        id: node.id,
        x: pos.x + pos.width / 2 - 8,
        y: Math.max(0, pos.y - 32),
        width: 16,
        height: 16,
      });
    }
  }

  const width = computeBound(positions, "x", 144);
  const height = computeBound(positions, "y", 72);

  // Canvas renders edges from live node positions, not from pre-computed routes.
  return { positions, edges: new Map(), width, height, preset };
}

function computeBound(
  positions: Map<string, NodePosition>,
  axis: "x" | "y",
  sizeFallback: number,
): number {
  let max = 0;
  for (const p of positions.values()) {
    const side = axis === "x" ? p.x + p.width : p.y + p.height;
    if (side > max) max = side;
  }
  return max + sizeFallback;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function layoutGraph(
  graph: GraphDocument,
  options: LayoutOptions = {},
): Promise<LayoutResult> {
  const preset = options.preset ?? DEFAULT_PRESET;
  const orientation = options.orientation ?? "vertical";
  const userPinnedMap = new Map<string, PinnedNode>(
    (options.pinned ?? []).map((p) => [p.id, p]),
  );

  const stateCount = graph.nodes.reduce(
    (n, node) => (node.kind === "state" ? n + 1 : n),
    0,
  );
  if (stateCount === 0) {
    return { positions: new Map(), edges: new Map(), width: 0, height: 0, preset };
  }

  const happyPathIds = computeHappyPathEdges(graph);
  const rtPositions = computeTreePositions(graph, happyPathIds, preset, orientation, options);

  // User-dragged pins override RT positions.
  const allPositions = new Map<string, PinnedNode>([...rtPositions, ...userPinnedMap]);
  return buildLayoutResult(graph, allPositions, preset, orientation, options);
}

export const layoutGraphAsync = layoutGraph;
