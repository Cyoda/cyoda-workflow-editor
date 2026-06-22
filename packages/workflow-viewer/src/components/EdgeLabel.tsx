import type { TransitionEdge } from "@cyoda/workflow-graph";
import { badgesFor } from "../theme/badges.js";
import { geometry, typography, workflowPalette } from "../theme/tokens.js";

interface Props {
  edge: TransitionEdge;
  x: number;
  y: number;
  dimmed: boolean;
}

export function EdgeLabel({ edge, x, y, dimmed }: Props) {
  const title = edge.summary.display;
  const badges = badgesFor(edge.summary, {
    manual: edge.manual,
    disabled: edge.disabled,
  });

  return (
    <foreignObject x={x} y={y} width={1} height={1} style={{ overflow: "visible" }}>
      <div
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
          transition: "opacity 0.15s ease",
          pointerEvents: "none",
          userSelect: "none",
          transform: "translate(-50%, -50%)",
          whiteSpace: "nowrap",
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
          {title}
        </div>
        {badges.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "nowrap", justifyContent: "center" }}>
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
  );
}
