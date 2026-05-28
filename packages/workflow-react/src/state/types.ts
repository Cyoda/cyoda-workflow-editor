import type {
  DomainPatch,
  PatchTransaction,
  ValidationIssue,
  WorkflowEditorDocument,
} from "@cyoda/workflow-core";

export type EditorMode = "viewer" | "playground" | "editor";

/** What the user currently has selected on the canvas or inspector. */
export type Selection =
  | null
  | { kind: "workflow"; workflow: string }
  | { kind: "state"; workflow: string; stateCode: string; nodeId: string }
  | { kind: "transition"; transitionUuid: string }
  | { kind: "processor"; processorUuid: string }
  | { kind: "criterion"; hostKind: "workflow" | "transition"; hostId: string; path: string[] };

export interface UndoEntry {
  /** Patches to (re)apply going forward. */
  patches: DomainPatch[];
  /** Patches to apply to undo (in forward order; undo machinery reverses them). */
  inverses: DomainPatch[];
  summary: string;
  /** Selection to restore after undo. */
  selectionAfter?: Selection | null;
}

export interface EditorState {
  document: WorkflowEditorDocument;
  selection: Selection;
  activeWorkflow: string | null;
  mode: EditorMode;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
}

export interface EditorActions {
  dispatch(patch: DomainPatch, summary?: string): void;
  /** Dispatch multiple patches as one atomic undo step. */
  dispatchTransaction(tx: PatchTransaction): void;
  /** Apply a patch without recording undo (e.g. after an external JSON load). */
  silentReplace(
    document: WorkflowEditorDocument,
    options?: { preserveEditorState?: boolean },
  ): void;
  undo(): void;
  redo(): void;
  setSelection(sel: Selection): void;
  setActiveWorkflow(name: string | null): void;
  setMode(mode: EditorMode): void;
}

export type IssuesBySelection = Map<string, ValidationIssue[]>;
