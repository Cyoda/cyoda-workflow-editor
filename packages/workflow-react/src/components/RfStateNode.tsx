import { memo, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { HoverContext } from "./HoverContext.js";
import type { StateNode } from "@cyoda/workflow-graph";
import {
  geometry,
  paletteFor,
  roleCategoryLabel,
  typography,
  workflowPalette,
} from "@cyoda/workflow-viewer/theme";

function StateRoleIcon({ label, color }: { label: string; color: string }): ReactNode {
  const common = {
    width: 10,
    height: 10,
    fill: "none",
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (label === "INITIAL") {
    return (
      <svg {...common} viewBox="0 0 10 10">
        <polygon points="2.5,1.5 8.5,5 2.5,8.5" fill={color} stroke="none" />
      </svg>
    );
  }
  if (label === "TERMINAL") {
    return (
      <svg {...common} viewBox="0 0 10 10">
        <rect x="1.8" y="1.8" width="6.4" height="6.4" rx="1" fill={color} stroke="none" />
      </svg>
    );
  }
  if (label === "MANUAL REVIEW") {
    return (
      <svg {...common} viewBox="0 0 10 10">
        <path d="M5 2.2 L7 5 L5 7.8 L3 5 Z" />
        <circle cx="5" cy="5" r="0.8" fill={color} stroke="none" />
      </svg>
    );
  }
  if (label === "PROCESSING" || label === "PROCESSING STATE") {
    return (
      <svg {...common} viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="2.6" />
        <path d="M5 1.4 V2.7 M5 7.3 V8.6 M1.4 5 H2.7 M7.3 5 H8.6" />
      </svg>
    );
  }
  return (
    <svg {...common} viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="2.2" fill={color} stroke="none" />
    </svg>
  );
}

export interface RfStateNodeData {
  node: StateNode;
  hasError: boolean;
  hasWarning: boolean;
  /** Computed by the layout engine. When absent the token defaults are used. */
  size?: { width: number; height: number };
}

/**
 * React Flow custom node that visually matches the slim viewer's state
 * chrome. Only interaction affordances (handles, selection ring) differ.
 */
function RfStateNodeImpl({ data, selected, id }: NodeProps<RfStateNodeData>) {
  const { node, hasError, hasWarning, size } = data;
  const { highlightSet } = useContext(HoverContext);
  const dimmed = highlightSet !== null && !highlightSet.has(id);
  const palette = paletteFor(node);
  const { radius, strokeWidth } = geometry.node;
  const width = size?.width ?? geometry.node.width;
  const height = size?.height ?? geometry.node.height;
  const category = roleCategoryLabel(node);
  const [showAnchors, setShowAnchors] = useState(false);

  const borderColor = hasError
    ? "#DC2626"
    : hasWarning
      ? "#D97706"
      : selected
        ? workflowPalette.neutrals.slate900
        : palette.border;
  const borderWidth = selected ? strokeWidth + 1 : strokeWidth;

  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        boxSizing: "border-box",
        fontFamily: typography.fontFamily,
        userSelect: "none",
        opacity: dimmed ? 0.2 : 1,
        transition: "opacity 0.15s ease",
      }}
      data-testid={`rf-state-${node.stateCode}`}
      aria-label={`${category} state: ${node.stateCode}`}
      title={`${category} · ${node.stateCode}`}
      onMouseEnter={() => setShowAnchors(true)}
      onMouseLeave={() => setShowAnchors(false)}
    >
      {ALL_ANCHORS.map(({ side, position, inset }) => (
        <AnchorHandle
          key={side}
          side={side}
          position={position}
          inset={inset}
          color={palette.border}
          active={showAnchors}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: palette.fill,
          border: `${borderWidth}px solid ${borderColor}`,
          borderRadius: radius,
          boxShadow: selected
            ? "0 2px 4px rgba(15,23,42,0.14)"
            : "0 1px 2px rgba(15,23,42,0.08)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          gap: 2,
          padding: "0 8px",
        }}
      >
        <div
          style={{
            color: palette.meta,
            fontSize: typography.stateCategory.size,
            fontWeight: typography.stateCategory.weight,
            letterSpacing: typography.stateCategory.tracking,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            width: "100%",
            textAlign: "center",
          }}
          data-testid={`rf-state-${node.stateCode}-category`}
        >
          <StateRoleIcon label={category} color={palette.meta} />
          {category}
        </div>
        <div
          style={{
            color: palette.title,
            fontFamily: typography.monoFamily,
            fontSize: typography.stateTitle.size,
            fontWeight: typography.stateTitle.weight,
            letterSpacing: typography.stateTitle.tracking,
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {node.stateCode}
        </div>
      </div>
    </div>
  );
}

type AnchorSide =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "right-top"
  | "right-bottom"
  | "bottom-left"
  | "bottom-right"
  | "left-top"
  | "left-bottom";

type AnchorSpec = {
  side: AnchorSide;
  position: Position;
  inset: number;
};

/** All 12 anchors: 3 per side (left/center/right or top/center/bottom). */
const ALL_ANCHORS: ReadonlyArray<AnchorSpec> = [
  { side: "top-left", position: Position.Top, inset: 0.28 },
  { side: "top", position: Position.Top, inset: 0.5 },
  { side: "top-right", position: Position.Top, inset: 0.72 },
  { side: "right-top", position: Position.Right, inset: 0.28 },
  { side: "right", position: Position.Right, inset: 0.5 },
  { side: "right-bottom", position: Position.Right, inset: 0.72 },
  { side: "bottom-left", position: Position.Bottom, inset: 0.28 },
  { side: "bottom", position: Position.Bottom, inset: 0.5 },
  { side: "bottom-right", position: Position.Bottom, inset: 0.72 },
  { side: "left-top", position: Position.Left, inset: 0.28 },
  { side: "left", position: Position.Left, inset: 0.5 },
  { side: "left-bottom", position: Position.Left, inset: 0.72 },
];

const DOT_SIZE = 8;
const VISIBLE_HANDLE_THICKNESS = 16;
const SPLIT_HANDLE_SIZE = 18;

/**
 * The outer node border is the canonical anchor line for the interactive canvas.
 * Keep the visible dot, the real React Flow handle, and the hidden compatibility
 * handle centered on that same line so the user sees the true edge attachment.
 */
function anchorGeometry(position: Position, inset: number) {
  return {
    dotOffset: {
      ...dotEdgeOffset(position, DOT_SIZE / 2),
      ...dotAlongEdgeOffset(position, inset, DOT_SIZE / 2),
    },
    handleOffset: {
      ...handleEdgeOffset(position),
      ...handleAlongEdgeOffset(position, inset),
    },
  } satisfies Record<string, CSSProperties>;
}

function dotEdgeOffset(position: Position, halfThickness: number): CSSProperties {
  if (position === Position.Top) return { top: -halfThickness };
  if (position === Position.Bottom) return { bottom: -halfThickness };
  if (position === Position.Left) return { left: -halfThickness };
  return { right: -halfThickness };
}

function dotAlongEdgeOffset(
  position: Position,
  inset: number,
  halfSize: number,
): CSSProperties {
  if (position === Position.Top || position === Position.Bottom) {
    return { left: `calc(${inset * 100}% - ${halfSize}px)` };
  }
  return { top: `calc(${inset * 100}% - ${halfSize}px)` };
}

function handleEdgeOffset(position: Position): CSSProperties {
  if (position === Position.Top) return { top: -(VISIBLE_HANDLE_THICKNESS / 2) };
  if (position === Position.Bottom) return { bottom: -(VISIBLE_HANDLE_THICKNESS / 2) };
  if (position === Position.Left) return { left: -(VISIBLE_HANDLE_THICKNESS / 2) };
  return { right: -(VISIBLE_HANDLE_THICKNESS / 2) };
}

function handleAlongEdgeOffset(position: Position, inset: number): CSSProperties {
  if (position === Position.Top || position === Position.Bottom) {
    return { left: `${inset * 100}%` };
  }
  return { top: `${inset * 100}%` };
}

function AnchorHandle({
  side,
  position,
  inset,
  color,
  active = true,
}: {
  side: AnchorSide;
  position: Position;
  inset: number;
  color: string;
  active?: boolean;
}) {
  const geo = anchorGeometry(position, inset);
  const handleStyle = visibleHandleStyle(position, geo.handleOffset, side.includes("-"), active);

  // Small visible dot centered on the edge, non-interactive.
  const dotStyle: CSSProperties = {
    position: "absolute",
    width: DOT_SIZE,
    height: DOT_SIZE,
    background: color,
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: 3,
    opacity: active ? 1 : 0,
    transition: "opacity 120ms ease",
    ...geo.dotOffset,
  };

  return (
    <>
      {/* Render target below source so drag gestures begin from the source handle
          when both overlap in Loose mode. Otherwise React Flow treats a
          source-to-target drag as target-to-source and reverses the edge. */}
      <Handle
        id={side}
        type="target"
        position={position}
        style={handleStyle}
      />
      {/* Large transparent hit area spanning most of the edge for forgiving drops. */}
      <Handle
        id={side}
        type="source"
        position={position}
        style={handleStyle}
      />
      <div style={dotStyle} />
    </>
  );
}

function visibleHandleStyle(
  position: Position,
  offset: CSSProperties,
  isSplit: boolean,
  active: boolean,
): CSSProperties {
  const isVertical = position === Position.Top || position === Position.Bottom;
  return {
    background: "transparent",
    border: "none",
    borderRadius: 0,
    width: isVertical ? (isSplit ? SPLIT_HANDLE_SIZE : "80%") : VISIBLE_HANDLE_THICKNESS,
    height: isVertical ? VISIBLE_HANDLE_THICKNESS : isSplit ? SPLIT_HANDLE_SIZE : "80%",
    zIndex: 2,
    opacity: active ? 1 : 0,
    pointerEvents: active ? "auto" : "none",
    transition: "opacity 120ms ease",
    ...offset,
  };
}



export const RfStateNode = memo(RfStateNodeImpl);
