import type { TransitionEdge } from "@cyoda/workflow-graph";
import { workflowPalette } from "./tokens.js";

/**
 * Select the edge stroke color ("lane") for a transition edge.
 *
 * Order of precedence (mirrors the Launchpad renderer):
 * 1. Disabled transitions → disabled lane.
 * 2. Loopback (self or back-edge) → loop lane.
 * 3. Target is a terminal state → terminal lane (set by caller via
 *    `targetIsTerminal` since the edge itself doesn't know).
 * 4. Processor-bearing transition → processing lane.
 * 5. Manual transition → manual lane.
 * 6. Has a criterion (non-group) → conditional lane.
 * 7. Default → automated lane.
 */
export function laneColor(
  edge: TransitionEdge,
  opts: { targetIsTerminal: boolean },
): string {
  const e = workflowPalette.edge;
  if (edge.disabled) return e.disabled;
  if (edge.isLoopback) return e.loop;
  if (opts.targetIsTerminal) return e.terminal;
  if (edge.summary.processor && edge.summary.processor.kind !== "none") {
    return e.processing;
  }
  if (edge.manual) return e.manual;
  if (edge.summary.criterion) return e.conditional;
  return e.automated;
}

/**
 * Whether the stroke should be rendered dashed (spec §24: dashed-vs-solid
 * carries meaning, colour alone never does).
 */
export function laneIsDashed(edge: TransitionEdge): boolean {
  return edge.manual;
}

/**
 * SVG `strokeDasharray` value for an edge.
 * - Manual: dotted "2 4".
 * - Otherwise: undefined (solid).
 */
export function laneDashArray(edge: TransitionEdge): string | undefined {
  if (edge.manual) return "2 4";
  return undefined;
}
