/**
 * Shared edge routing — produces orthogonal edge paths identical to the
 * workflow-react Canvas.  Used by the viewer so it renders edges the same way.
 *
 * No dependency on ReactFlow: the `Position` enum is replaced by the local
 * `Anchor` string-literal type.
 */
import type { TransitionEdge } from "@cyoda/workflow-graph";
import type { NodePosition } from "./types.js";

// ── Anchor type (mirrors ReactFlow Position enum) ─────────────────────────────
export type Anchor = "top" | "right" | "bottom" | "left";

export interface EdgePathResult {
  /** SVG path `d` string. */
  d: string;
  /** Label placement midpoint. */
  labelX: number;
  labelY: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ROUTE_STUB = 48;
const PARALLEL_STEP = 36;

const SELF_LOOP_CORNERS = [
  { source: "right-top",    target: "top-right"   },
  { source: "left-top",     target: "top-left"    },
  { source: "bottom-right", target: "right-bottom" },
  { source: "bottom-left",  target: "left-bottom"  },
] as const;

const HANDLE_OVERFLOW: Record<Anchor, readonly string[]> = {
  bottom: ["bottom-left", "bottom", "bottom-right", "left-bottom", "right-bottom", "left", "right", "left-top", "right-top", "top-left", "top", "top-right"],
  top:    ["top-left",    "top",    "top-right",    "right-top",   "left-top",    "right", "left", "right-bottom", "left-bottom", "bottom-left", "bottom", "bottom-right"],
  right:  ["right-top",   "right",  "right-bottom", "bottom-right","top-right",   "bottom","top",  "bottom-left",  "top-left",    "left-bottom", "left",   "left-top"],
  left:   ["left-top",    "left",   "left-bottom",  "top-left",    "bottom-left", "top",   "bottom","top-right",   "bottom-right","right-top",   "right",  "right-bottom"],
};

const HANDLE_FOUR: Record<Anchor, readonly string[]> = {
  top:    ["left-top",    "top-left",   "top-right",    "right-top"],
  right:  ["top-right",   "right-top",  "right-bottom", "bottom-right"],
  bottom: ["left-bottom", "bottom-left","bottom-right", "right-bottom"],
  left:   ["top-left",    "left-top",   "left-bottom",  "bottom-left"],
};

// ── Handle geometry helpers ───────────────────────────────────────────────────

function positionForHandle(handle: string | undefined): Anchor {
  if (handle?.startsWith("top"))   return "top";
  if (handle?.startsWith("right")) return "right";
  if (handle?.startsWith("left"))  return "left";
  return "bottom";
}

function insetForHandle(handle: string | undefined): number {
  switch (handle) {
    case "top-left": case "right-top": case "bottom-left": case "left-top":
      return 0.28;
    case "top-right": case "right-bottom": case "bottom-right": case "left-bottom":
      return 0.72;
    default:
      return 0.5;
  }
}

function pointForHandle(
  node: NodePosition | undefined,
  handle: string | undefined,
): { x: number; y: number } | undefined {
  if (!node) return undefined;
  const pos = positionForHandle(handle);
  const inset = insetForHandle(handle);
  if (pos === "top")    return { x: node.x + node.width * inset, y: node.y };
  if (pos === "right")  return { x: node.x + node.width, y: node.y + node.height * inset };
  if (pos === "left")   return { x: node.x, y: node.y + node.height * inset };
  return { x: node.x + node.width * inset, y: node.y + node.height };
}

// ── Orthogonal path computation ───────────────────────────────────────────────

function normalOf(anchor: Anchor): { x: number; y: number } {
  switch (anchor) {
    case "top":    return { x: 0,  y: -1 };
    case "right":  return { x: 1,  y:  0 };
    case "bottom": return { x: 0,  y:  1 };
    case "left":   return { x: -1, y:  0 };
  }
}

function polylineToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x} ${first!.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

function tryStraight(
  s: { x: number; y: number }, sn: { x: number; y: number },
  t: { x: number; y: number }, tn: { x: number; y: number },
  tol: number,
): { x: number; y: number }[] | null {
  if (sn.x + tn.x !== 0 || sn.y + tn.y !== 0) return null;
  if (sn.x !== 0) {
    if (Math.abs(s.y - t.y) > tol) return null;
    if (sn.x > 0 && t.x < s.x) return null;
    if (sn.x < 0 && t.x > s.x) return null;
    return [{ x: s.x, y: s.y }, { x: t.x, y: s.y }];
  }
  if (Math.abs(s.x - t.x) > tol) return null;
  if (sn.y > 0 && t.y < s.y) return null;
  if (sn.y < 0 && t.y > s.y) return null;
  return [{ x: s.x, y: s.y }, { x: s.x, y: t.y }];
}

function selfLoopPath(
  sx: number, sy: number, tx: number, ty: number,
  srcAnchor: Anchor, tgtAnchor: Anchor,
  srcRect: NodePosition, stub: number,
): { points: { x: number; y: number }[]; labelX: number; labelY: number } {
  const li = stub + 12;
  const ci = stub + 44;
  if (srcAnchor === "right" && tgtAnchor === "top") {
    const lx = srcRect.x + srcRect.width + ci, ly = srcRect.y - ci;
    return { points: [{x:sx,y:sy},{x:lx,y:sy},{x:lx,y:ly},{x:tx,y:ly},{x:tx,y:ty}], labelX: lx, labelY: (sy+ly)/2 };
  }
  if (srcAnchor === "left" && tgtAnchor === "top") {
    const lx = srcRect.x - ci, ly = srcRect.y - ci;
    return { points: [{x:sx,y:sy},{x:lx,y:sy},{x:lx,y:ly},{x:tx,y:ly},{x:tx,y:ty}], labelX: lx, labelY: (sy+ly)/2 };
  }
  if (srcAnchor === "bottom" && tgtAnchor === "right") {
    const lx = srcRect.x + srcRect.width + ci, ly = srcRect.y + srcRect.height + ci;
    return { points: [{x:sx,y:sy},{x:sx,y:ly},{x:lx,y:ly},{x:lx,y:ty},{x:tx,y:ty}], labelX: lx, labelY: (ly+ty)/2 };
  }
  if (srcAnchor === "bottom" && tgtAnchor === "left") {
    const lx = srcRect.x - ci, ly = srcRect.y + srcRect.height + ci;
    return { points: [{x:sx,y:sy},{x:sx,y:ly},{x:lx,y:ly},{x:lx,y:ty},{x:tx,y:ty}], labelX: lx, labelY: (ly+ty)/2 };
  }
  if (srcAnchor === "bottom" && tgtAnchor === "top") {
    const lx = srcRect.x + srcRect.width + li, ly = srcRect.y + srcRect.height + li;
    return { points: [{x:sx,y:sy},{x:sx,y:ly},{x:lx,y:ly},{x:lx,y:ty-li},{x:tx,y:ty-li},{x:tx,y:ty}], labelX: lx, labelY: ly };
  }
  if (srcAnchor === "right" && tgtAnchor === "left") {
    const lx = srcRect.x + srcRect.width + li, ly = srcRect.y + srcRect.height + li;
    return { points: [{x:sx,y:sy},{x:lx,y:sy},{x:lx,y:ly},{x:tx-li,y:ly},{x:tx-li,y:ty},{x:tx,y:ty}], labelX: lx, labelY: ly };
  }
  return { points: [{x:sx,y:sy},{x:sx+li,y:sy},{x:tx+li,y:ty},{x:tx,y:ty}], labelX: (sx+tx)/2+li, labelY: (sy+ty)/2 };
}

function nudgeH(x1: number, x2: number, y: number, obs: NodePosition[]): number {
  const pad = 8;
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
  for (const o of obs) {
    if (hi < o.x - pad || lo > o.x + o.width + pad) continue;
    if (y < o.y - pad || y > o.y + o.height + pad) continue;
    const above = o.y - pad - 1, below = o.y + o.height + pad + 1;
    y = Math.abs(y - above) < Math.abs(y - below) ? above : below;
  }
  return y;
}

function nudgeV(y1: number, y2: number, x: number, obs: NodePosition[]): number {
  const pad = 8;
  const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
  // Iteratively merge all x-intervals that block the current x and jump clear.
  // A single pass can oscillate when two obstacle groups push x in opposite
  // directions; merging their intervals resolves the conflict in one step.
  for (let pass = 0; pass <= obs.length; pass++) {
    const blocking = obs.filter(
      o => !(hi < o.y - pad || lo > o.y + o.height + pad) && x >= o.x - pad && x <= o.x + o.width + pad,
    );
    if (blocking.length === 0) break;
    const intervals = blocking.map(o => [o.x - pad, o.x + o.width + pad] as [number, number]);
    intervals.sort((a, b) => a[0] - b[0]);
    let mlo = intervals[0]![0], mhi = intervals[0]![1];
    for (const [l, r] of intervals.slice(1)) { if (l <= mhi + 1) mhi = Math.max(mhi, r); }
    const leftClear = mlo - 1, rightClear = mhi + 1;
    x = Math.abs(x - leftClear) < Math.abs(x - rightClear) ? leftClear : rightClear;
  }
  return x;
}

function simplifyPath(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  let i = 1;
  while (i < out.length - 1) {
    const a = out[i - 1]!, b = out[i]!, c = out[i + 1]!;
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
    else i++;
  }
  return out;
}

function longestMid(pts: { x: number; y: number }[]): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0]!;
  let best = -1, mid = pts[0]!;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best) { best = len; mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  }
  return mid;
}

function computeOrthogonalPath(
  sx: number, sy: number, tx: number, ty: number,
  srcAnchor: Anchor, tgtAnchor: Anchor,
  srcRect: NodePosition | undefined,
  tgtRect: NodePosition | undefined,
  parallelOffset: number,
  obstacles: NodePosition[],
): { path: string; labelX: number; labelY: number } {
  const stub = ROUTE_STUB;

  // Self-loop
  if (srcRect && tgtRect && srcRect.id === tgtRect.id) {
    const loop = selfLoopPath(sx, sy, tx, ty, srcAnchor, tgtAnchor, srcRect, stub);
    return { path: polylineToPath(loop.points), labelX: loop.labelX, labelY: loop.labelY };
  }

  const sn = normalOf(srcAnchor);
  const tn = normalOf(tgtAnchor);

  // Straight-line shortcut
  const straight = parallelOffset === 0
    ? tryStraight({ x: sx, y: sy }, sn, { x: tx, y: ty }, tn, 6)
    : null;
  if (straight) {
    const mid = longestMid(straight);
    return { path: polylineToPath(straight), labelX: mid.x, labelY: mid.y };
  }

  const sStub = { x: sx + sn.x * stub, y: sy + sn.y * stub };
  const tStub = { x: tx + tn.x * stub, y: ty + tn.y * stub };
  const srcAxis = sn.x !== 0 ? "horizontal" : "vertical";

  let pts: { x: number; y: number }[];

  if (srcAxis === "vertical") {
    let midY = (sStub.y + tStub.y) / 2 + parallelOffset;
    if (sn.y > 0) midY = Math.max(midY, sStub.y);
    else if (sn.y < 0) midY = Math.min(midY, sStub.y);
    if (tn.y > 0) midY = Math.max(midY, tStub.y);
    else if (tn.y < 0) midY = Math.min(midY, tStub.y);
    const violated = (sn.y > 0 && midY < sStub.y) || (sn.y < 0 && midY > sStub.y);
    if (violated) {
      const midX = (sStub.x + tStub.x) / 2 + parallelOffset;
      pts = [{x:sx,y:sy},{x:sStub.x,y:sStub.y},{x:midX,y:sStub.y},{x:midX,y:tStub.y},{x:tStub.x,y:tStub.y},{x:tx,y:ty}];
    } else {
      midY = nudgeH(sStub.x, tStub.x, midY, obstacles);
      pts = [{x:sx,y:sy},{x:sStub.x,y:midY},{x:tStub.x,y:midY},{x:tStub.x,y:tStub.y},{x:tx,y:ty}];
    }
  } else {
    let midX = (sStub.x + tStub.x) / 2 + parallelOffset;
    if (sn.x > 0) midX = Math.max(midX, sStub.x);
    else if (sn.x < 0) midX = Math.min(midX, sStub.x);
    if (tn.x > 0) midX = Math.max(midX, tStub.x);
    else if (tn.x < 0) midX = Math.min(midX, tStub.x);
    const violated = (sn.x > 0 && midX < sStub.x) || (sn.x < 0 && midX > sStub.x);
    if (violated) {
      const midY = (sStub.y + tStub.y) / 2 + parallelOffset;
      pts = [{x:sx,y:sy},{x:sStub.x,y:sStub.y},{x:sStub.x,y:midY},{x:tStub.x,y:midY},{x:tStub.x,y:tStub.y},{x:tx,y:ty}];
    } else {
      midX = nudgeV(sStub.y, tStub.y, midX, obstacles);
      pts = [{x:sx,y:sy},{x:midX,y:sStub.y},{x:midX,y:tStub.y},{x:tStub.x,y:tStub.y},{x:tx,y:ty}];
    }
  }

  pts = simplifyPath(pts);
  const mid = longestMid(pts);
  return { path: polylineToPath(pts), labelX: mid.x, labelY: mid.y };
}

// ── Back-edge detection ───────────────────────────────────────────────────────

function isBackEdge(
  edge: TransitionEdge,
  positions: Map<string, NodePosition>,
  orientation: "vertical" | "horizontal",
): boolean {
  if (edge.isSelf) return false;
  const src = positions.get(edge.sourceId);
  const tgt = positions.get(edge.targetId);
  if (!src || !tgt) return false;
  if (orientation === "horizontal") return src.x > tgt.x;
  if (src.y !== tgt.y) return src.y > tgt.y;
  return src.x > tgt.x;
}

// ── anchorHandleId ────────────────────────────────────────────────────────────

function anchorHandleId(
  anchor: string | null | undefined,
  role: "source" | "target",
  orientation: "vertical" | "horizontal",
  back: boolean,
  toTerminalSide?: "left" | "right",
  backEdgeSide?: "left" | "right",
): string | undefined {
  if (anchor) return anchor;
  if (orientation === "horizontal") {
    if (back) return "bottom";
    return role === "source" ? "right" : "left";
  }
  if (toTerminalSide) {
    return role === "source" ? toTerminalSide : (toTerminalSide === "left" ? "right" : "left");
  }
  if (back) return backEdgeSide ?? "right";
  return role === "source" ? "bottom" : "top";
}

// ── splitHandleFor ────────────────────────────────────────────────────────────

function splitHandleFor(
  side: Anchor,
  index: number,
  total: number,
  occupied: ReadonlySet<string> = new Set(),
): string {
  const overflow = HANDLE_OVERFLOW[side];
  function natural(): string {
    const v =
      side === "top"    ? ["top-left",    "top",    "top-right"]    :
      side === "right"  ? ["right-top",   "right",  "right-bottom"] :
      side === "bottom" ? ["bottom-left", "bottom", "bottom-right"] :
                          ["left-top",    "left",   "left-bottom"];
    if (total <= 1) return v[1]!;
    if (total === 2) return v[index === 0 ? 0 : 2]!;
    if (total === 3) return v[index]!;
    if (total === 4) return HANDLE_FOUR[side][index]!;
    return overflow[index % overflow.length]!;
  }
  const preferred = natural();
  if (!occupied.has(preferred)) return preferred;
  for (const c of overflow) { if (!occupied.has(c)) return c; }
  return preferred;
}

// ── sortEndpointAssignments ───────────────────────────────────────────────────

type EndpointAssignment = {
  edgeId: string; parallelIndex: number; role: "source" | "target";
  nodeId: string; oppositeId: string; baseSide: Anchor;
};

function sortEndpoints(
  a: EndpointAssignment, b: EndpointAssignment,
  baseSide: Anchor, positions: Map<string, NodePosition>,
): number {
  const aPos = positions.get(a.oppositeId);
  const bPos = positions.get(b.oppositeId);
  const aAxis = baseSide === "top" || baseSide === "bottom" ? (aPos?.x ?? 0) : (aPos?.y ?? 0);
  const bAxis = baseSide === "top" || baseSide === "bottom" ? (bPos?.x ?? 0) : (bPos?.y ?? 0);
  if (aAxis !== bAxis) return aAxis - bAxis;
  return a.parallelIndex - b.parallelIndex;
}

// ── computeHandles ────────────────────────────────────────────────────────────
// Ported from Canvas.tsx computeAutoHandles — same logic, no ReactFlow dep.

function computeHandles(
  edges: TransitionEdge[],
  positions: Map<string, NodePosition>,
  orientation: "vertical" | "horizontal",
  terminalIds: Set<string>,
): Map<string, string> {
  const assignments = new Map<string, string>();
  const grouped = new Map<string, EndpointAssignment[]>();

  // Self-loops
  const selfLoopsByNode = new Map<string, string[]>();
  for (const e of edges) {
    if (e.isSelf) {
      const list = selfLoopsByNode.get(e.sourceId) ?? [];
      list.push(e.id);
      selfLoopsByNode.set(e.sourceId, list);
    }
  }

  for (const e of edges) {
    if (e.isSelf) {
      const idx = (selfLoopsByNode.get(e.sourceId) ?? []).indexOf(e.id);
      const corner = SELF_LOOP_CORNERS[idx % SELF_LOOP_CORNERS.length]!;
      assignments.set(`${e.id}:source`, e.sourceAnchor ?? corner.source);
      assignments.set(`${e.id}:target`, e.targetAnchor ?? corner.target);
      continue;
    }

    let toTerminalSide: "left" | "right" | undefined;
    if (orientation === "vertical" && terminalIds.has(e.targetId)) {
      const sp = positions.get(e.sourceId);
      const tp = positions.get(e.targetId);
      if (sp && tp) {
        const sameRow = Math.abs(sp.y - tp.y) < sp.height * 0.75;
        if (sameRow) {
          const sCX = sp.x + sp.width / 2, tCX = tp.x + tp.width / 2;
          toTerminalSide = tCX <= sCX ? "left" : "right";
        }
      }
    }

    let backEdgeSrcSide: "left" | "right" | undefined;
    let backEdgeTgtSide: "left" | "right" | undefined;
    const back = isBackEdge(e, positions, orientation);
    if (back && orientation === "vertical") {
      const sp = positions.get(e.sourceId);
      const tp = positions.get(e.targetId);
      if (sp && tp) {
        const sCX = sp.x + sp.width / 2, tCX = tp.x + tp.width / 2;
        const xDiff = sCX - tCX;
        if (Math.abs(xDiff) < 10) {
          backEdgeSrcSide = "right"; backEdgeTgtSide = "right";
        } else {
          backEdgeSrcSide = xDiff > 0 ? "left" : "right";
          backEdgeTgtSide = xDiff > 0 ? "right" : "left";
        }
      }
    }

    // Same-level forward edges (source and target at the same Y): route via
    // arc below (right-going) or arc above (left-going) so the label is
    // placed outside the node bodies rather than through them.
    let sameLevelSide: Anchor | undefined;
    if (orientation === "vertical" && !back && !toTerminalSide) {
      const sp = positions.get(e.sourceId);
      const tp = positions.get(e.targetId);
      if (sp && tp && Math.abs(sp.y - tp.y) < sp.height * 0.75) {
        const sCX = sp.x + sp.width / 2, tCX = tp.x + tp.width / 2;
        if (Math.abs(sCX - tCX) > 10) sameLevelSide = sCX < tCX ? "bottom" : "top";
      }
    }

    const sourceSide = (sameLevelSide && !e.sourceAnchor)
      ? sameLevelSide
      : anchorHandleId(e.sourceAnchor, "source", orientation, back, toTerminalSide, backEdgeSrcSide) as Anchor;
    const targetSide = (sameLevelSide && !e.targetAnchor)
      ? sameLevelSide
      : anchorHandleId(e.targetAnchor, "target", orientation, back, toTerminalSide, backEdgeTgtSide) as Anchor;

    if (e.sourceAnchor) {
      assignments.set(`${e.id}:source`, e.sourceAnchor);
    } else {
      const key = `${e.sourceId}|${sourceSide}`;
      const list = grouped.get(key) ?? [];
      list.push({ edgeId: e.id, parallelIndex: e.parallelIndex, role: "source", nodeId: e.sourceId, oppositeId: e.targetId, baseSide: sourceSide });
      grouped.set(key, list);
    }
    if (e.targetAnchor) {
      assignments.set(`${e.id}:target`, e.targetAnchor);
    } else {
      const key = `${e.targetId}|${targetSide}`;
      const list = grouped.get(key) ?? [];
      list.push({ edgeId: e.id, parallelIndex: e.parallelIndex, role: "target", nodeId: e.targetId, oppositeId: e.sourceId, baseSide: targetSide });
      grouped.set(key, list);
    }
  }

  // Build explicit occupancy map
  const explicitByNode = new Map<string, Set<string>>();
  function markOccupied(nodeId: string, handle: string) {
    const s = explicitByNode.get(nodeId) ?? new Set<string>();
    s.add(handle);
    explicitByNode.set(nodeId, s);
  }
  for (const e of edges) {
    if (e.sourceAnchor) markOccupied(e.sourceId, e.sourceAnchor);
    if (e.targetAnchor) markOccupied(e.targetId, e.targetAnchor);
    if (e.isSelf) {
      const sh = assignments.get(`${e.id}:source`);
      const th = assignments.get(`${e.id}:target`);
      if (sh) markOccupied(e.sourceId, sh);
      if (th) markOccupied(e.sourceId, th);
    }
  }

  // Group-phase: assign sub-handles
  for (const [groupKey, endpoints] of grouped) {
    const [nodeId, baseSide] = groupKey.split("|") as [string, Anchor];
    const occupied = explicitByNode.get(nodeId) ?? new Set<string>();
    const sorted = [...endpoints].sort((a, b) => sortEndpoints(a, b, baseSide, positions));
    sorted.forEach((ep, index) => {
      const h = splitHandleFor(baseSide, index, sorted.length, occupied);
      occupied.add(h);
      explicitByNode.set(nodeId, occupied);
      assignments.set(`${ep.edgeId}:${ep.role}`, h);
    });
  }

  // ── Bidirectional same-level pairs ────────────────────────────────────────
  const edgeByPair = new Map<string, TransitionEdge>();
  for (const e of edges) { if (!e.isSelf) edgeByPair.set(`${e.sourceId}->${e.targetId}`, e); }

  const assignBiDir = (
    edgeId: string, role: "source" | "target",
    nodeId: string, side: "top" | "bottom", oppositeNodeId: string,
  ) => {
    const occ = explicitByNode.get(nodeId) ?? new Set<string>();
    const cur = assignments.get(`${edgeId}:${role}`);
    if (cur) occ.delete(cur);
    const np = positions.get(nodeId), op = positions.get(oppositeNodeId);
    const nCX = np ? np.x + np.width / 2 : 0, oCX = op ? op.x + op.width / 2 : 0;
    const closer  = oCX < nCX ? `${side}-left`  : `${side}-right`;
    const farther = oCX < nCX ? `${side}-right` : `${side}-left`;
    const h = [closer, farther, side].find(c => !occ.has(c));
    if (!h) { if (cur) occ.add(cur); return; }
    occ.add(h); explicitByNode.set(nodeId, occ); assignments.set(`${edgeId}:${role}`, h);
  };

  for (const edge of edges) {
    if (edge.isSelf) continue;
    const reverse = edgeByPair.get(`${edge.targetId}->${edge.sourceId}`);
    if (!reverse || edge.id >= reverse.id) continue;
    const sp = positions.get(edge.sourceId), tp = positions.get(edge.targetId);
    if (!sp || !tp) continue;

    if (Math.abs(sp.y - tp.y) < sp.height * 0.75) {
      // Same-level: top/bottom arcs
      const sCX = sp.x + sp.width / 2, tCX = tp.x + tp.width / 2;
      const [rightEdge, leftEdge] = sCX <= tCX ? [edge, reverse] : [reverse, edge];
      if (!rightEdge.sourceAnchor) assignBiDir(rightEdge.id, "source", rightEdge.sourceId, "bottom", rightEdge.targetId);
      if (!rightEdge.targetAnchor) assignBiDir(rightEdge.id, "target", rightEdge.targetId, "bottom", rightEdge.sourceId);
      if (!leftEdge.sourceAnchor)  assignBiDir(leftEdge.id,  "source", leftEdge.sourceId,  "top",    leftEdge.targetId);
      if (!leftEdge.targetAnchor)  assignBiDir(leftEdge.id,  "target", leftEdge.targetId,  "top",    leftEdge.sourceId);
    } else {
      // Different-Y: route back-edge outward with shared sub-handle
      const backEdge = sp.y > tp.y ? edge : reverse;
      const bsp = positions.get(backEdge.sourceId), btp = positions.get(backEdge.targetId);
      if (!bsp || !btp) continue;
      const xDiff = (bsp.x + bsp.width / 2) - (btp.x + btp.width / 2);
      if (Math.abs(xDiff) < 10) continue;
      const outwardSide: "left" | "right" = xDiff < 0 ? "left" : "right";

      const srcOcc = explicitByNode.get(backEdge.sourceId) ?? new Set<string>();
      const tgtOcc = explicitByNode.get(backEdge.targetId) ?? new Set<string>();
      const curSrc = assignments.get(`${backEdge.id}:source`);
      const curTgt = assignments.get(`${backEdge.id}:target`);
      if (!backEdge.sourceAnchor && curSrc) srcOcc.delete(curSrc);
      if (!backEdge.targetAnchor && curTgt) tgtOcc.delete(curTgt);

      const sharedCandidates = [`${outwardSide}-top`, `${outwardSide}-bottom`, outwardSide] as const;
      const shared = sharedCandidates.find(h => !srcOcc.has(h) && !tgtOcc.has(h));
      if (!shared) {
        if (!backEdge.sourceAnchor && curSrc) srcOcc.add(curSrc);
        if (!backEdge.targetAnchor && curTgt) tgtOcc.add(curTgt);
        continue;
      }
      if (!backEdge.sourceAnchor) {
        srcOcc.add(shared); explicitByNode.set(backEdge.sourceId, srcOcc);
        assignments.set(`${backEdge.id}:source`, shared);
      }
      if (!backEdge.targetAnchor) {
        tgtOcc.add(shared); explicitByNode.set(backEdge.targetId, tgtOcc);
        assignments.set(`${backEdge.id}:target`, shared);
      }
    }
  }

  // ── N≥3 parallel pair side routing ───────────────────────────────────────
  const sideOcc = new Map<string, Set<string>>();
  const markSide = (nodeId: string, h: string) => {
    const s = sideOcc.get(nodeId) ?? new Set<string>();
    s.add(h); sideOcc.set(nodeId, s);
  };
  for (const e of edges) {
    const sh = assignments.get(`${e.id}:source`);
    const th = assignments.get(`${e.id}:target`);
    if (sh) markSide(e.sourceId, sh);
    if (th) markSide(e.isSelf ? e.sourceId : e.targetId, th);
  }

  const countSide = (nodeId: string, side: "left" | "right") => {
    const occ = sideOcc.get(nodeId) ?? new Set<string>();
    let n = 0;
    for (const h of occ) if (h === side || h.startsWith(`${side}-`)) n++;
    return n;
  };
  const pickSideHandle = (nodeId: string, side: "left" | "right"): string => {
    const cands = side === "left" ? (["left", "left-top", "left-bottom"] as const) : (["right", "right-top", "right-bottom"] as const);
    const occ = sideOcc.get(nodeId) ?? new Set<string>();
    return cands.find(h => !occ.has(h)) ?? cands[0]!;
  };

  const trioPairs = new Map<string, TransitionEdge[]>();
  for (const e of edges) {
    if (e.isSelf || e.parallelGroupSize < 3) continue;
    const key = `${e.sourceId}->${e.targetId}`;
    const list = trioPairs.get(key) ?? [];
    list.push(e); trioPairs.set(key, list);
  }
  for (const [, group] of trioPairs) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.parallelIndex - b.parallelIndex);
    const inner = sorted.slice(1, -1);
    let prevSide: "left" | "right" | null = null;
    for (const e of inner) {
      if (e.sourceAnchor || e.targetAnchor) continue;
      let side: "left" | "right";
      if (!prevSide) {
        const lTotal = countSide(e.sourceId, "left")  + countSide(e.targetId, "left");
        const rTotal = countSide(e.sourceId, "right") + countSide(e.targetId, "right");
        side = lTotal <= rTotal ? "left" : "right";
      } else {
        side = prevSide === "left" ? "right" : "left";
      }
      prevSide = side;
      const sh = pickSideHandle(e.sourceId, side);
      const th = pickSideHandle(e.targetId, side);
      const ps = assignments.get(`${e.id}:source`);
      const pt = assignments.get(`${e.id}:target`);
      if (ps) sideOcc.get(e.sourceId)?.delete(ps);
      if (pt) sideOcc.get(e.targetId)?.delete(pt);
      assignments.set(`${e.id}:source`, sh); assignments.set(`${e.id}:target`, th);
      markSide(e.sourceId, sh); markSide(e.targetId, th);
    }
  }

  // ── Obstacle-clearing for horizontal stubs ──────────────────────────────────
  // When a left/right-exit edge's horizontal stub passes through a non-endpoint
  // node, try same-side sub-handles first, then fall back to bottom/top whose
  // vertical stubs naturally avoid horizontal obstacles.
  {
    const allObstacles = Array.from(positions.values());
    for (const e of edges) {
      if (e.isSelf || e.sourceAnchor) continue;
      const srcPos = positions.get(e.sourceId);
      const tgtPos = positions.get(e.targetId);
      if (!srcPos || !tgtPos) continue;
      const curSrcHandle = assignments.get(`${e.id}:source`);
      if (!curSrcHandle) continue;
      const baseSide = curSrcHandle.startsWith("right") ? "right"
                     : curSrcHandle.startsWith("left")  ? "left"
                     : null;
      if (!baseSide) continue;
      const snx = baseSide === "right" ? 1 : -1;
      const tgtHandle = assignments.get(`${e.id}:target`);
      const srcPt = pointForHandle(srcPos, curSrcHandle);
      const tgtPt = pointForHandle(tgtPos, tgtHandle);
      if (!srcPt || !tgtPt) continue;
      const tnx = tgtHandle?.startsWith("right") ? 1 : tgtHandle?.startsWith("left") ? -1 : 0;
      const sStubX = srcPt.x + snx * ROUTE_STUB;
      const tStubX = tgtPt.x + tnx * ROUTE_STUB;
      let midX = (sStubX + tStubX) / 2;
      if (snx > 0) midX = Math.max(midX, sStubX); else midX = Math.min(midX, sStubX);
      if (tnx > 0) midX = Math.max(midX, tStubX); else if (tnx < 0) midX = Math.min(midX, tStubX);
      const edgeObstacles = allObstacles.filter(o => o.id !== e.sourceId && o.id !== e.targetId);
      if (!stubHitsObstacle(srcPt.x, midX, srcPt.y, edgeObstacles)) continue;
      const back = isBackEdge(e, positions, orientation);
      const oppSide = (baseSide === "right" ? "left" : "right") as "left" | "right";
      const srcOccupied = explicitByNode.get(e.sourceId) ?? new Set<string>();
      // Score all candidate exits: count how many key segments hit obstacles.
      // Horizontal exits check source stub + horizontal approach to target.
      // Vertical exits (top/bottom) check only the immediate stub segment.
      // Pick the candidate with the lowest score; prefer earlier candidates on ties.
      const allCandidates = back
        ? [`${baseSide}-top`, `${baseSide}-bottom`, oppSide, `${oppSide}-top`, `${oppSide}-bottom`, "bottom", "top"]
        : [`${baseSide}-top`, `${baseSide}-bottom`, "bottom", "top"];
      let bestH: string | null = null;
      let bestScore = Infinity;
      for (const h of allCandidates) {
        if (h === curSrcHandle || srcOccupied.has(h)) continue;
        const pt = pointForHandle(srcPos, h);
        if (!pt) continue;
        const isVertical = h === "bottom" || h === "top";
        let score = 0;
        if (isVertical) {
          const hSny = h === "top" ? -1 : 1;
          const stubEnd = pt.y + hSny * ROUTE_STUB;
          const x1 = pt.x - 8, x2 = pt.x + 8;
          const yLo = Math.min(pt.y, stubEnd), yHi = Math.max(pt.y, stubEnd);
          for (const o of edgeObstacles) {
            if (o.x + o.width < x1 || o.x > x2) continue;
            if (o.y + o.height < yLo || o.y > yHi) continue;
            score++;
          }
        } else {
          const hSnx = h.startsWith("right") ? 1 : -1;
          const hStubX = pt.x + hSnx * ROUTE_STUB;
          const checkMidX = hSnx > 0
            ? Math.max((hStubX + tStubX) / 2, hStubX)
            : Math.min((hStubX + tStubX) / 2, hStubX);
          if (stubHitsObstacle(pt.x, checkMidX, pt.y, edgeObstacles)) score++;
          if (stubHitsObstacle(checkMidX, tStubX, tgtPt.y, edgeObstacles)) score++;
        }
        if (score < bestScore) { bestScore = score; bestH = h; }
        if (bestScore === 0) break;
      }
      if (bestH) assignments.set(`${e.id}:source`, bestH);
    }
  }

  return assignments;
}

function stubHitsObstacle(
  x1: number, x2: number, y: number,
  obstacles: NodePosition[], pad = 8,
): boolean {
  const loX = Math.min(x1, x2), hiX = Math.max(x1, x2);
  for (const o of obstacles) {
    if (hiX <= o.x - pad || loX >= o.x + o.width + pad) continue;
    if (y <= o.y - pad || y >= o.y + o.height + pad) continue;
    return true;
  }
  return false;
}

// ── Parallel offsets ──────────────────────────────────────────────────────────

function computeParallelOffsets(
  edges: TransitionEdge[],
  positions: Map<string, NodePosition>,
  handles: Map<string, string>,
): Map<string, number> {
  const offsets = new Map<string, number>();

  // Base parallel group offsets
  const pairGroups = new Map<string, string[]>();
  for (const e of edges) {
    const key = `${e.sourceId}->${e.targetId}`;
    const g = pairGroups.get(key) ?? [];
    g.push(e.id);
    pairGroups.set(key, g);
  }
  for (const [, group] of pairGroups) {
    if (group.length <= 1) continue;
    const n = group.length;
    for (let i = 0; i < n; i++) {
      const idx = n - 1 - i;
      offsets.set(group[i]!, (idx - (n - 1) / 2) * PARALLEL_STEP);
    }
  }

  // Fan-out offset for edges from same source to different targets on same Y row
  const fanGroups = new Map<string, { srcId: string; tgtId: string; tgtX: number; srcX: number; slotSize: number }[]>();
  for (const e of edges) {
    const tp = positions.get(e.targetId), sp = positions.get(e.sourceId);
    if (!tp || !sp) continue;
    const rowY = Math.round(tp.y);
    const key = `${e.sourceId}|row${rowY}`;
    const arr = fanGroups.get(key) ?? [];
    if (!arr.some(t => t.tgtId === e.targetId)) {
      const slotSize = pairGroups.get(`${e.sourceId}->${e.targetId}`)?.length ?? 1;
      arr.push({ srcId: e.sourceId, tgtId: e.targetId, tgtX: tp.x + tp.width / 2, srcX: sp.x + sp.width / 2, slotSize });
    }
    fanGroups.set(key, arr);
  }
  const pairFanOffsets = new Map<string, number>();
  for (const group of fanGroups.values()) {
    if (group.length <= 1) continue;
    const maxSlot = Math.max(...group.map(s => s.slotSize));
    const fanStep = maxSlot * PARALLEL_STEP;
    const left  = group.filter(e => e.tgtX < e.srcX).sort((a, b) => a.tgtX - b.tgtX);
    const right = group.filter(e => e.tgtX >= e.srcX).sort((a, b) => b.tgtX - a.tgtX);
    const sorted = [...left, ...right];
    for (let i = 0; i < sorted.length; i++) {
      pairFanOffsets.set(`${sorted[i]!.srcId}→${sorted[i]!.tgtId}`, (i - (sorted.length - 1) / 2) * fanStep);
    }
  }
  for (const e of edges) {
    const fo = pairFanOffsets.get(`${e.sourceId}→${e.targetId}`);
    if (fo !== undefined) offsets.set(e.id, (offsets.get(e.id) ?? 0) + fo);
  }

  // Bidirectional same-level: ensure right edge bends below, left above
  const edgeByPair = new Map<string, TransitionEdge>();
  for (const e of edges) { if (!e.isSelf) edgeByPair.set(`${e.sourceId}->${e.targetId}`, e); }
  for (const e of edges) {
    if (e.isSelf) continue;
    const rev = edgeByPair.get(`${e.targetId}->${e.sourceId}`);
    if (!rev || e.id >= rev.id) continue;
    const sp = positions.get(e.sourceId), tp = positions.get(e.targetId);
    if (!sp || !tp || Math.abs(sp.y - tp.y) >= sp.height * 0.75) continue;
    const sCX = sp.x + sp.width / 2, tCX = tp.x + tp.width / 2;
    const [rightEdge, leftEdge] = sCX <= tCX ? [e, rev] : [rev, e];
    const assignBiDirHandles = (edgeId: string, role: "source" | "target", nodeId: string, side: "top" | "bottom", oppId: string) => {
      const np = positions.get(nodeId), op = positions.get(oppId);
      const nCX2 = np ? np.x + np.width / 2 : 0, oCX2 = op ? op.x + op.width / 2 : 0;
      const closer  = oCX2 < nCX2 ? `${side}-left`  : `${side}-right`;
      const farther = oCX2 < nCX2 ? `${side}-right` : `${side}-left`;
      const cur = handles.get(`${edgeId}:${role}`);
      if (!cur) return;
      const occ = new Set<string>();
      const result = [closer, farther, side].find(c => !occ.has(c)) ?? side;
      handles.set(`${edgeId}:${role}`, result);
    };
    void assignBiDirHandles;
    // For same-level pairs the bidirectional code above already assigned correct handles.
    // Just ensure their parallel offsets push them apart in the right direction.
    void rightEdge; void leftEdge;
  }

  return offsets;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compute orthogonal edge paths for all edges using the same routing algorithm
 * as the workflow editor canvas.
 */
export function routeEdges(
  edges: TransitionEdge[],
  positions: Map<string, NodePosition>,
  orientation: "vertical" | "horizontal" = "vertical",
  terminalIds: Set<string> = new Set(),
): Map<string, EdgePathResult> {
  const handles = computeHandles(edges, positions, orientation, terminalIds);
  const parallelOffsets = computeParallelOffsets(edges, positions, handles);

  const allObstacles = Array.from(positions.values());

  const result = new Map<string, EdgePathResult>();
  for (const e of edges) {
    const srcHandle = handles.get(`${e.id}:source`);
    const tgtHandle = handles.get(`${e.id}:target`);
    const srcPos = positions.get(e.sourceId);
    const tgtPos = positions.get(e.targetId);
    if (!srcPos || !tgtPos) continue;

    const srcPt = pointForHandle(srcPos, srcHandle);
    const tgtPt = pointForHandle(tgtPos, tgtHandle);
    if (!srcPt || !tgtPt) continue;

    const obstacles = allObstacles.filter(o => o.id !== e.sourceId && o.id !== e.targetId);

    const { path, labelX, labelY } = computeOrthogonalPath(
      srcPt.x, srcPt.y, tgtPt.x, tgtPt.y,
      positionForHandle(srcHandle), positionForHandle(tgtHandle),
      srcPos, tgtPos,
      parallelOffsets.get(e.id) ?? 0,
      obstacles,
    );

    result.set(e.id, { d: path, labelX, labelY });
  }

  return result;
}
