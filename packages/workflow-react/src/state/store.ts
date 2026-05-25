import { useCallback, useMemo, useRef, useState } from "react";
import {
  applyPatch,
  applyPatches,
  invertPatch,
  type DomainPatch,
  type PatchTransaction,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import type {
  EditorActions,
  EditorMode,
  EditorState,
  Selection,
  UndoEntry,
} from "./types.js";

const MAX_UNDO = 100;

function summarize(patch: DomainPatch): string {
  switch (patch.op) {
    case "addWorkflow":
      return `Add workflow "${patch.workflow.name}"`;
    case "removeWorkflow":
      return `Remove workflow "${patch.workflow}"`;
    case "updateWorkflowMeta":
      return `Update workflow "${patch.workflow}"`;
    case "renameWorkflow":
      return `Rename workflow "${patch.from}" → "${patch.to}"`;
    case "setInitialState":
      return `Set initial state to "${patch.stateCode}"`;
    case "setWorkflowCriterion":
      return patch.criterion ? `Set workflow criterion` : `Clear workflow criterion`;
    case "addState":
      return `Add state "${patch.stateCode}"`;
    case "renameState":
      return `Rename state "${patch.from}" → "${patch.to}"`;
    case "removeState":
      return `Remove state "${patch.stateCode}"`;
    case "addTransition":
      return `Add transition "${patch.transition.name}"`;
    case "updateTransition":
      return `Update transition`;
    case "removeTransition":
      return `Remove transition`;
    case "reorderTransition":
      return `Reorder transition`;
    case "moveTransitionSource":
      return `Move transition "${patch.transitionName}" to "${patch.toState}"`;
    case "addProcessor":
      return `Add processor "${patch.processor.name}"`;
    case "updateProcessor":
      return `Update processor`;
    case "removeProcessor":
      return `Remove processor`;
    case "reorderProcessor":
      return `Reorder processor`;
    case "setCriterion":
      return patch.criterion ? `Set criterion` : `Clear criterion`;
    case "setImportMode":
      return `Set import mode to "${patch.mode}"`;
    case "setEntity":
      return patch.entity ? `Set entity` : `Clear entity`;
    case "replaceSession":
      return `Replace session`;
    case "setEdgeAnchors":
      return patch.anchors ? `Update edge anchors` : `Clear edge anchors`;
    case "setNodePosition":
      return `Move state "${patch.stateCode}"`;
    case "removeNodePosition":
      return `Unpin state "${patch.stateCode}"`;
    case "resetLayout":
      return `Reset layout`;
    case "addComment":
      return `Add comment`;
    case "updateComment":
      return `Update comment`;
    case "removeComment":
      return `Remove comment`;
  }
}

function pickDefaultActiveWorkflow(doc: WorkflowEditorDocument): string | null {
  return doc.session.workflows[0]?.name ?? null;
}

/**
 * For addTransition / addProcessor the UUID is minted during applyPatch so
 * invertPatch (which sees only the pre-apply doc) cannot compute an exact
 * removeTransition / removeProcessor inverse.  After applying we diff the id
 * maps to find the newly minted UUID and produce an exact inverse.
 */
function computeExactInverse(
  prePatchDoc: WorkflowEditorDocument,
  postPatchDoc: WorkflowEditorDocument,
  patch: DomainPatch,
): DomainPatch {
  if (patch.op === "addTransition") {
    const priorUUIDs = new Set(Object.keys(prePatchDoc.meta.ids.transitions));
    const newUUID = Object.keys(postPatchDoc.meta.ids.transitions).find(
      (uuid) => !priorUUIDs.has(uuid),
    );
    if (newUUID) return { op: "removeTransition", transitionUuid: newUUID };
  }
  if (patch.op === "addProcessor") {
    const priorUUIDs = new Set(Object.keys(prePatchDoc.meta.ids.processors));
    const newUUID = Object.keys(postPatchDoc.meta.ids.processors).find(
      (uuid) => !priorUUIDs.has(uuid),
    );
    if (newUUID) return { op: "removeProcessor", processorUuid: newUUID };
  }
  return invertPatch(prePatchDoc, patch);
}

export function useEditorStore(
  initialDocument: WorkflowEditorDocument,
  initialMode: EditorMode = "editor",
): [EditorState, EditorActions] {
  const [state, setState] = useState<EditorState>(() => ({
    document: initialDocument,
    selection: null,
    activeWorkflow: pickDefaultActiveWorkflow(initialDocument),
    mode: initialMode,
    undoStack: [],
    redoStack: [],
  }));

  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback((patch: DomainPatch, summary?: string) => {
    const current = stateRef.current;
    if (current.mode === "viewer") return;
    const nextDoc = applyPatch(current.document, patch);
    const inverse = computeExactInverse(current.document, nextDoc, patch);
    const entry: UndoEntry = {
      patches: [patch],
      inverses: [inverse],
      summary: summary ?? summarize(patch),
    };
    const undoStack = [...current.undoStack, entry].slice(-MAX_UNDO);
    setState({
      ...current,
      document: nextDoc,
      undoStack,
      redoStack: [],
      activeWorkflow: reconcileActiveWorkflow(current.activeWorkflow, nextDoc),
      selection: reconcileSelection(current.selection, nextDoc),
    });
  }, []);

  const dispatchTransaction = useCallback((tx: PatchTransaction) => {
    const current = stateRef.current;
    if (current.mode === "viewer") return;
    const nextDoc = tx.patches.reduce((d, p) => applyPatch(d, p), current.document);
    const entry: UndoEntry = {
      patches: tx.patches,
      inverses: tx.inverses,
      summary: tx.summary,
      selectionAfter: (tx.selectionAfter as Selection | null | undefined) ?? null,
    };
    const undoStack = [...current.undoStack, entry].slice(-MAX_UNDO);
    const nextSelection =
      entry.selectionAfter !== undefined
        ? entry.selectionAfter
        : reconcileSelection(current.selection, nextDoc);
    setState({
      ...current,
      document: nextDoc,
      undoStack,
      redoStack: [],
      activeWorkflow: reconcileActiveWorkflow(current.activeWorkflow, nextDoc),
      selection: nextSelection,
    });
  }, []);

  const silentReplace = useCallback((
    document: WorkflowEditorDocument,
    options?: { preserveEditorState?: boolean },
  ) => {
    const current = stateRef.current;
    if (options?.preserveEditorState) {
      setState({
        ...current,
        document,
        activeWorkflow: reconcileActiveWorkflow(current.activeWorkflow, document),
        selection: reconcileSelection(current.selection, document),
      });
      return;
    }
    setState({
      ...current,
      document,
      undoStack: [],
      redoStack: [],
      activeWorkflow: pickDefaultActiveWorkflow(document),
      selection: null,
    });
  }, []);

  const undo = useCallback(() => {
    const current = stateRef.current;
    const top = current.undoStack[current.undoStack.length - 1];
    if (!top) return;
    // Inverses are stored in undo-application order; apply them as-is.
    const reverted = applyPatches(current.document, top.inverses);
    const nextSelection =
      top.selectionAfter !== undefined
        ? reconcileSelection(top.selectionAfter, reverted)
        : reconcileSelection(current.selection, reverted);
    setState({
      ...current,
      document: reverted,
      undoStack: current.undoStack.slice(0, -1),
      redoStack: [...current.redoStack, top],
      activeWorkflow: reconcileActiveWorkflow(current.activeWorkflow, reverted),
      selection: nextSelection,
    });
  }, []);

  const redo = useCallback(() => {
    const current = stateRef.current;
    const top = current.redoStack[current.redoStack.length - 1];
    if (!top) return;
    const next = applyPatches(current.document, top.patches);
    setState({
      ...current,
      document: next,
      undoStack: [...current.undoStack, top],
      redoStack: current.redoStack.slice(0, -1),
      activeWorkflow: reconcileActiveWorkflow(current.activeWorkflow, next),
      selection: reconcileSelection(current.selection, next),
    });
  }, []);

  const setSelection = useCallback((sel: Selection) => {
    setState((s) => ({ ...s, selection: sel }));
  }, []);

  const setActiveWorkflow = useCallback((name: string | null) => {
    setState((s) => ({ ...s, activeWorkflow: name, selection: null }));
  }, []);

  const setMode = useCallback((mode: EditorMode) => {
    setState((s) => ({ ...s, mode }));
  }, []);

  const actions = useMemo<EditorActions>(
    () => ({
      dispatch,
      dispatchTransaction,
      silentReplace,
      undo,
      redo,
      setSelection,
      setActiveWorkflow,
      setMode,
    }),
    [dispatch, dispatchTransaction, silentReplace, undo, redo, setSelection, setActiveWorkflow, setMode],
  );

  return [state, actions];
}

function reconcileActiveWorkflow(
  current: string | null,
  doc: WorkflowEditorDocument,
): string | null {
  if (!current) return doc.session.workflows[0]?.name ?? null;
  const hit = doc.session.workflows.find((w) => w.name === current);
  if (hit) return current;
  return doc.session.workflows[0]?.name ?? null;
}

function reconcileSelection(
  selection: Selection,
  doc: WorkflowEditorDocument,
): Selection {
  if (!selection) return null;
  const { ids } = doc.meta;
  switch (selection.kind) {
    case "workflow": {
      const hit = doc.session.workflows.find((w) => w.name === selection.workflow);
      return hit ? selection : null;
    }
    case "state": {
      const wf = doc.session.workflows.find((w) => w.name === selection.workflow);
      if (!wf) return null;
      if (wf.states[selection.stateCode]) return selection;
      // State may have been renamed — nodeId (UUID) is stable, look up new code
      if (selection.nodeId) {
        const ptr = ids.states[selection.nodeId];
        if (ptr && ptr.workflow === selection.workflow && wf.states[ptr.state]) {
          return { ...selection, stateCode: ptr.state };
        }
      }
      return null;
    }
    case "transition":
      return ids.transitions[selection.transitionUuid] ? selection : null;
    case "processor":
      return ids.processors[selection.processorUuid] ? selection : null;
    case "criterion":
      return ids.criteria[selection.hostId] ||
        ids.workflows[selection.hostId] ||
        ids.transitions[selection.hostId]
        ? selection
        : null;
  }
}
