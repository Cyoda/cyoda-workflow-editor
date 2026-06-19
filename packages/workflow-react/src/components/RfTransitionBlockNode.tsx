import { memo } from "react";
import type { NodeProps } from "reactflow";
import { colors, radii } from "../style/tokens.js";

export interface RfTransitionBlockNodeData {
  transitionName: string;
  processorCount: number;
  hasCriterion: boolean;
  selected: boolean;
}

const BLOCK_WIDTH = 120;
const BLOCK_HEIGHT = 36;

export const TRANSITION_BLOCK_SIZE = { width: BLOCK_WIDTH, height: BLOCK_HEIGHT };

function RfTransitionBlockNodeImpl({ data }: NodeProps<RfTransitionBlockNodeData>) {
  const { transitionName, processorCount, hasCriterion, selected } = data;
  return (
    <div
      style={{
        width: BLOCK_WIDTH,
        height: BLOCK_HEIGHT,
        background: selected ? "#EFF6FF" : "white",
        border: `1.5px solid ${selected ? colors.primary : colors.border}`,
        borderRadius: radii.md,
        boxShadow: "0 1px 3px rgba(15,23,42,0.10)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 6px",
        cursor: "grab",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: colors.textPrimary,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
        }}
        title={transitionName}
      >
        {transitionName}
      </div>
      {(processorCount > 0 || hasCriterion) && (
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {processorCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: colors.textSecondary,
                background: "#F1F5F9",
                borderRadius: 3,
                padding: "1px 4px",
              }}
            >
              {processorCount}P
            </span>
          )}
          {hasCriterion && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: colors.textSecondary,
                background: "#F1F5F9",
                borderRadius: 3,
                padding: "1px 4px",
              }}
            >
              IF
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const RfTransitionBlockNode = memo(RfTransitionBlockNodeImpl);
