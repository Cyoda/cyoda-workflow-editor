import { memo, type CSSProperties, type ReactNode } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
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
  if (label === "PROCESSING STATE") {
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
  /** When true, expose 8 visible anchor points instead of the default 4. */
  denseAnchors?: boolean;
}

/**
 * React Flow custom node that visually matches the slim viewer's state
 * chrome. Only interaction affordances (handles, selection ring) differ.
 */
function RfStateNodeImpl({ data, selected }: NodeProps<RfStateNodeData>) {
  const { node, hasError, hasWarning, size, denseAnchors } = data;
  const palette = paletteFor(node);
  const { radius, strokeWidth } = geometry.node;
  const width = size?.width ?? geometry.node.width;
  const height = size?.height ?? geometry.node.height;
  const category = roleCategoryLabel(node);
  const isTerminal = node.role === "terminal" || node.role === "initial-terminal";

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
        background: palette.fill,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius: radius,
        boxShadow: selected
          ? "0 2px 4px rgba(15,23,42,0.14)"
          : "0 1px 2px rgba(15,23,42,0.08)",
        position: "relative",
        boxSizing: "border-box",
        fontFamily: typography.fontFamily,
        userSelect: "none",
      }}
      data-testid={`rf-state-${node.stateCode}`}
      aria-label={`${category} state: ${node.stateCode}`}
      title={`${category} · ${node.stateCode}`}
    >
      {(denseAnchors ? CARDINAL_ANCHORS : SPLIT_ANCHORS).map((anchor) => (
        <AnchorHandle
          key={`compat-${anchor.side}`}
          side={anchor.side}
          position={anchor.position}
          inset={anchor.inset}
          color={palette.border}
          hidden
        />
      ))}
      {(denseAnchors ? SPLIT_ANCHORS : CARDINAL_ANCHORS).map(({ side, position, inset }) => (
        <AnchorHandle
          key={side}
          side={side}
          position={position}
          inset={inset}
          color={palette.border}
        />
      ))}
      <div
        style={{
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
            gap: 4,
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
      {isTerminal && (
        <div
          style={{
            position: "absolute",
            inset: 3,
            borderRadius: 8,
            border: `1px solid ${"innerRing" in palette ? palette.innerRing : workflowPalette.neutrals.white75}`,
            pointerEvents: "none",
          }}
        />
      )}
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

const CARDINAL_ANCHORS: ReadonlyArray<AnchorSpec> = [
  { side: "top", position: Position.Top, inset: 0.5 },
  { side: "right", position: Position.Right, inset: 0.5 },
  { side: "bottom", position: Position.Bottom, inset: 0.5 },
  { side: "left", position: Position.Left, inset: 0.5 },
];

const SPLIT_ANCHORS: ReadonlyArray<AnchorSpec> = [
  { side: "top-left", position: Position.Top, inset: 0.28 },
  { side: "top-right", position: Position.Top, inset: 0.72 },
  { side: "right-top", position: Position.Right, inset: 0.28 },
  { side: "right-bottom", position: Position.Right, inset: 0.72 },
  { side: "bottom-left", position: Position.Bottom, inset: 0.28 },
  { side: "bottom-right", position: Position.Bottom, inset: 0.72 },
  { side: "left-top", position: Position.Left, inset: 0.28 },
  { side: "left-bottom", position: Position.Left, inset: 0.72 },
];

function AnchorHandle({
  side,
  position,
  inset,
  color,
  hidden = false,
}: {
  side: AnchorSide;
  position: Position;
  inset: number;
  color: string;
  hidden?: boolean;
}) {
  const handleStyle = hidden
    ? compatibilityHandleStyle(position, inset)
    : visibleHandleStyle(position, inset, side.includes("-"));

  // Small visible dot centered on the edge, non-interactive.
  const dotStyle: CSSProperties = {
    position: "absolute",
    width: 8,
    height: 8,
    background: color,
    borderRadius: "50%",
    pointerEvents: "none",
    ...(position === Position.Top
      ? { top: -4, left: `calc(${inset * 100}% - 4px)` }
      : position === Position.Bottom
        ? { bottom: -4, left: `calc(${inset * 100}% - 4px)` }
        : position === Position.Left
          ? { left: -4, top: `calc(${inset * 100}% - 4px)` }
          : { right: -4, top: `calc(${inset * 100}% - 4px)` }),
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
      {!hidden && <div style={dotStyle} />}
    </>
  );
}

function visibleHandleStyle(
  position: Position,
  inset: number,
  isSplit: boolean,
): CSSProperties {
  const isVertical = position === Position.Top || position === Position.Bottom;
  return {
    background: "transparent",
    border: "none",
    borderRadius: 0,
    width: isVertical ? (isSplit ? 18 : "80%") : 16,
    height: isVertical ? 16 : isSplit ? 18 : "80%",
    ...(isSplit
      ? position === Position.Top
        ? { left: `calc(${inset * 100}% - 9px)` }
        : position === Position.Bottom
          ? { left: `calc(${inset * 100}% - 9px)` }
          : position === Position.Left
          ? { top: `calc(${inset * 100}% - 9px)` }
            : { top: `calc(${inset * 100}% - 9px)` }
      : {}),
  };
}

function compatibilityHandleStyle(position: Position, inset: number): CSSProperties {
  return {
    background: "transparent",
    border: "none",
    borderRadius: 0,
    width: 2,
    height: 2,
    opacity: 0,
    pointerEvents: "none",
    ...(position === Position.Top
      ? { left: `calc(${inset * 100}% - 1px)` }
      : position === Position.Bottom
        ? { left: `calc(${inset * 100}% - 1px)` }
        : position === Position.Left
          ? { top: `calc(${inset * 100}% - 1px)` }
          : { top: `calc(${inset * 100}% - 1px)` }),
  };
}

export const RfStateNode = memo(RfStateNodeImpl);
