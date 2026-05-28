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
 * Compute a simple orthogonal-ish path between two node centres. Self-loops
 * are rendered as a right-side arc; parallel siblings are offset laterally
 * based on parallelIndex to avoid overlap.
 */
export function computeEdgeGeometry(
  edge: TransitionEdge,
  source: NodePosition,
  target: NodePosition,
): EdgeGeometry {
  // Default ports: source exits from bottom-centre, target enters at top-centre.
  // simpleLayout always produces top-down BFS layers so this avoids the arrowhead
  // landing under the target node (which happens when both ends are at node centre).
  const sx = source.x + source.width / 2;
  const sy = source.y + source.height;
  const tx = target.x + target.width / 2;
  const ty = target.y;

  if (edge.isSelf) {
    const rightX = source.x + source.width;
    const topY = source.y + source.height / 3;
    const bottomY = source.y + (source.height * 2) / 3;
    const loopX = rightX + 28;
    const d = `M ${rightX} ${topY} C ${loopX} ${topY}, ${loopX} ${bottomY}, ${rightX} ${bottomY}`;
    return { d, midX: loopX, midY: (topY + bottomY) / 2 };
  }

  // Lateral offset for parallel edges: stagger by parallelIndex around the
  // midpoint. 0 → centred, 1 → +offset, 2 → -offset, etc.
  const offsetStep = 18;
  const half = Math.floor(edge.parallelGroupSize / 2);
  const signed = edge.parallelIndex - half;
  const offset = signed * offsetStep;

  const mx = (sx + tx) / 2 + offset;
  const my = (sy + ty) / 2;

  // Simple cubic curve so parallel siblings don't overlap.
  const d = `M ${sx} ${sy} Q ${mx} ${my}, ${tx} ${ty}`;
  return { d, midX: mx, midY: my };
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
