export type LayoutPreset = "websiteCompact" | "configuratorReadable" | "opsAudit";

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeWaypoint {
  x: number;
  y: number;
}

export interface EdgeRoute {
  id: string;
  /** Full polyline, starting at the source edge, ending at the target edge. */
  points: EdgeWaypoint[];
  /** Final centre point for chip placement. */
  labelX: number;
  labelY: number;
  /** Estimated rendered label dimensions used by the layout collision pass. */
  labelWidth: number;
  labelHeight: number;
}

export interface LayoutResult {
  positions: Map<string, NodePosition>;
  edges: Map<string, EdgeRoute>;
  width: number;
  height: number;
  preset: LayoutPreset;
}

export interface PinnedNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutOptions {
  preset?: LayoutPreset;
  /** Flow direction. "vertical" = top-to-bottom (default), "horizontal" = left-to-right. */
  orientation?: "vertical" | "horizontal";
  /** Default node size (layout will treat every state as this size). */
  nodeSize?: { width: number; height: number };
  /** Nodes whose positions are fixed and must be respected. */
  pinned?: PinnedNode[];
}
