import type { LayoutPreset } from "../types.js";

/**
 * ELK option bundles per spec §13.2.
 *
 * Key spacing parameters:
 * - `elk.spacing.nodeNode`                        — gap between sibling nodes in the same layer
 * - `elk.layered.spacing.nodeNodeBetweenLayers`   — gap between layers (column gap in H, row gap in V)
 * - `elk.spacing.edgeNode`                        — minimum clearance between an edge segment and a node box
 * - `elk.spacing.edgeEdge`                        — minimum clearance between two parallel edge segments
 *
 * `edgeNode` and `edgeEdge` prevent edge paths from hugging node borders and
 * from stacking on top of each other in dense branching sections.
 *
 * `nodeNodeBetweenLayers` must be wide enough to fit the edge-label pill that
 * sits in the inter-layer channel. In vertical mode the label height matters;
 * in horizontal mode the label width matters.
 */
export function optionsFor(
  preset: LayoutPreset,
  orientation: "vertical" | "horizontal" = "vertical",
): Record<string, string> {
  if (orientation === "horizontal") {
    return horizontalOptionsFor(preset);
  }
  switch (preset) {
    case "websiteCompact":
      return {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "32",
        "elk.layered.spacing.nodeNodeBetweenLayers": "64",
        "elk.spacing.edgeNode": "12",
        "elk.spacing.edgeEdge": "8",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.edgeStraightening": "IMPROVE_STRAIGHTNESS",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.thoroughness": "7",
      };
    case "configuratorReadable":
      return {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "200",
        "elk.layered.spacing.nodeNodeBetweenLayers": "140",
        "elk.spacing.edgeNode": "20",
        "elk.spacing.edgeEdge": "12",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.edgeStraightening": "IMPROVE_STRAIGHTNESS",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.thoroughness": "10",
      };
    case "opsAudit":
      return {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "72",
        "elk.layered.spacing.nodeNodeBetweenLayers": "128",
        "elk.spacing.edgeNode": "24",
        "elk.spacing.edgeEdge": "16",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.thoroughness": "14",
      };
  }
}

/**
 * Horizontal (left-to-right) ELK options.
 *
 * `nodeNodeBetweenLayers` is larger than in vertical mode because in RIGHT
 * direction the inter-layer channel must fit the full WIDTH of the edge-label
 * pill (≈70-120 px) rather than just its height (≈18-32 px).
 */
function horizontalOptionsFor(preset: LayoutPreset): Record<string, string> {
  switch (preset) {
    case "websiteCompact":
      return {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": "120",
        "elk.spacing.edgeNode": "12",
        "elk.spacing.edgeEdge": "8",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.edgeStraightening": "IMPROVE_STRAIGHTNESS",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.thoroughness": "7",
      };
    case "configuratorReadable":
      return {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "200",
        "elk.layered.spacing.nodeNodeBetweenLayers": "180",
        "elk.spacing.edgeNode": "20",
        "elk.spacing.edgeEdge": "12",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.edgeStraightening": "IMPROVE_STRAIGHTNESS",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.thoroughness": "10",
      };
    case "opsAudit":
      return {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "72",
        "elk.layered.spacing.nodeNodeBetweenLayers": "180",
        "elk.spacing.edgeNode": "24",
        "elk.spacing.edgeEdge": "16",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.thoroughness": "14",
      };
  }
}

/**
 * Per-node priority hint: initial states pinned to layer 0, terminals
 * pushed down via a large layerConstraint-like weight.
 */
export function nodePriority(role: string): number {
  if (role === "initial" || role === "initial-terminal") return 10;
  if (role === "terminal") return -10;
  return 0;
}
