import type { Criterion } from "./criterion.js";
import type { CommentMeta, EdgeAnchorPair, HostRef } from "./editor.js";
import type { Processor } from "./processor.js";
import type { EntityIdentity, ImportMode, WorkflowSession } from "./session.js";
import type { StateCode, Transition, Workflow } from "./workflow.js";

export type DomainPatch =
  | { op: "addWorkflow"; workflow: Workflow }
  | { op: "removeWorkflow"; workflow: string }
  | {
      op: "updateWorkflowMeta";
      workflow: string;
      updates: Partial<Pick<Workflow, "version" | "desc" | "active">>;
    }
  | { op: "renameWorkflow"; from: string; to: string }
  | { op: "setInitialState"; workflow: string; stateCode: StateCode }
  | { op: "setWorkflowCriterion"; workflow: string; criterion?: Criterion }
  | { op: "addState"; workflow: string; stateCode: StateCode }
  | { op: "renameState"; workflow: string; from: StateCode; to: StateCode }
  | { op: "removeState"; workflow: string; stateCode: StateCode }
  | { op: "addTransition"; workflow: string; fromState: StateCode; transition: Transition }
  | { op: "updateTransition"; transitionUuid: string; updates: Partial<Transition> }
  | { op: "removeTransition"; transitionUuid: string }
  | {
      op: "reorderTransition";
      workflow: string;
      fromState: StateCode;
      transitionUuid: string;
      toIndex: number;
    }
  | {
      op: "moveTransitionSource";
      workflow: string;
      fromState: StateCode;
      toState: StateCode;
      transitionName: string;
    }
  | { op: "addProcessor"; transitionUuid: string; processor: Processor; index?: number }
  | { op: "updateProcessor"; processorUuid: string; updates: Partial<Processor> }
  | { op: "removeProcessor"; processorUuid: string }
  | {
      op: "reorderProcessor";
      transitionUuid: string;
      processorUuid: string;
      toIndex: number;
    }
  | { op: "setCriterion"; host: HostRef; path: string[]; criterion?: Criterion }
  | { op: "setImportMode"; mode: ImportMode }
  | { op: "setEntity"; entity: EntityIdentity | null }
  | { op: "replaceSession"; session: WorkflowSession }
  /**
   * UI-only: persist source/target anchor overrides for a transition edge.
   * Writes to `meta.workflowUi[workflow].edgeAnchors[transitionUuid]`.
   * `anchors: null` clears the override. Does not touch `session.workflows`.
   */
  | {
      op: "setEdgeAnchors";
      transitionUuid: string;
      anchors: EdgeAnchorPair | null;
    }
  /**
   * UI-only: persist a manual node position for a state.
   * Writes to `meta.workflowUi[workflow].layout.nodes[stateCode]`.
   * Does not touch `session.workflows`.
   */
  | {
      op: "setNodePosition";
      workflow: string;
      stateCode: StateCode;
      x: number;
      y: number;
      pinned?: boolean;
    }
  /**
   * UI-only: remove a manual node position, allowing auto-layout to take over.
   */
  | { op: "removeNodePosition"; workflow: string; stateCode: StateCode }
  /**
   * UI-only: clear all manual node positions for a workflow (full layout reset).
   */
  | { op: "resetLayout"; workflow: string }
  /**
   * UI-only: add a canvas comment.
   * Writes to `meta.workflowUi[workflow].comments[comment.id]`.
   */
  | { op: "addComment"; workflow: string; comment: CommentMeta }
  /**
   * UI-only: update fields on an existing canvas comment.
   */
  | { op: "updateComment"; workflow: string; commentId: string; updates: Partial<CommentMeta> }
  /**
   * UI-only: remove a canvas comment.
   */
  | { op: "removeComment"; workflow: string; commentId: string };
