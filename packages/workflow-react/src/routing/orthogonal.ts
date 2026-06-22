import { Position } from "reactflow";

export type Anchor = "top" | "right" | "bottom" | "left";

export interface Rect {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrthogonalEdgeInput {
  /** Absolute coordinate of the source attach point (already anchor-resolved by RF). */
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  sourceRect?: Rect;
  targetRect?: Rect;
  /** Pre-computed polyline from the layout engine — if present, used verbatim. */
  routePoints?: { x: number; y: number }[];
  /** Other nodes' bounding boxes; the router may nudge past these. */
  obstacles?: Rect[];
  /** IDs of the source/target nodes (so obstacles can exclude self). Not used directly here — caller filters. */
  /** Snap distance for straight-segment detection. */
  alignmentTolerance?: number;
  /** Stub length extending the edge along its anchor normal before turning. */
  stubLength?: number;
  /**
   * Lateral offset for parallel edges sharing the same source/target pair.
   * Positive shifts the mid-segment right (vertical paths) or down (horizontal paths).
   */
  parallelOffset?: number;
  /**
   * When set, overrides the computed mid-segment position.
   * For bottom/top-exit edges (horizontal mid-segment) this is the Y of that segment.
   * For left/right-exit edges (vertical mid-segment) this is the X of that segment.
   * Clamping and obstacle nudging are bypassed when forcedMid is present.
   */
  forcedMid?: number;
}

export interface OrthogonalEdge {
  /** SVG path `d` string. */
  path: string;
  /** Label placement midpoint. */
  labelX: number;
  labelY: number;
  /** Raw polyline points (for debugging / further processing). */
  points: { x: number; y: number }[];
}

const DEFAULT_TOLERANCE = 6;
const DEFAULT_STUB = 48;

/**
 * Compute an orthogonal (polyline) edge path between two anchor points.
 *
 * Preference order:
 *   1. If `routePoints` is provided (ELK output), use it verbatim.
 *   2. If anchors are facing each other and nearly aligned, emit a straight
 *      segment (snap away tiny doglegs).
 *   3. Otherwise emit a 3-segment "Z"/"L" path that exits along the source
 *      anchor's normal and enters along the target anchor's normal.
 *   4. Single mid-segment nudge if the middle of the primary leg passes
 *      through a non-endpoint node.
 */
export function orthogonalEdgePath(input: OrthogonalEdgeInput): OrthogonalEdge {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceRect,
    targetRect,
    routePoints,
    obstacles = [],
    alignmentTolerance = DEFAULT_TOLERANCE,
    stubLength = DEFAULT_STUB,
    parallelOffset = 0,
    forcedMid,
  } = input;

  if (routePoints && routePoints.length >= 2) {
    const mid = midpoint(routePoints);
    return {
      path: polylineToPath(routePoints),
      labelX: mid.x,
      labelY: mid.y,
      points: routePoints,
    };
  }

  const sx = sourceX;
  const sy = sourceY;
  const tx = targetX;
  const ty = targetY;

  if (sourceRect && targetRect && sourceRect.id === targetRect.id) {
    const loop = selfLoopPath({
      sx,
      sy,
      tx,
      ty,
      sourcePosition,
      targetPosition,
      sourceRect,
      stubLength,
    });
    return {
      path: polylineToPath(loop.points),
      labelX: loop.labelX,
      labelY: loop.labelY,
      points: loop.points,
    };
  }

  const sourceNormal = normalOf(sourcePosition);
  const targetNormal = normalOf(targetPosition);

  // Straight-line shortcut: if the two anchors face each other AND are
  // nearly colinear on the non-normal axis, emit one straight segment.
  // Skip shortcut for offset parallel edges — they need a Z-path to diverge.
  const straight = parallelOffset === 0
    ? tryStraight({ x: sx, y: sy }, sourceNormal, { x: tx, y: ty }, targetNormal, alignmentTolerance)
    : null;
  if (straight) {
    return {
      path: polylineToPath(straight),
      labelX: (sx + tx) / 2,
      labelY: (sy + ty) / 2,
      points: straight,
    };
  }

  // Emit stubs, then route orthogonally between them.
  const sStub = { x: sx + sourceNormal.x * stubLength, y: sy + sourceNormal.y * stubLength };
  const tStub = { x: tx + targetNormal.x * stubLength, y: ty + targetNormal.y * stubLength };

  // Z-shape: decide which axis the middle segment runs on.
  // Rule: if the source normal is vertical (top/bottom), the mid is
  // horizontal at the midpoint Y of the two stubs; otherwise vice versa.
  const sourceAxis = sourceNormal.x !== 0 ? "horizontal" : "vertical";
  let path: { x: number; y: number }[];

  if (sourceAxis === "vertical") {
    // mid segment is horizontal; parallelOffset shifts it up/down
    let midY = forcedMid ?? ((sStub.y + tStub.y) / 2 + parallelOffset);
    if (forcedMid === undefined) {
      // Clamp so the first and last segments always exit/enter along the handle normal.
      if (sourceNormal.y > 0) midY = Math.max(midY, sStub.y);
      else if (sourceNormal.y < 0) midY = Math.min(midY, sStub.y);
      if (targetNormal.y > 0) midY = Math.max(midY, tStub.y);
      else if (targetNormal.y < 0) midY = Math.min(midY, tStub.y);
    }
    // When facing normals conflict (e.g. bottom→top with insufficient space), the
    // target clamp re-violates the source constraint. Fall back to a staircase path
    // that routes through both explicit stubs so the source always exits correctly.
    const srcViolatedY =
      (sourceNormal.y > 0 && midY < sStub.y) ||
      (sourceNormal.y < 0 && midY > sStub.y);
    if (srcViolatedY) {
      const midX = (sStub.x + tStub.x) / 2 + parallelOffset;
      path = [
        { x: sx, y: sy },
        { x: sStub.x, y: sStub.y },
        { x: midX, y: sStub.y },
        { x: midX, y: tStub.y },
        { x: tStub.x, y: tStub.y },
        { x: tx, y: ty },
      ];
    } else {
      if (forcedMid === undefined) midY = nudgeHorizontalLine(sStub.x, tStub.x, midY, obstacles);
      path = [
        { x: sx, y: sy },
        { x: sStub.x, y: midY },
        { x: tStub.x, y: midY },
        // Route through the target stub so the last segment stays orthogonal
        // when source and target normals are on different axes (e.g. bottom→left).
        // simplify() collapses this to the original 4-point path when co-linear.
        { x: tStub.x, y: tStub.y },
        { x: tx, y: ty },
      ];
    }
  } else {
    // mid segment is vertical; parallelOffset shifts it left/right
    let midX = forcedMid ?? ((sStub.x + tStub.x) / 2 + parallelOffset);
    if (forcedMid === undefined) {
      // Clamp so the first and last segments always exit/enter along the handle normal.
      if (sourceNormal.x > 0) midX = Math.max(midX, sStub.x);
      else if (sourceNormal.x < 0) midX = Math.min(midX, sStub.x);
      if (targetNormal.x > 0) midX = Math.max(midX, tStub.x);
      else if (targetNormal.x < 0) midX = Math.min(midX, tStub.x);
    }
    // When facing normals conflict (e.g. left→right with insufficient space), the
    // target clamp re-violates the source constraint. Fall back to a staircase path.
    const srcViolatedX =
      (sourceNormal.x > 0 && midX < sStub.x) ||
      (sourceNormal.x < 0 && midX > sStub.x);
    if (srcViolatedX) {
      const midY = (sStub.y + tStub.y) / 2 + parallelOffset;
      path = [
        { x: sx, y: sy },
        { x: sStub.x, y: sStub.y },
        { x: sStub.x, y: midY },
        { x: tStub.x, y: midY },
        { x: tStub.x, y: tStub.y },
        { x: tx, y: ty },
      ];
    } else {
      if (forcedMid === undefined) midX = nudgeVerticalLine(sStub.y, tStub.y, midX, obstacles);
      path = [
        { x: sx, y: sy },
        { x: midX, y: sStub.y },
        { x: midX, y: tStub.y },
        // Route through the target stub so the last segment stays orthogonal
        // when source and target normals are on different axes (e.g. right→top).
        // simplify() collapses this to the original 4-point path when co-linear.
        { x: tStub.x, y: tStub.y },
        { x: tx, y: ty },
      ];
    }
  }

  path = simplify(path);

  const mid = midpoint(path);
  return {
    path: polylineToPath(path),
    labelX: mid.x,
    labelY: mid.y,
    points: path,
  };
}

export function polylineToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x} ${first!.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

function normalOf(pos: Position): { x: number; y: number } {
  switch (pos) {
    case Position.Top:
      return { x: 0, y: -1 };
    case Position.Right:
      return { x: 1, y: 0 };
    case Position.Bottom:
      return { x: 0, y: 1 };
    case Position.Left:
      return { x: -1, y: 0 };
  }
}

function tryStraight(
  s: { x: number; y: number },
  sn: { x: number; y: number },
  t: { x: number; y: number },
  tn: { x: number; y: number },
  tolerance: number,
): { x: number; y: number }[] | null {
  // Only valid when normals are opposite (e.g. source Bottom -> target Top).
  if (sn.x + tn.x !== 0 || sn.y + tn.y !== 0) return null;

  if (sn.x !== 0) {
    // Horizontal: both points must share nearly the same Y, and X must go
    // in the source-normal direction.
    if (Math.abs(s.y - t.y) > tolerance) return null;
    if (sn.x > 0 && t.x < s.x) return null;
    if (sn.x < 0 && t.x > s.x) return null;
    // Snap Y to source for a perfectly level line.
    return [
      { x: s.x, y: s.y },
      { x: t.x, y: s.y },
    ];
  }
  // Vertical
  if (Math.abs(s.x - t.x) > tolerance) return null;
  if (sn.y > 0 && t.y < s.y) return null;
  if (sn.y < 0 && t.y > s.y) return null;
  return [
    { x: s.x, y: s.y },
    { x: s.x, y: t.y },
  ];
}

function selfLoopPath(input: {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePosition: Position;
  targetPosition: Position;
  sourceRect: Rect;
  stubLength: number;
}): {
  points: { x: number; y: number }[];
  labelX: number;
  labelY: number;
} {
  const {
    sx,
    sy,
    tx,
    ty,
    sourcePosition,
    targetPosition,
    sourceRect,
    stubLength,
  } = input;
  const loopInset = stubLength + 12;
  const cornerInset = stubLength + 44;

  if (sourcePosition === Position.Right && targetPosition === Position.Top) {
    // top-right corner
    const loopX = sourceRect.x + sourceRect.width + cornerInset;
    const loopY = sourceRect.y - cornerInset;
    return {
      points: [
        { x: sx, y: sy },
        { x: loopX, y: sy },
        { x: loopX, y: loopY },
        { x: tx, y: loopY },
        { x: tx, y: ty },
      ],
      labelX: loopX,
      labelY: (sy + loopY) / 2,
    };
  }

  if (sourcePosition === Position.Left && targetPosition === Position.Top) {
    // top-left corner
    const loopX = sourceRect.x - cornerInset;
    const loopY = sourceRect.y - cornerInset;
    return {
      points: [
        { x: sx, y: sy },
        { x: loopX, y: sy },
        { x: loopX, y: loopY },
        { x: tx, y: loopY },
        { x: tx, y: ty },
      ],
      labelX: loopX,
      labelY: (sy + loopY) / 2,
    };
  }

  if (sourcePosition === Position.Bottom && targetPosition === Position.Right) {
    // bottom-right corner
    const loopX = sourceRect.x + sourceRect.width + cornerInset;
    const loopY = sourceRect.y + sourceRect.height + cornerInset;
    return {
      points: [
        { x: sx, y: sy },
        { x: sx, y: loopY },
        { x: loopX, y: loopY },
        { x: loopX, y: ty },
        { x: tx, y: ty },
      ],
      labelX: loopX,
      labelY: (loopY + ty) / 2,
    };
  }

  if (sourcePosition === Position.Bottom && targetPosition === Position.Left) {
    // bottom-left corner
    const loopX = sourceRect.x - cornerInset;
    const loopY = sourceRect.y + sourceRect.height + cornerInset;
    return {
      points: [
        { x: sx, y: sy },
        { x: sx, y: loopY },
        { x: loopX, y: loopY },
        { x: loopX, y: ty },
        { x: tx, y: ty },
      ],
      labelX: loopX,
      labelY: (loopY + ty) / 2,
    };
  }

  if (
    sourcePosition === Position.Bottom &&
    targetPosition === Position.Top
  ) {
    const loopX = sourceRect.x + sourceRect.width + loopInset;
    const loopY = sourceRect.y + sourceRect.height + loopInset;
    return {
      points: [
        { x: sx, y: sy },
        { x: sx, y: loopY },
        { x: loopX, y: loopY },
        { x: loopX, y: ty - loopInset },
        { x: tx, y: ty - loopInset },
        { x: tx, y: ty },
      ],
      labelX: loopX,
      labelY: loopY,
    };
  }

  if (
    sourcePosition === Position.Right &&
    targetPosition === Position.Left
  ) {
    const loopX = sourceRect.x + sourceRect.width + loopInset;
    const loopY = sourceRect.y + sourceRect.height + loopInset;
    return {
      points: [
        { x: sx, y: sy },
        { x: loopX, y: sy },
        { x: loopX, y: loopY },
        { x: tx - loopInset, y: loopY },
        { x: tx - loopInset, y: ty },
        { x: tx, y: ty },
      ],
      labelX: loopX,
      labelY: loopY,
    };
  }

  return {
    points: [
      { x: sx, y: sy },
      { x: sx + loopInset, y: sy },
      { x: tx + loopInset, y: ty },
      { x: tx, y: ty },
    ],
    labelX: (sx + tx) / 2 + loopInset,
    labelY: (sy + ty) / 2,
  };
}

function nudgeHorizontalLine(
  x1: number,
  x2: number,
  y: number,
  obstacles: Rect[],
): number {
  const pad = 8;
  const loX = Math.min(x1, x2);
  const hiX = Math.max(x1, x2);
  for (const o of obstacles) {
    const ox1 = o.x - pad;
    const oy1 = o.y - pad;
    const ox2 = o.x + o.width + pad;
    const oy2 = o.y + o.height + pad;
    // Does the horizontal segment at Y cross this obstacle's X-range and Y-range?
    if (hiX < ox1 || loX > ox2) continue;
    if (y < oy1 || y > oy2) continue;
    // Nudge: shift Y outside the obstacle's Y-range on whichever side is closer.
    const above = oy1 - 1;
    const below = oy2 + 1;
    y = Math.abs(y - above) < Math.abs(y - below) ? above : below;
  }
  return y;
}

function nudgeVerticalLine(
  y1: number,
  y2: number,
  x: number,
  obstacles: Rect[],
): number {
  const pad = 8;
  const loY = Math.min(y1, y2);
  const hiY = Math.max(y1, y2);
  for (const o of obstacles) {
    const ox1 = o.x - pad;
    const oy1 = o.y - pad;
    const ox2 = o.x + o.width + pad;
    const oy2 = o.y + o.height + pad;
    if (hiY < oy1 || loY > oy2) continue;
    if (x < ox1 || x > ox2) continue;
    const left = ox1 - 1;
    const right = ox2 + 1;
    x = Math.abs(x - left) < Math.abs(x - right) ? left : right;
  }
  return x;
}

/** Drop consecutive duplicate points and collapse co-linear runs. */
function simplify(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  // collapse co-linear triples
  let i = 1;
  while (i < out.length - 1) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const colinearX = a.x === b.x && b.x === c.x;
    const colinearY = a.y === b.y && b.y === c.y;
    if (colinearX || colinearY) {
      out.splice(i, 1);
    } else {
      i++;
    }
  }
  return out;
}

function midpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  // Find the longest segment and return its centre — best label anchor.
  let bestLen = -1;
  let best = points[0]!;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best;
}
