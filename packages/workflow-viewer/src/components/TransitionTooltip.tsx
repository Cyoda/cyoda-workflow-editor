import type { Criterion, Processor, Transition } from "@cyoda/workflow-core";
import { typography, workflowPalette } from "../theme/tokens.js";

interface Props {
  transition: Transition;
  x: number;
  y: number;
}

export function TransitionTooltip({ transition, x, y }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        left: x + 12,
        top: y + 12,
        zIndex: 100,
        background: workflowPalette.neutrals.white,
        border: `1px solid ${workflowPalette.neutrals.slate200}`,
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
        padding: "10px 12px",
        maxWidth: 480,
        overflowWrap: "break-word",
        fontFamily: typography.fontFamily,
        fontSize: 12,
        color: workflowPalette.neutrals.slate900,
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", marginBottom: 8, color: workflowPalette.neutrals.slate500, textTransform: "uppercase" }}>
        {transition.name}
      </div>

      {transition.criterion && (
        <section style={{ marginBottom: transition.processors?.length ? 8 : 0 }}>
          <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: "0.05em", color: workflowPalette.neutrals.slate500, textTransform: "uppercase", marginBottom: 4 }}>
            Criterion
          </div>
          <CriterionView criterion={transition.criterion} />
        </section>
      )}

      {!!transition.processors?.length && (
        <section>
          <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: "0.05em", color: workflowPalette.neutrals.slate500, textTransform: "uppercase", marginBottom: 4 }}>
            Processors
          </div>
          {transition.processors.map((p, i) => (
            <ProcessorView key={i} processor={p} />
          ))}
        </section>
      )}

      {!transition.criterion && !transition.processors?.length && (
        <div style={{ color: workflowPalette.neutrals.slate500, fontStyle: "italic" }}>No criterion or processors</div>
      )}
    </div>
  );
}

function CriterionView({ criterion, depth = 0 }: { criterion: Criterion; depth?: number }) {
  const indent = depth * 12;
  const base: React.CSSProperties = { paddingLeft: indent, marginBottom: 3 };

  if (criterion.type === "simple") {
    return (
      <div style={{ ...base, overflowWrap: "break-word" }}>
        <Chip color="blue">{criterion.operation}</Chip>
        <code style={{ fontSize: 11, marginLeft: 4 }}>{criterion.jsonPath}</code>
        {criterion.value !== undefined && (
          <span style={{ marginLeft: 4, color: workflowPalette.neutrals.slate500 }}>= {JSON.stringify(criterion.value)}</span>
        )}
      </div>
    );
  }
  if (criterion.type === "lifecycle") {
    return (
      <div style={base}>
        <Chip color="purple">{criterion.field}</Chip>
        <Chip color="blue" style={{ marginLeft: 4 }}>{criterion.operation}</Chip>
        {criterion.value !== undefined && (
          <span style={{ marginLeft: 4, color: workflowPalette.neutrals.slate500 }}>{JSON.stringify(criterion.value)}</span>
        )}
      </div>
    );
  }
  if (criterion.type === "function") {
    return (
      <div style={base}>
        <Chip color="green">fn</Chip>
        <code style={{ fontSize: 11, marginLeft: 4 }}>{criterion.function.name}</code>
        {criterion.function.criterion && (
          <CriterionView criterion={criterion.function.criterion} depth={depth + 1} />
        )}
      </div>
    );
  }
  if (criterion.type === "array") {
    return (
      <div style={{ ...base, overflowWrap: "break-word" }}>
        <Chip color="orange">array</Chip>
        <Chip color="blue" style={{ marginLeft: 4 }}>{criterion.operation}</Chip>
        <code style={{ fontSize: 11, marginLeft: 4 }}>{criterion.jsonPath}</code>
      </div>
    );
  }
  if (criterion.type === "group") {
    return (
      <div style={base}>
        <Chip color="slate">{criterion.operator}</Chip>
        <div style={{ marginTop: 3 }}>
          {criterion.conditions.map((c, i) => (
            <CriterionView key={i} criterion={c} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }
  return null;
}

function ProcessorView({ processor }: { processor: Processor }) {
  const mode = processor.executionMode ?? "ASYNC_NEW_TX";
  return (
    <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <code style={{ fontSize: 11, fontWeight: 600 }}>{processor.name}</code>
      {mode !== "ASYNC_NEW_TX" && <Chip color="blue">{mode.replace(/_/g, " ")}</Chip>}
      {processor.config?.calculationNodesTags && (
        <Chip color="slate">{processor.config.calculationNodesTags}</Chip>
      )}
    </div>
  );
}

function Chip({ children, color, style }: { children: React.ReactNode; color: "blue" | "green" | "orange" | "purple" | "slate"; style?: React.CSSProperties }) {
  const colors: Record<string, { bg: string; text: string }> = {
    blue:   { bg: "#EFF6FF", text: "#1D4ED8" },
    green:  { bg: "#F0FDF4", text: "#15803D" },
    orange: { bg: "#FFF7ED", text: "#C2410C" },
    purple: { bg: "#FAF5FF", text: "#7E22CE" },
    slate:  { bg: "#F1F5F9", text: "#475569" },
  };
  const entry = colors[color] ?? colors["slate"]!;
  const { bg, text } = entry;
  return (
    <span style={{ background: bg, color: text, borderRadius: 3, padding: "1px 5px", fontSize: 10, fontWeight: 600, letterSpacing: "0.03em", ...style }}>
      {children}
    </span>
  );
}
