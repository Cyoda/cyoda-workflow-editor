import type { CyodaSchemaVersion } from "../dialect/version.js";
import type { WorkflowSession } from "./session.js";
import type { StateCode } from "./workflow.js";

export interface WorkflowEditorDocument {
  session: WorkflowSession;
  meta: EditorMetadata;
}

export interface EditorViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface EditorMetadata {
  revision: number;
  ids: SyntheticIdMap;
  workflowUi: Record<string, WorkflowUiMeta>;
  lastValidJsonHash?: string;
  /**
   * The cyoda-go schema dialect this document was parsed from / should be
   * serialized to by default (see `dialect/`). Editor-only — never emitted
   * into Cyoda import/export JSON. Unset means latest.
   */
  cyodaVersion?: CyodaSchemaVersion;
}

export interface SyntheticIdMap {
  workflows: Record<string, string>;
  states: Record<string, StatePointer>;
  transitions: Record<string, TransitionPointer>;
  processors: Record<string, ProcessorPointer>;
  criteria: Record<string, CriterionPointer>;
}

export interface StatePointer {
  workflow: string;
  state: string;
}

export interface TransitionPointer {
  workflow: string;
  state: string;
  transitionUuid: string;
}

export interface ProcessorPointer {
  workflow: string;
  state: string;
  transitionUuid: string;
  processorUuid: string;
}

export interface CriterionPointer {
  host: HostRef;
  path: string[];
}

export type HostRef =
  | { kind: "workflow"; workflow: string }
  | { kind: "transition"; workflow: string; state: string; transitionUuid: string }
  | {
      kind: "processorConfig";
      workflow: string;
      state: string;
      transitionUuid: string;
      processorUuid: string;
    };

/**
 * Editor-only anchor side for an edge endpoint. Lives in WorkflowUiMeta and
 * is never serialised into exported Cyoda JSON.
 */
export type EdgeAnchor =
  | "top-left" | "top" | "top-right"
  | "right-top" | "right" | "right-bottom"
  | "bottom-left" | "bottom" | "bottom-right"
  | "left-top" | "left" | "left-bottom";

export interface EdgeAnchorPair {
  source?: EdgeAnchor;
  target?: EdgeAnchor;
}

export interface CommentMeta {
  id: string;
  text: string;
  x: number;
  y: number;
  attachedTo?:
    | { kind: "state"; stateCode: string }
    | { kind: "transition"; sourceState: string; transitionName: string }
    | { kind: "free" };
}

export interface WorkflowUiMeta {
  layout?: {
    nodes: Record<StateCode, { x: number; y: number; pinned?: boolean }>;
  };
  collapsedStates?: string[];
  viewPreset?: "compact" | "ops" | "website";
  selectedId?: string;
  /**
   * Per-transition anchor overrides keyed by synthetic transition UUID.
   * Missing entries (or entries with missing `source`/`target`) fall back
   * to heuristic defaults computed at projection time.
   */
  edgeAnchors?: Record<string, EdgeAnchorPair>;
  /**
   * Canvas viewport snapshots keyed by layout orientation. These are editor-only
   * affordances and are never serialised into exported Cyoda JSON.
   */
  viewports?: Partial<Record<"vertical" | "horizontal", EditorViewport>>;
  /**
   * Canvas comments, keyed by comment id. Editor-only; never serialised into
   * exported Cyoda JSON.
   */
  comments?: Record<string, CommentMeta>;
  /**
   * Per-transition block positions keyed by synthetic transition UUID.
   * Editor-only; never serialised into exported Cyoda JSON.
   */
  transitionPositions?: Record<string, { x: number; y: number }>;
}
