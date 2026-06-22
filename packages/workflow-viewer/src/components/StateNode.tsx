import type { StateNode as StateNodeData } from "@cyoda/workflow-graph";
import { paletteFor, roleCategoryLabel } from "../theme/index.js";
import { geometry, typography, workflowPalette } from "../theme/tokens.js";
import type { NodePosition } from "../layout.js";

interface Props {
  node: StateNodeData;
  position: NodePosition;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
}

function StateRoleIcon({ label, color }: { label: string; color: string }) {
  const common = {
    width: 10,
    height: 10,
    fill: "none" as const,
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (label === "INITIAL") {
    return <svg {...common} viewBox="0 0 10 10"><polygon points="2.5,1.5 8.5,5 2.5,8.5" fill={color} stroke="none" /></svg>;
  }
  if (label === "TERMINAL") {
    return <svg {...common} viewBox="0 0 10 10"><rect x="1.8" y="1.8" width="6.4" height="6.4" rx="1" fill={color} stroke="none" /></svg>;
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
  return <svg {...common} viewBox="0 0 10 10"><circle cx="5" cy="5" r="2.2" fill={color} stroke="none" /></svg>;
}

export function StateNodeView({
  node,
  position,
  selected,
  highlighted,
  dimmed,
  onSelect,
  onHoverEnter,
  onHoverLeave,
}: Props) {
  const palette = paletteFor(node);
  const { radius, strokeWidth, terminalInset, terminalInnerRadius } = geometry.node;
  const { width, height } = position;
  const isTerminal = node.role === "terminal" || node.role === "initial-terminal";
  const isInitialTerminal = node.role === "initial-terminal";
  const category = roleCategoryLabel(node);

  const borderColor = selected
    ? workflowPalette.neutrals.slate900
    : palette.border;
  const borderWidth = selected ? strokeWidth + 1 : strokeWidth;

  // Inner ring color for terminal/initial nodes — matches SVG viewer decoration
  const innerRingColor = "innerRing" in palette
    ? (palette as { innerRing: string }).innerRing
    : workflowPalette.neutrals.white75;

  return (
    <g
      transform={`translate(${position.x}, ${position.y})`}
      opacity={dimmed ? 0.35 : 1}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
      onMouseEnter={() => onHoverEnter(node.id)}
      onMouseLeave={onHoverLeave}
      style={{ cursor: "pointer" }}
      data-testid={`state-node-${node.stateCode}`}
      aria-label={`${category} ${node.stateCode}`}
      role="button"
      tabIndex={0}
    >
      <foreignObject x={0} y={0} width={width} height={height} style={{ overflow: "visible" }}>
        <div
          style={{
            width,
            height,
            boxSizing: "border-box",
            position: "relative",
            background: palette.fill,
            border: `${borderWidth}px solid ${borderColor}`,
            borderRadius: radius,
            boxShadow: selected || highlighted
              ? "0 2px 4px rgba(15,23,42,0.14)"
              : "0 1px 2px rgba(15,23,42,0.08)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 2,
            padding: "0 8px",
            fontFamily: typography.fontFamily,
            userSelect: "none",
          }}
        >
          {/* Inner ring for terminal/initial-terminal nodes */}
          {isTerminal && (
            <div style={{
              position: "absolute",
              inset: terminalInset,
              borderRadius: terminalInnerRadius,
              border: isInitialTerminal
                ? `1px dashed ${workflowPalette.node.initial.border}`
                : `1px solid ${innerRingColor}`,
              pointerEvents: "none",
            }} />
          )}

          {/* Category row: icon + label */}
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
              position: "relative",
            }}
          >
            <StateRoleIcon label={category} color={palette.meta} />
            {category}
          </div>

          {/* State code */}
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
              position: "relative",
            }}
          >
            {node.stateCode}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}
