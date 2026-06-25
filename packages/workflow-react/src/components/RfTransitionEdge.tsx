import { memo, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  type EdgeProps,
  useReactFlow,
} from "reactflow";
import type { Transition } from "@cyoda/workflow-core";
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
import { TransitionTooltip } from "./TransitionTooltip.js";

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
  /** Full transition data for the tooltip popup. */
  transition?: Transition;
  /** Called when the user finishes dragging the label. Receives edge id and new flow-coordinate centre. */
  onLabelDragEnd?: (edgeId: string, x: number, y: number) => void;
  /** True when this label's mid-segment position is manually pinned by the user. */
  isPinned?: boolean;
  /** Overrides the computed mid-segment Y (horiz) or X (vert) for user-pinned positions. */
  forcedMid?: number;
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
  const { highlightSet } = useContext(HoverContext);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localForcedMid, setLocalForcedMid] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rf = useReactFlow();

  if (!data) return null;
  const dimmed = highlightSet !== null && !highlightSet.has(id);
  const { edge, targetIsTerminal, obstacles, parallelOffset } = data;
  const resolvedSourceX = data.liveSource?.x ?? sourceX;
  const resolvedSourceY = data.liveSource?.y ?? sourceY;
  const resolvedTargetX = data.liveTarget?.x ?? targetX;
  const resolvedTargetY = data.liveTarget?.y ?? targetY;

  const effectiveForcedMid = localForcedMid ?? data.forcedMid;
  const { path, labelX, labelY } = orthogonalEdgePath({
    sourceX: resolvedSourceX,
    sourceY: resolvedSourceY,
    targetX: resolvedTargetX,
    targetY: resolvedTargetY,
    sourcePosition: data.liveSourcePosition ?? sourcePosition,
    targetPosition: data.liveTargetPosition ?? targetPosition,
    forcedMid: effectiveForcedMid,
    sourceRect: data.liveSourceRect,
    targetRect: data.liveTargetRect,
    obstacles,
    parallelOffset: effectiveForcedMid !== undefined ? 0 : parallelOffset,
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
            transform: `translate(-50%, -50%) translate(${labelX + (data.labelXOffset ?? 0)}px, ${labelY + (data.labelYOffset ?? 0)}px)`,
            opacity: dimmed ? 0.15 : 1,
            transition: "opacity 0.15s ease",
            fontFamily: typography.fontFamily,
            pointerEvents: "all",
            background: workflowPalette.edgeLabel.fill,
            border: `1px solid ${workflowPalette.edgeLabel.border}`,
            borderRadius: geometry.labelPill.radius,
            padding: `${geometry.labelPill.paddingY}px ${geometry.labelPill.paddingX}px`,
            boxShadow: data.isPinned
              ? "0 1px 2px rgba(15,23,42,0.08), inset 0 0 0 1px rgba(99,102,241,0.3)"
              : "0 1px 2px rgba(15,23,42,0.08)",
            cursor: data.onLabelDragEnd ? (isDragging ? "grabbing" : "grab") : "default",
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
          onMouseEnter={data.transition ? (e) => setTooltipPos({ x: e.clientX, y: e.clientY }) : undefined}
          onMouseMove={data.transition ? (e) => { setTooltipPos({ x: e.clientX, y: e.clientY }); } : undefined}
          onMouseLeave={data.transition ? () => setTooltipPos(null) : undefined}
          onPointerDown={data.onLabelDragEnd ? (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();
            setTooltipPos(null);
            const { x: vpX, y: vpY, zoom } = rf.getViewport();
            const flowX = (e.clientX - vpX) / zoom;
            const flowY = (e.clientY - vpY) / zoom;
            const labelCX = labelX + (data.labelXOffset ?? 0);
            const labelCY = labelY + (data.labelYOffset ?? 0);
            dragOffsetRef.current = { x: flowX - labelCX, y: flowY - labelCY };
            isDraggingRef.current = true;
            didDragRef.current = false;
            setIsDragging(true);
            setLocalForcedMid(effectiveForcedMid ?? labelCY);
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } : undefined}
          onPointerMove={data.onLabelDragEnd ? (e) => {
            if (!isDraggingRef.current) return;
            e.stopPropagation();
            didDragRef.current = true;
            const { x: vpX, y: vpY, zoom } = rf.getViewport();
            const newFlowX = (e.clientX - vpX) / zoom;
            const newFlowY = (e.clientY - vpY) / zoom;
            const effSrcPos = data.liveSourcePosition ?? sourcePosition;
            const isHorizMid = effSrcPos === Position.Bottom || effSrcPos === Position.Top;
            setLocalForcedMid(isHorizMid
              ? newFlowY - dragOffsetRef.current.y
              : newFlowX - dragOffsetRef.current.x);
          } : undefined}
          onPointerUp={data.onLabelDragEnd ? (e) => {
            if (!isDraggingRef.current) return;
            e.stopPropagation();
            isDraggingRef.current = false;
            setIsDragging(false);
            setLocalForcedMid(null);
            if (!didDragRef.current) return;
            const { x: vpX, y: vpY, zoom } = rf.getViewport();
            const finalX = (e.clientX - vpX) / zoom - dragOffsetRef.current.x;
            const finalY = (e.clientY - vpY) / zoom - dragOffsetRef.current.y;
            data.onLabelDragEnd!(id, finalX, finalY);
          } : undefined}
          onPointerCancel={data.onLabelDragEnd ? () => {
            isDraggingRef.current = false;
            setIsDragging(false);
            setLocalForcedMid(null);
          } : undefined}
          onClick={data.onLabelDragEnd ? (e) => {
            if (didDragRef.current) {
              e.stopPropagation();
              didDragRef.current = false;
            }
          } : undefined}
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
      {tooltipPos && data.transition && createPortal(
        <TransitionTooltip transition={data.transition} x={tooltipPos.x} y={tooltipPos.y} />,
        document.body,
      )}
    </>
  );
}

export const RfTransitionEdge = memo(RfTransitionEdgeImpl);
