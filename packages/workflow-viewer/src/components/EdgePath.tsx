import type { TransitionEdge } from "@cyoda/workflow-graph";
import { laneColor, laneDashArray } from "../theme/lane.js";
import { geometry, workflowPalette } from "../theme/tokens.js";
import type { EdgeRoute, NodePosition } from "../layout.js";

interface Props {
  edge: TransitionEdge;
  source: NodePosition;
  target: NodePosition;
  /** Pre-computed polyline from the layout engine (ELK). Overrides center-to-center heuristic. */
  route?: EdgeRoute;
  targetIsTerminal: boolean;
  highlighted: boolean;
  dimmed: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
}

export interface EdgeGeometry {
  d: string;
  midX: number;
  midY: number;
}

/**
 * Convert a polyline to an SVG path `d` string.
 */
export function polylineToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M ${first!.x} ${first!.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

/**
 * Compute an orthogonal path between two node positions.
 *
 * Forward edges (source above target): Z-shape — exits bottom-centre,
 * turns at the midpoint Y, arrives top-centre. Clean horizontal crossing
 * segment replaces the old diagonal bezier.
 *
 * Back-edges / same-level (source below or beside target): wrap around the
 * side that keeps the arc away from the main flow.
 *
 * Self-loops: right-side rectangular arc.
 *
 * Parallel edges are spread by offsetting the mid-segment laterally.
 */
export function computeEdgeGeometry(
  edge: TransitionEdge,
  source: NodePosition,
  target: NodePosition,
): EdgeGeometry {
  const STUB = 16;
  const SIDE_MARGIN = 32;

  // Self-loop: rectangular arc on the right side.
  if (edge.isSelf) {
    const rightX = source.x + source.width;
    const topY = source.y + source.height / 3;
    const bottomY = source.y + (source.height * 2) / 3;
    const loopX = rightX + SIDE_MARGIN;
    const d = `M ${rightX} ${topY} L ${loopX} ${topY} L ${loopX} ${bottomY} L ${rightX} ${bottomY}`;
    return { d, midX: loopX, midY: (topY + bottomY) / 2 };
  }

  const sx = source.x + source.width / 2;
  const sy = source.y + source.height;
  const tx = target.x + target.width / 2;
  const ty = target.y;

  // Parallel offset — stagger mid-segment so overlapping edges spread out.
  const offsetStep = 20;
  const half = Math.floor(edge.parallelGroupSize / 2);
  const parallelOffset = (edge.parallelIndex - half) * offsetStep;

  const srcCX = source.x + source.width / 2;
  const tgtCX = target.x + target.width / 2;
  const isBackEdge = source.y >= target.y - source.height / 2;

  if (isBackEdge) {
    // Back-edge: wrap around the side determined by relative X position.
    const wrapLeft = srcCX <= tgtCX;
    if (wrapLeft) {
      const loopX = Math.min(source.x, target.x) - SIDE_MARGIN - Math.abs(parallelOffset);
      const d = `M ${sx} ${sy} L ${sx} ${sy + STUB} L ${loopX} ${sy + STUB} L ${loopX} ${ty - STUB} L ${tx} ${ty - STUB} L ${tx} ${ty}`;
      return { d, midX: loopX, midY: (sy + ty) / 2 };
    } else {
      const loopX = Math.max(source.x + source.width, target.x + target.width) + SIDE_MARGIN + Math.abs(parallelOffset);
      const d = `M ${sx} ${sy} L ${sx} ${sy + STUB} L ${loopX} ${sy + STUB} L ${loopX} ${ty - STUB} L ${tx} ${ty - STUB} L ${tx} ${ty}`;
      return { d, midX: loopX, midY: (sy + ty) / 2 };
    }
  }

  // Forward edge: Z-shape with horizontal mid-segment.
  const midY = (sy + ty) / 2 + parallelOffset;
  const d = `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
  return { d, midX: (sx + tx) / 2, midY };
}

export function EdgePath({
  edge,
  source,
  target,
  route,
  targetIsTerminal,
  highlighted,
  dimmed,
  selected,
  onSelect,
  onHoverEnter,
  onHoverLeave,
}: Props) {
  const color = laneColor(edge, { targetIsTerminal });
  const dash = laneDashArray(edge);
  const d =
    route && route.points.length >= 2
      ? polylineToPath(route.points)
      : computeEdgeGeometry(edge, source, target).d;

  const strokeWidth =
    selected || highlighted
      ? geometry.edge.strokeWidth + 0.8
      : edge.isLoopback
        ? geometry.edge.loopStrokeWidth
        : geometry.edge.strokeWidth;
  const opacity = dimmed ? 0.25 : 1;

  return (
    <g
      opacity={opacity}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(edge.id);
      }}
      onMouseEnter={() => onHoverEnter(edge.id)}
      onMouseLeave={onHoverLeave}
      style={{ cursor: "pointer" }}
      data-testid={`edge-${edge.id}`}
    >
      {/* Transparent fat stroke to widen the hit-area. */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        markerEnd={`url(#wf-arrow-${colorKey(color)})`}
      />
    </g>
  );
}

/**
 * Lane colours keyed so we can reuse one marker per lane. Must be a valid
 * fragment identifier.
 */
export function colorKey(color: string): string {
  return color.replace("#", "").toLowerCase();
}

/**
 * The set of lane colours we need arrowhead markers for. Emitted once per
 * SVG instance from `WorkflowViewer`.
 */
export const laneColorSet: string[] = Object.values(workflowPalette.edge);
