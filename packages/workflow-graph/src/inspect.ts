import type { GraphDocument, GraphEdge, GraphNode, StateNode, TransitionEdge } from "./types.js";

export type WorkflowInspectionKind = "state" | "transition";

export interface WorkflowInspectionTransition {
  id: string;
  name: string;
  direction: "incoming" | "outgoing";
  sourceState: string;
  targetState: string;
}

export interface WorkflowInspectionState {
  id: string;
  stateCode: string;
}

export interface WorkflowInspection {
  focusedId: string;
  kind: WorkflowInspectionKind;
  workflow?: string;
  stateCode?: string;
  transitionName?: string;
  adjacentTransitions?: WorkflowInspectionTransition[];
  neighbouringStates?: WorkflowInspectionState[];
}

/**
 * Compute the set of node/edge IDs to highlight when `focusedId` is hovered
 * or selected. Returns `null` when nothing is focused.
 */
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

export function inspectGraphFocus(
  graph: GraphDocument,
  focusedId: string | null,
): WorkflowInspection | null {
  if (!focusedId) return null;

  const stateById = new Map<string, StateNode>();
  for (const node of graph.nodes) {
    if (node.kind === "state") stateById.set(node.id, node);
  }

  const transitionEdges = graph.edges.filter((edge): edge is TransitionEdge => edge.kind === "transition");
  const focusedState = stateById.get(focusedId);
  if (focusedState) {
    const adjacentEdges = transitionEdges.filter((edge) => edge.sourceId === focusedId || edge.targetId === focusedId);
    const neighbouringStates = new Map<string, WorkflowInspectionState>();
    for (const edge of adjacentEdges) {
      const neighbourId = edge.sourceId === focusedId ? edge.targetId : edge.sourceId;
      const neighbour = stateById.get(neighbourId);
      if (neighbour) {
        neighbouringStates.set(neighbour.id, {
          id: neighbour.id,
          stateCode: neighbour.stateCode,
        });
      }
    }
    return {
      focusedId,
      kind: "state",
      workflow: focusedState.workflow,
      stateCode: focusedState.stateCode,
      adjacentTransitions: adjacentEdges.map((edge) => ({
          id: edge.id,
          name: edge.label,
          direction: edge.targetId === focusedId ? "incoming" : "outgoing",
          sourceState: stateById.get(edge.sourceId)?.stateCode ?? edge.sourceId,
          targetState: stateById.get(edge.targetId)?.stateCode ?? edge.targetId,
        })),
      neighbouringStates: Array.from(neighbouringStates.values()),
    };
  }

  const focusedEdge = transitionEdges.find((edge) => edge.id === focusedId);
  if (!focusedEdge) return null;

  return {
    focusedId,
    kind: "transition",
    workflow: focusedEdge.workflow,
    transitionName: focusedEdge.label,
    neighbouringStates: [
      stateById.get(focusedEdge.sourceId),
      stateById.get(focusedEdge.targetId),
    ].flatMap((state) => state ? [{ id: state.id, stateCode: state.stateCode }] : []),
    adjacentTransitions: [
      {
        id: focusedEdge.id,
        name: focusedEdge.label,
        direction: "outgoing",
        sourceState: stateById.get(focusedEdge.sourceId)?.stateCode ?? focusedEdge.sourceId,
        targetState: stateById.get(focusedEdge.targetId)?.stateCode ?? focusedEdge.targetId,
      },
    ],
  };
}
