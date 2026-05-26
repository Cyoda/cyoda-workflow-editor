import { memo, useContext } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type Position,
  type EdgeProps,
} from "reactflow";
import type { TransitionEdge } from "@cyoda/workflow-graph";
import {
  badgesFor,
  geometry,
  laneColor,
  laneDashArray,
  typography,
  workflowPalette,
} from "@cyoda/workflow-viewer/theme";
import { orthogonalEdgePath, type Rect } from "../routing/orthogonal.js";
import { arrowMarkerId } from "./ArrowMarkers.js";
import { HoverContext } from "./HoverContext.js";

export interface RfEdgeData {
  edge: TransitionEdge;
  targetIsTerminal: boolean;
  /**
   * Legacy/read-only layout geometry. The interactive React Flow canvas must
   * not render from this data because it can lag behind live node positions
   * during and immediately after drag gestures.
   */
  routePoints?: { x: number; y: number }[];
  /** Legacy layout-computed label centre and size. */
  labelX?: number;
  labelY?: number;
  labelWidth?: number;
  labelHeight?: number;
  /** Other nodes' bounding boxes, for obstacle-aware nudging. */
  obstacles?: Rect[];
  /** Live endpoint coordinates derived from the controlled React Flow nodes. */
  liveSource?: { x: number; y: number };
  liveTarget?: { x: number; y: number };
  liveSourcePosition?: Position;
  liveTargetPosition?: Position;
  liveSourceRect?: Rect;
  liveTargetRect?: Rect;
  /** Lateral mid-segment offset when multiple edges share the same source/target pair. */
  parallelOffset?: number;
}

function RfTransitionEdgeImpl(props: EdgeProps<RfEdgeData>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  } = props;
  if (!data) return null;
  const { highlightSet } = useContext(HoverContext);
  const dimmed = highlightSet !== null && !highlightSet.has(id);
  const { edge, targetIsTerminal, obstacles, parallelOffset } = data;
  const resolvedSourceX = data.liveSource?.x ?? sourceX;
  const resolvedSourceY = data.liveSource?.y ?? sourceY;
  const resolvedTargetX = data.liveTarget?.x ?? targetX;
  const resolvedTargetY = data.liveTarget?.y ?? targetY;

  const { path, labelX, labelY } = orthogonalEdgePath({
    sourceX: resolvedSourceX,
    sourceY: resolvedSourceY,
    targetX: resolvedTargetX,
    targetY: resolvedTargetY,
    sourcePosition: data.liveSourcePosition ?? sourcePosition,
    targetPosition: data.liveTargetPosition ?? targetPosition,
    sourceRect: data.liveSourceRect,
    targetRect: data.liveTargetRect,
    obstacles,
    parallelOffset,
  });

  const color = laneColor(edge, { targetIsTerminal });
  const dash = laneDashArray(edge);
  const strokeWidth = selected
    ? geometry.edge.strokeWidth + 1
    : edge.isLoopback
      ? geometry.edge.loopStrokeWidth
      : geometry.edge.strokeWidth;

  const badges = badgesFor(edge.summary, {
    manual: edge.manual,
    disabled: edge.disabled,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth,
          strokeDasharray: dash,
          opacity: dimmed ? 0.15 : 1,
          transition: "opacity 0.15s ease",
        }}
        markerEnd={`url(#${arrowMarkerId(color)})`}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            opacity: dimmed ? 0.15 : 1,
            transition: "opacity 0.15s ease",
            fontFamily: typography.fontFamily,
            pointerEvents: "all",
            background: workflowPalette.edgeLabel.fill,
            border: `1px solid ${workflowPalette.edgeLabel.border}`,
            borderRadius: geometry.labelPill.radius,
            padding: `${geometry.labelPill.paddingY}px ${geometry.labelPill.paddingX}px`,
            boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            minWidth: 40,
            width: data.labelWidth,
          }}
          className="nodrag nopan"
          data-testid={`rf-edge-label-${edge.id}`}
          title={edge.summary.full !== edge.summary.display ? edge.summary.full : undefined}
        >
          <div
            style={{
              color: workflowPalette.edgeLabel.text,
              fontSize: typography.edgeLabel.size,
              fontWeight: typography.edgeLabel.weight,
              letterSpacing: typography.edgeLabel.tracking,
              textTransform: "uppercase",
            }}
          >
            {edge.summary.display}
          </div>
          {badges.length > 0 && (
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
              {badges.map((b, i) => {
                const slot =
                  b.key === "manual"
                    ? workflowPalette.badge.manual
                    : b.key === "processor" || b.key === "execution"
                      ? workflowPalette.badge.processor
                      : b.key === "criterion"
                        ? workflowPalette.badge.criterion
                        : workflowPalette.badge.disabled;
                return (
                  <span
                    key={`${b.key}-${i}`}
                    style={{
                      background: slot.fill,
                      border: `1px solid ${slot.border}`,
                      color: workflowPalette.badge.text,
                      fontSize: typography.badge.size,
                      fontWeight: typography.badge.weight,
                      letterSpacing: typography.badge.tracking,
                      padding: "1px 4px",
                      borderRadius: 8,
                    }}
                  >
                    {b.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const RfTransitionEdge = memo(RfTransitionEdgeImpl);
