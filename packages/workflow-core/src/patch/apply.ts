import { produce } from "immer";
import { assignSyntheticIds } from "../identity/assign.js";
import type { CommentMeta, WorkflowUiMeta, WorkflowEditorDocument } from "../types/editor.js";
import type { DomainPatch } from "../types/patch.js";
import type { WorkflowSession } from "../types/session.js";
import { PatchConflictError } from "../types/transaction.js";
import type { Workflow } from "../types/workflow.js";
import { validateSemantics } from "../validate/semantic.js";
import type { ValidationIssue } from "../types/validation.js";

/**
 * Apply a patch to a document, returning a new document.
 * - Refreshes synthetic IDs for the new session.
 * - Bumps revision.
 * - Re-runs semantic validation (issues stored separately; doc itself is the
 *   canonical source, issues are computed via validateAll by callers).
 */
export function applyPatch(
  doc: WorkflowEditorDocument,
  patch: DomainPatch,
): WorkflowEditorDocument {
  // UI-only patches short-circuit the session pipeline.
  if (patch.op === "setEdgeAnchors") return applySetEdgeAnchors(doc, patch);
  if (patch.op === "setNodePosition") return applySetNodePosition(doc, patch);
  if (patch.op === "removeNodePosition") return applyRemoveNodePosition(doc, patch);
  if (patch.op === "resetLayout") return applyResetLayout(doc, patch);
  if (patch.op === "addComment") return applyAddComment(doc, patch);
  if (patch.op === "updateComment") return applyUpdateComment(doc, patch);
  if (patch.op === "removeComment") return applyRemoveComment(doc, patch);

  const nextSession = produce(doc.session, (d) => {
    // Cast to break immer's WritableDraft recursion over the deeply-nested
    // Criterion union — we rely on structural mutation with no type gain.
    const draft = d as unknown as WorkflowSession;
    switch (patch.op) {
      case "addWorkflow":
        draft.workflows.push(patch.workflow);
        return;
      case "removeWorkflow":
        draft.workflows = draft.workflows.filter((w) => w.name !== patch.workflow);
        return;
      case "updateWorkflowMeta": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        if (!wf) return;
        Object.assign(wf, patch.updates);
        return;
      }
      case "renameWorkflow": {
        const wf = draft.workflows.find((w) => w.name === patch.from);
        if (!wf) return;
        wf.name = patch.to;
        return;
      }
      case "setInitialState": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        if (!wf) return;
        wf.initialState = patch.stateCode;
        return;
      }
      case "setWorkflowCriterion": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        if (!wf) return;
        if (patch.criterion === undefined) delete wf.criterion;
        else wf.criterion = patch.criterion;
        return;
      }
      case "addState": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        if (!wf) return;
        if (!(patch.stateCode in wf.states)) {
          wf.states[patch.stateCode] = { transitions: [] };
        }
        return;
      }
      case "renameState": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        if (!wf) return;
        if (patch.to !== patch.from && patch.to in wf.states) {
          throw new PatchConflictError(
            `State "${patch.to}" already exists in workflow "${patch.workflow}"`,
          );
        }
        renameStateCascading(wf, patch.from, patch.to);
        return;
      }
      case "removeState": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        if (!wf) return;
        removeStateCascading(wf, patch.stateCode);
        return;
      }
      case "addTransition": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        if (!wf) return;
        const state = wf.states[patch.fromState];
        if (!state) return;
        state.transitions.push(patch.transition);
        return;
      }
      case "updateTransition": {
        const loc = locateTransition(doc, patch.transitionUuid);
        if (!loc) return;
        const wf = draft.workflows.find((w) => w.name === loc.workflow);
        const state = wf?.states[loc.state];
        const transition = state?.transitions[loc.index];
        if (!transition) return;
        Object.assign(transition, patch.updates);
        return;
      }
      case "removeTransition": {
        const loc = locateTransition(doc, patch.transitionUuid);
        if (!loc) return;
        const wf = draft.workflows.find((w) => w.name === loc.workflow);
        const state = wf?.states[loc.state];
        if (!state) return;
        state.transitions.splice(loc.index, 1);
        return;
      }
      case "reorderTransition": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        const state = wf?.states[patch.fromState];
        if (!state) return;
        const loc = locateTransition(doc, patch.transitionUuid);
        if (!loc) return;
        const [item] = state.transitions.splice(loc.index, 1);
        if (!item) return;
        state.transitions.splice(patch.toIndex, 0, item);
        return;
      }
      case "moveTransitionSource": {
        const wf = draft.workflows.find((w) => w.name === patch.workflow);
        if (!wf) return;
        const fromState = wf.states[patch.fromState];
        const toState = wf.states[patch.toState];
        if (!fromState || !toState) return;
        const idx = fromState.transitions.findIndex((t) => t.name === patch.transitionName);
        if (idx < 0) return;
        if (
          patch.fromState !== patch.toState &&
          toState.transitions.some((t) => t.name === patch.transitionName)
        ) {
          throw new PatchConflictError(
            `Transition "${patch.transitionName}" already exists in state "${patch.toState}"`,
          );
        }
        const [transition] = fromState.transitions.splice(idx, 1);
        if (transition) toState.transitions.push(transition);
        return;
      }
      case "addProcessor": {
        const loc = locateTransition(doc, patch.transitionUuid);
        if (!loc) return;
        const wf = draft.workflows.find((w) => w.name === loc.workflow);
        const state = wf?.states[loc.state];
        const transition = state?.transitions[loc.index];
        if (!transition) return;
        if (!transition.processors) transition.processors = [];
        const idx = patch.index ?? transition.processors.length;
        transition.processors.splice(idx, 0, patch.processor);
        return;
      }
      case "updateProcessor": {
        const procLoc = locateProcessor(doc, patch.processorUuid);
        if (!procLoc) return;
        const wf = draft.workflows.find((w) => w.name === procLoc.workflow);
        const state = wf?.states[procLoc.state];
        const transition = state?.transitions[procLoc.transitionIndex];
        const processor = transition?.processors?.[procLoc.processorIndex];
        if (!processor) return;
        Object.assign(processor, patch.updates);
        return;
      }
      case "removeProcessor": {
        const procLoc = locateProcessor(doc, patch.processorUuid);
        if (!procLoc) return;
        const wf = draft.workflows.find((w) => w.name === procLoc.workflow);
        const state = wf?.states[procLoc.state];
        const transition = state?.transitions[procLoc.transitionIndex];
        if (!transition?.processors) return;
        transition.processors.splice(procLoc.processorIndex, 1);
        if (transition.processors.length === 0) delete transition.processors;
        return;
      }
      case "reorderProcessor": {
        const procLoc = locateProcessor(doc, patch.processorUuid);
        if (!procLoc) return;
        const wf = draft.workflows.find((w) => w.name === procLoc.workflow);
        const state = wf?.states[procLoc.state];
        const transition = state?.transitions[procLoc.transitionIndex];
        if (!transition?.processors) return;
        const [item] = transition.processors.splice(procLoc.processorIndex, 1);
        if (!item) return;
        transition.processors.splice(patch.toIndex, 0, item);
        return;
      }
      case "setCriterion": {
        // Apply a criterion change at the given host + path.
        const host = patch.host;
        const wf = draft.workflows.find((w) => w.name === host.workflow);
        if (!wf) return;
        let container: unknown;
        if (host.kind === "workflow") container = wf;
        else if (host.kind === "transition") {
          const state = wf.states[host.state];
          if (!state) return;
          const loc = locateTransition(doc, host.transitionUuid);
          if (!loc) return;
          container = state.transitions[loc.index];
        } else {
          // processorConfig not supported in v1 patch apply.
          return;
        }
        applyCriterionAtPath(
          container as Record<string, unknown>,
          patch.path,
          patch.criterion,
        );
        return;
      }
      case "setImportMode":
        draft.importMode = patch.mode;
        return;
      case "setEntity":
        draft.entity = patch.entity;
        return;
      case "replaceSession":
        draft.workflows = patch.session.workflows;
        draft.importMode = patch.session.importMode;
        draft.entity = patch.session.entity;
        return;
    }
  });

  const nextMeta = assignSyntheticIds(nextSession, doc.meta);
  preserveMovedTransitionUuid(doc, patch, nextSession, nextMeta);
  const cleanedWorkflowUi = cleanupWorkflowUi(nextMeta.workflowUi, nextSession, nextMeta);
  return {
    session: nextSession,
    meta: { ...nextMeta, workflowUi: cleanedWorkflowUi, revision: doc.meta.revision + 1 },
  };
}

/**
 * Convenience: apply multiple patches in sequence.
 */
export function applyPatches(
  doc: WorkflowEditorDocument,
  patches: DomainPatch[],
): WorkflowEditorDocument {
  return patches.reduce((d, p) => applyPatch(d, p), doc);
}

export function validateAfterPatch(
  doc: WorkflowEditorDocument,
): ValidationIssue[] {
  return validateSemantics(doc.session, doc);
}

// ----- helpers -----

function applySetEdgeAnchors(
  doc: WorkflowEditorDocument,
  patch: Extract<DomainPatch, { op: "setEdgeAnchors" }>,
): WorkflowEditorDocument {
  const ptr = doc.meta.ids.transitions[patch.transitionUuid];
  if (!ptr) return { ...doc, meta: { ...doc.meta, revision: doc.meta.revision + 1 } };

  const workflowUi = { ...doc.meta.workflowUi };
  const current = workflowUi[ptr.workflow] ?? {};
  const edgeAnchors = { ...(current.edgeAnchors ?? {}) };

  if (patch.anchors === null) {
    delete edgeAnchors[patch.transitionUuid];
  } else {
    edgeAnchors[patch.transitionUuid] = { ...patch.anchors };
  }

  workflowUi[ptr.workflow] = {
    ...current,
    edgeAnchors: Object.keys(edgeAnchors).length > 0 ? edgeAnchors : undefined,
  };

  return {
    session: doc.session,
    meta: {
      ...doc.meta,
      workflowUi,
      revision: doc.meta.revision + 1,
    },
  };
}

function applySetNodePosition(
  doc: WorkflowEditorDocument,
  patch: Extract<DomainPatch, { op: "setNodePosition" }>,
): WorkflowEditorDocument {
  const workflowUi = { ...doc.meta.workflowUi };
  const current = workflowUi[patch.workflow] ?? {};
  const nodes = { ...(current.layout?.nodes ?? {}) };
  nodes[patch.stateCode] = { x: patch.x, y: patch.y, pinned: patch.pinned ?? true };
  workflowUi[patch.workflow] = { ...current, layout: { nodes } };
  return {
    session: doc.session,
    meta: { ...doc.meta, workflowUi, revision: doc.meta.revision + 1 },
  };
}

function applyRemoveNodePosition(
  doc: WorkflowEditorDocument,
  patch: Extract<DomainPatch, { op: "removeNodePosition" }>,
): WorkflowEditorDocument {
  const workflowUi = { ...doc.meta.workflowUi };
  const current = workflowUi[patch.workflow] ?? {};
  const nodes = { ...(current.layout?.nodes ?? {}) };
  delete nodes[patch.stateCode];
  workflowUi[patch.workflow] = {
    ...current,
    layout: Object.keys(nodes).length > 0 ? { nodes } : undefined,
  };
  return {
    session: doc.session,
    meta: { ...doc.meta, workflowUi, revision: doc.meta.revision + 1 },
  };
}

function applyResetLayout(
  doc: WorkflowEditorDocument,
  patch: Extract<DomainPatch, { op: "resetLayout" }>,
): WorkflowEditorDocument {
  const workflowUi = { ...doc.meta.workflowUi };
  const current = workflowUi[patch.workflow] ?? {};
  workflowUi[patch.workflow] = { ...current, layout: undefined };
  return {
    session: doc.session,
    meta: { ...doc.meta, workflowUi, revision: doc.meta.revision + 1 },
  };
}

function applyAddComment(
  doc: WorkflowEditorDocument,
  patch: Extract<DomainPatch, { op: "addComment" }>,
): WorkflowEditorDocument {
  const workflowUi = { ...doc.meta.workflowUi };
  const current = workflowUi[patch.workflow] ?? {};
  const comments = { ...(current.comments ?? {}), [patch.comment.id]: patch.comment };
  workflowUi[patch.workflow] = { ...current, comments };
  return {
    session: doc.session,
    meta: { ...doc.meta, workflowUi, revision: doc.meta.revision + 1 },
  };
}

function applyUpdateComment(
  doc: WorkflowEditorDocument,
  patch: Extract<DomainPatch, { op: "updateComment" }>,
): WorkflowEditorDocument {
  const workflowUi = { ...doc.meta.workflowUi };
  const current = workflowUi[patch.workflow] ?? {};
  const existing = current.comments?.[patch.commentId];
  if (!existing) return { ...doc, meta: { ...doc.meta, revision: doc.meta.revision + 1 } };
  const updated: CommentMeta = { ...existing, ...patch.updates, id: existing.id };
  const comments = { ...(current.comments ?? {}), [patch.commentId]: updated };
  workflowUi[patch.workflow] = { ...current, comments };
  return {
    session: doc.session,
    meta: { ...doc.meta, workflowUi, revision: doc.meta.revision + 1 },
  };
}

function applyRemoveComment(
  doc: WorkflowEditorDocument,
  patch: Extract<DomainPatch, { op: "removeComment" }>,
): WorkflowEditorDocument {
  const workflowUi = { ...doc.meta.workflowUi };
  const current = workflowUi[patch.workflow] ?? {};
  const comments = { ...(current.comments ?? {}) };
  delete comments[patch.commentId];
  workflowUi[patch.workflow] = {
    ...current,
    comments: Object.keys(comments).length > 0 ? comments : undefined,
  };
  return {
    session: doc.session,
    meta: { ...doc.meta, workflowUi, revision: doc.meta.revision + 1 },
  };
}

function preserveMovedTransitionUuid(
  priorDoc: WorkflowEditorDocument,
  patch: DomainPatch,
  nextSession: WorkflowSession,
  nextMeta: WorkflowEditorDocument["meta"],
): void {
  if (patch.op !== "moveTransitionSource") return;
  const oldUuid = transitionUuidByName(
    priorDoc,
    patch.workflow,
    patch.fromState,
    patch.transitionName,
  );
  if (!oldUuid) return;
  const newUuid = transitionUuidByNameInSession(
    nextSession,
    nextMeta,
    patch.workflow,
    patch.toState,
    patch.transitionName,
  );
  if (!newUuid || newUuid === oldUuid) return;
  const newPtr = nextMeta.ids.transitions[newUuid];
  if (!newPtr) return;

  delete nextMeta.ids.transitions[newUuid];
  nextMeta.ids.transitions[oldUuid] = {
    ...newPtr,
    transitionUuid: oldUuid,
  };

  for (const processorPtr of Object.values(nextMeta.ids.processors)) {
    if (processorPtr.transitionUuid === newUuid) {
      processorPtr.transitionUuid = oldUuid;
    }
  }
  for (const criterionPtr of Object.values(nextMeta.ids.criteria)) {
    const host = criterionPtr.host;
    if (
      (host.kind === "transition" || host.kind === "processorConfig") &&
      host.transitionUuid === newUuid
    ) {
      host.transitionUuid = oldUuid;
    }
  }
}

function transitionUuidByName(
  doc: WorkflowEditorDocument,
  workflow: string,
  state: string,
  transitionName: string,
): string | null {
  return transitionUuidByNameInSession(doc.session, doc.meta, workflow, state, transitionName);
}

function transitionUuidByNameInSession(
  session: WorkflowSession,
  meta: WorkflowEditorDocument["meta"],
  workflow: string,
  state: string,
  transitionName: string,
): string | null {
  const wf = session.workflows.find((candidate) => candidate.name === workflow);
  const transitions = wf?.states[state]?.transitions ?? [];
  const index = transitions.findIndex((transition) => transition.name === transitionName);
  if (index < 0) return null;
  const ordered = Object.entries(meta.ids.transitions)
    .filter(([, ptr]) => ptr.workflow === workflow && ptr.state === state)
    .map(([uuid]) => uuid);
  return ordered[index] ?? null;
}

function renameStateCascading(wf: Workflow, from: string, to: string): void {
  if (!(from in wf.states) || from === to) return;
  wf.states[to] = wf.states[from]!;
  delete wf.states[from];
  for (const state of Object.values(wf.states)) {
    for (const t of state.transitions) {
      if (t.next === from) t.next = to;
    }
  }
  if (wf.initialState === from) wf.initialState = to;
}

function removeStateCascading(wf: Workflow, stateCode: string): void {
  if (!(stateCode in wf.states)) return;
  delete wf.states[stateCode];
  for (const state of Object.values(wf.states)) {
    state.transitions = state.transitions.filter((t) => t.next !== stateCode);
  }
  if (wf.initialState === stateCode) wf.initialState = "";
}

function locateTransition(
  doc: WorkflowEditorDocument,
  transitionUuid: string,
): { workflow: string; state: string; index: number } | null {
  const ptr = doc.meta.ids.transitions[transitionUuid];
  if (!ptr) return null;
  // We need the ordinal index of this transition within the state.
  // Build the list of transition UUIDs for the same (workflow, state) and find ours.
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
): {
  workflow: string;
  state: string;
  transitionIndex: number;
  processorIndex: number;
} | null {
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
  return {
    workflow: tLoc.workflow,
    state: tLoc.state,
    transitionIndex: tLoc.index,
    processorIndex: pIdx,
  };
}

/**
 * Remove stale layout positions and comments that reference states/transitions
 * no longer present in the session (e.g. after a replaceSession from a JSON edit).
 */
function cleanupWorkflowUi(
  workflowUi: Record<string, WorkflowUiMeta>,
  session: WorkflowSession,
  meta?: WorkflowEditorDocument["meta"],
): Record<string, WorkflowUiMeta> {
  const wfNames = new Set(session.workflows.map((w) => w.name));
  const result: Record<string, WorkflowUiMeta> = {};
  const validTransitionIdsByWorkflow = new Map<string, Set<string>>();
  if (meta) {
    for (const [uuid, ptr] of Object.entries(meta.ids.transitions)) {
      let set = validTransitionIdsByWorkflow.get(ptr.workflow);
      if (!set) {
        set = new Set<string>();
        validTransitionIdsByWorkflow.set(ptr.workflow, set);
      }
      set.add(uuid);
    }
  }

  for (const [wfName, ui] of Object.entries(workflowUi)) {
    if (!wfNames.has(wfName)) continue; // workflow deleted — drop its entire UI meta
    const wf = session.workflows.find((w) => w.name === wfName);
    const existingStates = wf ? new Set(Object.keys(wf.states)) : new Set<string>();
    const allTransitionNames = new Set<string>();
    if (wf) {
      for (const state of Object.values(wf.states)) {
        for (const t of state.transitions) allTransitionNames.add(t.name);
      }
    }

    // Clean layout nodes: remove positions for states that no longer exist.
    let layout = ui.layout;
    if (layout?.nodes) {
      const cleanNodes = Object.fromEntries(
        Object.entries(layout.nodes).filter(([code]) => existingStates.has(code)),
      );
      layout = Object.keys(cleanNodes).length > 0 ? { nodes: cleanNodes } : undefined;
    }

    // Clean comments: detach comments whose attached state/transition was removed.
    let comments = ui.comments;
    if (comments) {
      const cleanComments: Record<string, CommentMeta> = {};
      for (const [id, c] of Object.entries(comments)) {
        if (
          c.attachedTo?.kind === "state" && !existingStates.has(c.attachedTo.stateCode)
        ) {
          // Detach instead of delete — keep the note, just float it.
          cleanComments[id] = { ...c, attachedTo: { kind: "free" } };
        } else if (
          c.attachedTo?.kind === "transition" &&
          !allTransitionNames.has(c.attachedTo.transitionName)
        ) {
          cleanComments[id] = { ...c, attachedTo: { kind: "free" } };
        } else {
          cleanComments[id] = c;
        }
      }
      comments = Object.keys(cleanComments).length > 0 ? cleanComments : undefined;
    }

    let edgeAnchors = ui.edgeAnchors;
    if (edgeAnchors && meta) {
      const validTransitionIds = validTransitionIdsByWorkflow.get(wfName) ?? new Set<string>();
      const cleanAnchors = Object.fromEntries(
        Object.entries(edgeAnchors).filter(([transitionUuid]) =>
          validTransitionIds.has(transitionUuid),
        ),
      );
      edgeAnchors = Object.keys(cleanAnchors).length > 0 ? cleanAnchors : undefined;
    }

    result[wfName] = { ...ui, layout, comments, edgeAnchors };
  }

  return result;
}

function applyCriterionAtPath(
  container: Record<string, unknown>,
  path: string[],
  criterion: unknown,
): void {
  if (path.length === 0) return;
  let node = container;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!;
    const next = node[seg];
    if (next === undefined || next === null) return;
    if (Array.isArray(next)) {
      const idx = Number(path[i + 1]);
      const arr = next as unknown[];
      const target = arr[idx];
      if (target === undefined || typeof target !== "object") return;
      node = target as Record<string, unknown>;
      i++; // consumed both the array key and the index
    } else if (typeof next === "object") {
      node = next as Record<string, unknown>;
    } else {
      return;
    }
  }
  const lastSeg = path[path.length - 1]!;
  if (criterion === undefined) {
    delete node[lastSeg];
  } else {
    node[lastSeg] = criterion;
  }
}
