import { workflowPalette } from "../theme/tokens.js";
import type { NodePosition } from "../layout.js";

interface Props {
  position: NodePosition;
}

/**
 * Non-interactive start marker node (spec §10.5). Rendered as a small filled
 * circle above the initial state.
 */
export function StartMarker({ position }: Props) {
  const cx = position.x + position.width / 2;
  const cy = position.y + position.height / 2;
  const r = Math.min(position.width, position.height) / 3;
  return (
    <g aria-hidden="true">
      <circle
        data-testid="start-marker"
        cx={cx}
        cy={cy}
        r={r}
        fill={workflowPalette.node.initial.border}
        stroke={workflowPalette.node.initial.meta}
        strokeWidth={1.5}
      />
    </g>
  );
}
