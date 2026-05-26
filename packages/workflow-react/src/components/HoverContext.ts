import { createContext } from "react";
import type { GraphEdge, GraphNode } from "@cyoda/workflow-graph";

export interface HoverContextValue {
  /** IDs of nodes/edges to show at full opacity. null = nothing focused, all full opacity. */
  highlightSet: Set<string> | null;
}

export const HoverContext = createContext<HoverContextValue>({ highlightSet: null });

export function computeHighlightSet(
  focusedId: string | null,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Set<string> | null {
  if (!focusedId) return null;

  const set = new Set<string>();
  set.add(focusedId);

  const node = nodes.find((n) => n.id === focusedId);
  if (node) {
    for (const e of edges) {
      if (e.kind !== "transition") continue;
      if (e.sourceId === focusedId || e.targetId === focusedId) {
        set.add(e.id);
        set.add(e.sourceId);
        set.add(e.targetId);
      }
    }
    return set;
  }

  const edge = edges.find((e) => e.id === focusedId);
  if (edge && edge.kind === "transition") {
    set.add(edge.sourceId);
    set.add(edge.targetId);
  }
  return set;
}
