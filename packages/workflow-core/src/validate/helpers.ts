import { NAME_REGEX } from "../schema/name.js";
import { MAX_CRITERION_DEPTH } from "../criteria/operators.js";
import type { Criterion } from "../types/criterion.js";
import type { WorkflowSession } from "../types/session.js";
import type { Transition, Workflow } from "../types/workflow.js";

export function isValidName(name: string): boolean {
  return NAME_REGEX.test(name);
}

/**
 * Walk every criterion node (pre-order) across a workflow session.
 * Yields the criterion, a breadcrumb describing where it was found, and the
 * node's parent (absent for a root criterion).
 */
export function* walkCriteria(session: WorkflowSession): Generator<CriterionVisit> {
  for (const wf of session.workflows) {
    if (wf.criterion) {
      yield* walkInner(wf.criterion, { kind: "workflow", workflow: wf.name });
    }
    for (const [stateCode, state] of Object.entries(wf.states)) {
      for (let i = 0; i < state.transitions.length; i++) {
        const t = state.transitions[i]!;
        if (t.criterion) {
          yield* walkInner(t.criterion, {
            kind: "transition",
            workflow: wf.name,
            state: stateCode,
            transitionIndex: i,
            transitionName: t.name,
          });
        }
      }
    }
  }
}

export type CriterionLocation =
  | { kind: "workflow"; workflow: string }
  | {
      kind: "transition";
      workflow: string;
      state: string;
      transitionIndex: number;
      transitionName: string;
    };

export interface CriterionVisit {
  criterion: Criterion;
  where: CriterionLocation;
  parent?: Criterion;
}

function* walkInner(
  c: Criterion,
  where: CriterionLocation,
  depth = 0,
  parent?: Criterion,
): Generator<CriterionVisit> {
  yield parent ? { criterion: c, where, parent } : { criterion: c, where };
  if (depth >= MAX_CRITERION_DEPTH) {
    // Tree already exceeds the engine limit. The iterative criterionMaxDepth
    // check in criterionDepthRules will report the error; stop here to
    // prevent a stack overflow on pathologically nested input.
    return;
  }
  if (c.type === "group") {
    for (const child of c.conditions) yield* walkInner(child, where, depth + 1, c);
  } else if (c.type === "function" && c.function.criterion) {
    yield* walkInner(c.function.criterion, where, depth + 1, c);
  }
}

export function* walkTransitions(
  wf: Workflow,
): Generator<{ state: string; transition: Transition; index: number }> {
  for (const [stateCode, state] of Object.entries(wf.states)) {
    for (let i = 0; i < state.transitions.length; i++) {
      yield { state: stateCode, transition: state.transitions[i]!, index: i };
    }
  }
}

export function transitionNames(wf: Workflow): string[] {
  const out: string[] = [];
  for (const state of Object.values(wf.states)) {
    for (const t of state.transitions) out.push(t.name);
  }
  return out;
}
