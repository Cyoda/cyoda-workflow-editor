import type { WorkflowEditorDocument } from "../types/editor.js";
import type { DomainPatch } from "../types/patch.js";
import type { Criterion } from "../types/criterion.js";
import type { Processor } from "../types/processor.js";
import type { Transition, Workflow } from "../types/workflow.js";

/**
 * Produce the inverse of `patch` relative to the pre-apply document `doc`.
 * Applying `patch` to `doc`, then applying `invertPatch(doc, patch)` to the
 * result, returns a document equal to `doc` modulo `meta.revision`.
 *
 * Notes:
 * - `addTransition` and `addProcessor` cannot determine the newly minted UUID
 *   from the pre-apply doc alone; callers that need exact inverses for these
 *   should use `dispatchTransaction` and supply the inverse explicitly.
 * - `removeWorkflow`, `renameWorkflow`, and `removeState` invert via a captured
 *   `replaceSession` snapshot — correct but coarse.
 */
export function invertPatch(
  doc: WorkflowEditorDocument,
  patch: DomainPatch,
): DomainPatch {
  switch (patch.op) {
    case "addWorkflow":
      return { op: "removeWorkflow", workflow: patch.workflow.name };

    case "removeWorkflow":
    case "renameWorkflow":
    case "removeState":
    case "replaceSession":
      return { op: "replaceSession", session: cloneSession(doc) };

    case "updateWorkflowMeta": {
      const wf = findWorkflow(doc, patch.workflow);
      if (!wf) return noop();
      const prior: Partial<Pick<Workflow, "version" | "desc" | "active">> = {};
      for (const key of Object.keys(patch.updates) as Array<keyof typeof patch.updates>) {
        (prior as Record<string, unknown>)[key] = wf[key];
      }
      return { op: "updateWorkflowMeta", workflow: patch.workflow, updates: prior };
    }

    case "setInitialState": {
      const wf = findWorkflow(doc, patch.workflow);
      if (!wf) return noop();
      return { op: "setInitialState", workflow: patch.workflow, stateCode: wf.initialState };
    }

    case "setWorkflowCriterion": {
      const wf = findWorkflow(doc, patch.workflow);
      if (!wf) return noop();
      return wf.criterion
        ? { op: "setWorkflowCriterion", workflow: patch.workflow, criterion: cloneCriterion(wf.criterion) }
        : { op: "setWorkflowCriterion", workflow: patch.workflow };
    }

    case "addState":
      return { op: "removeState", workflow: patch.workflow, stateCode: patch.stateCode };

    case "renameState":
      // Exact inverse: swap from/to. Collision check in apply prevents silent overwrite.
      return { op: "renameState", workflow: patch.workflow, from: patch.to, to: patch.from };

    case "addTransition":
      // Cannot know the minted UUID pre-apply. Callers that need exact undo
      // should use dispatchTransaction and supply { op: "removeTransition", transitionUuid }.
      return { op: "replaceSession", session: cloneSession(doc) };

    case "updateTransition": {
      const t = findTransition(doc, patch.transitionUuid);
      if (!t) return noop();
      const prior: Partial<Transition> = {};
      for (const key of Object.keys(patch.updates) as Array<keyof Transition>) {
        (prior as Record<string, unknown>)[key] = t[key];
      }
      return { op: "updateTransition", transitionUuid: patch.transitionUuid, updates: prior };
    }

    case "removeTransition": {
      // Exact inverse: re-add the transition with its full captured data.
      const loc = locateTransition(doc, patch.transitionUuid);
      if (!loc) return noop();
      const wf = findWorkflow(doc, loc.workflow);
      const state = wf?.states[loc.state];
      const t = state?.transitions[loc.index];
      if (!t) return noop();
      return {
        op: "addTransition",
        workflow: loc.workflow,
        fromState: loc.state,
        transition: structuredClone(t),
      };
    }

    case "reorderTransition": {
      const loc = locateTransition(doc, patch.transitionUuid);
      if (!loc) return noop();
      // UUIDs are positional. After reorder + assignSyntheticIds, the UUID that was at
      // toIndex in the pre-apply doc now points to our moved item. Use that UUID for the inverse.
      const orderedForState: string[] = [];
      for (const [uuid, p] of Object.entries(doc.meta.ids.transitions)) {
        if (p.workflow === patch.workflow && p.state === patch.fromState) {
          orderedForState.push(uuid);
        }
      }
      const uuidAtTarget = orderedForState[patch.toIndex] ?? patch.transitionUuid;
      return {
        op: "reorderTransition",
        workflow: patch.workflow,
        fromState: patch.fromState,
        transitionUuid: uuidAtTarget,
        toIndex: loc.index,
      };
    }

    case "moveTransitionSource":
      return {
        op: "moveTransitionSource",
        workflow: patch.workflow,
        fromState: patch.toState,
        toState: patch.fromState,
        transitionName: patch.transitionName,
      };

    case "addProcessor":
      // Cannot know the minted UUID pre-apply. Use dispatchTransaction for exact undo.
      return { op: "replaceSession", session: cloneSession(doc) };

    case "updateProcessor": {
      const p = findProcessor(doc, patch.processorUuid);
      if (!p) return noop();
      const prior: Partial<Processor> = {};
      for (const key of Object.keys(patch.updates) as Array<keyof Processor>) {
        (prior as Record<string, unknown>)[key] = (p as unknown as Record<string, unknown>)[key];
      }
      return { op: "updateProcessor", processorUuid: patch.processorUuid, updates: prior };
    }

    case "removeProcessor": {
      const ptr = doc.meta.ids.processors[patch.processorUuid];
      if (!ptr) return noop();
      const procLoc = locateProcessor(doc, patch.processorUuid);
      if (!procLoc) return noop();
      const wf = findWorkflow(doc, procLoc.workflow);
      const state = wf?.states[procLoc.state];
      const t = state?.transitions[procLoc.transitionIndex];
      const p = t?.processors?.[procLoc.processorIndex];
      if (!p) return noop();
      return {
        op: "addProcessor",
        transitionUuid: ptr.transitionUuid,
        processor: structuredClone(p),
        index: procLoc.processorIndex,
      };
    }

    case "reorderProcessor": {
      const procLoc = locateProcessor(doc, patch.processorUuid);
      if (!procLoc) return noop();
      // Same positional UUID logic as reorderTransition.
      const orderedForTransition: string[] = [];
      for (const [uuid, p] of Object.entries(doc.meta.ids.processors)) {
        if (p.transitionUuid === patch.transitionUuid) orderedForTransition.push(uuid);
      }
      const uuidAtTarget = orderedForTransition[patch.toIndex] ?? patch.processorUuid;
      return {
        op: "reorderProcessor",
        transitionUuid: patch.transitionUuid,
        processorUuid: uuidAtTarget,
        toIndex: procLoc.processorIndex,
      };
    }

    case "setCriterion": {
      const prior = readCriterionAt(doc, patch.host, patch.path);
      return prior === undefined
        ? { op: "setCriterion", host: patch.host, path: patch.path }
        : { op: "setCriterion", host: patch.host, path: patch.path, criterion: cloneCriterion(prior) };
    }

    case "setImportMode":
      return { op: "setImportMode", mode: doc.session.importMode };

    case "setEntity":
      return { op: "setEntity", entity: doc.session.entity };

    case "setEdgeAnchors": {
      const ptr = doc.meta.ids.transitions[patch.transitionUuid];
      if (!ptr) return noop();
      const prior = doc.meta.workflowUi[ptr.workflow]?.edgeAnchors?.[patch.transitionUuid];
      return {
        op: "setEdgeAnchors",
        transitionUuid: patch.transitionUuid,
        anchors: prior ? { ...prior } : null,
      };
    }

    case "setNodePosition": {
      const prior = doc.meta.workflowUi[patch.workflow]?.layout?.nodes?.[patch.stateCode];
      if (!prior) {
        return { op: "removeNodePosition", workflow: patch.workflow, stateCode: patch.stateCode };
      }
      return { op: "setNodePosition", workflow: patch.workflow, stateCode: patch.stateCode, ...prior };
    }

    case "removeNodePosition": {
      const prior = doc.meta.workflowUi[patch.workflow]?.layout?.nodes?.[patch.stateCode];
      if (!prior) return noop();
      return { op: "setNodePosition", workflow: patch.workflow, stateCode: patch.stateCode, ...prior };
    }

    case "resetLayout":
      // Coarse: restores entire session snapshot (layout lives in meta, not session,
      // so this is a no-op for session but correct for meta via replaceSession being
      // handled separately). For now, resetLayout is intentionally not undoable
      // and callers should use silentReplace. Returning noop as a safe fallback.
      return noop();

    case "addComment":
      return { op: "removeComment", workflow: patch.workflow, commentId: patch.comment.id };

    case "updateComment": {
      const prior = doc.meta.workflowUi[patch.workflow]?.comments?.[patch.commentId];
      if (!prior) return noop();
      const priorUpdates: Partial<typeof prior> = {};
      for (const key of Object.keys(patch.updates) as Array<keyof typeof patch.updates>) {
        (priorUpdates as Record<string, unknown>)[key] = prior[key];
      }
      return { op: "updateComment", workflow: patch.workflow, commentId: patch.commentId, updates: priorUpdates };
    }

    case "removeComment": {
      const prior = doc.meta.workflowUi[patch.workflow]?.comments?.[patch.commentId];
      if (!prior) return noop();
      return { op: "addComment", workflow: patch.workflow, comment: structuredClone(prior) };
    }
  }
}

function noop(): DomainPatch {
  return { op: "setImportMode", mode: "MERGE" };
}

function findWorkflow(doc: WorkflowEditorDocument, name: string): Workflow | undefined {
  return doc.session.workflows.find((w) => w.name === name);
}

function locateTransition(
  doc: WorkflowEditorDocument,
  transitionUuid: string,
): { workflow: string; state: string; index: number } | null {
  const ptr = doc.meta.ids.transitions[transitionUuid];
  if (!ptr) return null;
  const ordered: string[] = [];
  for (const [uuid, p] of Object.entries(doc.meta.ids.transitions)) {
    if (p.workflow === ptr.workflow && p.state === ptr.state) ordered.push(uuid);
  }
  const idx = ordered.indexOf(transitionUuid);
  if (idx < 0) return null;
  return { workflow: ptr.workflow, state: ptr.state, index: idx };
}

function locateProcessor(
  doc: WorkflowEditorDocument,
  processorUuid: string,
): { workflow: string; state: string; transitionIndex: number; processorIndex: number } | null {
  const ptr = doc.meta.ids.processors[processorUuid];
  if (!ptr) return null;
  const tLoc = locateTransition(doc, ptr.transitionUuid);
  if (!tLoc) return null;
  const ordered: string[] = [];
  for (const [uuid, p] of Object.entries(doc.meta.ids.processors)) {
    if (p.transitionUuid === ptr.transitionUuid) ordered.push(uuid);
  }
  const pIdx = ordered.indexOf(processorUuid);
  if (pIdx < 0) return null;
  return { workflow: tLoc.workflow, state: tLoc.state, transitionIndex: tLoc.index, processorIndex: pIdx };
}

function findTransition(
  doc: WorkflowEditorDocument,
  transitionUuid: string,
): Transition | undefined {
  const loc = locateTransition(doc, transitionUuid);
  if (!loc) return undefined;
  const wf = findWorkflow(doc, loc.workflow);
  return wf?.states[loc.state]?.transitions[loc.index];
}

function findProcessor(
  doc: WorkflowEditorDocument,
  processorUuid: string,
): Processor | undefined {
  const loc = locateProcessor(doc, processorUuid);
  if (!loc) return undefined;
  const wf = findWorkflow(doc, loc.workflow);
  const t = wf?.states[loc.state]?.transitions[loc.transitionIndex];
  return t?.processors?.[loc.processorIndex];
}

function readCriterionAt(
  doc: WorkflowEditorDocument,
  host: { kind: string; workflow: string; state?: string; transitionUuid?: string },
  path: string[],
): Criterion | undefined {
  const wf = findWorkflow(doc, host.workflow);
  if (!wf) return undefined;
  let container: Record<string, unknown> | undefined;
  if (host.kind === "workflow") {
    container = wf as unknown as Record<string, unknown>;
  } else if (host.kind === "transition" && host.transitionUuid) {
    const t = findTransition(doc, host.transitionUuid);
    if (!t) return undefined;
    container = t as unknown as Record<string, unknown>;
  } else {
    return undefined;
  }
  let node: unknown = container;
  for (const seg of path) {
    if (node === null || node === undefined) return undefined;
    if (Array.isArray(node)) {
      node = node[Number(seg)];
    } else if (typeof node === "object") {
      node = (node as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return node as Criterion | undefined;
}

function cloneSession(doc: WorkflowEditorDocument) {
  return structuredClone(doc.session);
}

function cloneCriterion(c: Criterion): Criterion {
  return structuredClone(c);
}
