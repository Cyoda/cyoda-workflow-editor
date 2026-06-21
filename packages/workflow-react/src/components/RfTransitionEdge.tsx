import { memo, useContext, useState, useRef } from "react";
import {
  BaseEdge,
  type Position,
  type EdgeProps,
  useReactFlow,
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
import type { Rect } from "../routing/orthogonal.js";
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
  /** Pre-computed offsets applied to the label to resolve overlaps (slide along the segment). */
  labelXOffset?: number;
  labelYOffset?: number;
  /** Stored flow-coordinate position for the label pill / edge midpoint. Overrides the geometric midpoint when set. */
  transitionPosition?: { x: number; y: number };
  /** Fires on drag end with the transition UUID and new flow-coordinate centre of the label pill. */
  onLabelDragEnd?: (transitionId: string, x: number, y: number) => void;
}

const BLOCK_W = 160;
const BLOCK_H = 64;

function RfTransitionEdgeImpl(props: EdgeProps<RfEdgeData>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
    selected,
  } = props;
  if (!data) return null;
  const { highlightSet } = useContext(HoverContext);
  const rf = useReactFlow();
  const dimmed = highlightSet !== null && !highlightSet.has(id);
  const { edge, targetIsTerminal } = data;

  const resolvedSourceX = data.liveSource?.x ?? sourceX;
  const resolvedSourceY = data.liveSource?.y ?? sourceY;
  const resolvedTargetX = data.liveTarget?.x ?? targetX;
  const resolvedTargetY = data.liveTarget?.y ?? targetY;

  // Drag state
  const [localMidpoint, setLocalMidpoint] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Effective midpoint: live drag > stored > geometric centre
  const mx = localMidpoint?.x
    ?? data.transitionPosition?.x
    ?? (resolvedSourceX + resolvedTargetX) / 2;
  const my = localMidpoint?.y
    ?? data.transitionPosition?.y
    ?? (resolvedSourceY + resolvedTargetY) / 2;

  // Two-segment path through the midpoint — block and path share the same point
  const svgPath = `M ${resolvedSourceX},${resolvedSourceY} L ${mx},${my} L ${resolvedTargetX},${resolvedTargetY}`;

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

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!data.onLabelDragEnd) return;
    e.stopPropagation();
    e.preventDefault();
    const { x: vpX, y: vpY, zoom } = rf.getViewport();
    const ptrX = (e.clientX - vpX) / zoom;
    const ptrY = (e.clientY - vpY) / zoom;
    dragOffsetRef.current = { x: ptrX - mx, y: ptrY - my };
    isDraggingRef.current = true;
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    const { x: vpX, y: vpY, zoom } = rf.getViewport();
    setLocalMidpoint({
      x: (e.clientX - vpX) / zoom - dragOffsetRef.current.x,
      y: (e.clientY - vpY) / zoom - dragOffsetRef.current.y,
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    isDraggingRef.current = false;
    setIsDragging(false);
    const { x: vpX, y: vpY, zoom } = rf.getViewport();
    const finalX = (e.clientX - vpX) / zoom - dragOffsetRef.current.x;
    const finalY = (e.clientY - vpY) / zoom - dragOffsetRef.current.y;
    setLocalMidpoint(null);
    data.onLabelDragEnd!(edge.id, finalX, finalY);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={svgPath}
        style={{
          stroke: color,
          strokeWidth,
          strokeDasharray: dash,
          opacity: dimmed ? 0.15 : 1,
          transition: "opacity 0.15s ease",
        }}
        markerEnd={`url(#${arrowMarkerId(color)})`}
      />
      <foreignObject
        x={mx - BLOCK_W / 2}
        y={my - BLOCK_H / 2}
        width={BLOCK_W}
        height={BLOCK_H}
        style={{ overflow: "visible" }}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-testid={`rf-edge-label-${edge.id}`}
          title={edge.summary.full !== edge.summary.display ? edge.summary.full : undefined}
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            background: workflowPalette.edgeLabel.fill,
            border: `1px solid ${workflowPalette.edgeLabel.border}`,
            borderRadius: geometry.labelPill.radius,
            padding: `${geometry.labelPill.paddingY}px ${geometry.labelPill.paddingX}px`,
            boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
            fontFamily: typography.fontFamily,
            opacity: dimmed ? 0.15 : 1,
            transition: isDragging ? "none" : "opacity 0.15s ease",
            cursor: data.onLabelDragEnd ? (isDragging ? "grabbing" : "grab") : "default",
            userSelect: "none",
            pointerEvents: "all",
            minWidth: 40,
          }}
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
      </foreignObject>
    </>
  );
}

export const RfTransitionEdge = memo(RfTransitionEdgeImpl);
