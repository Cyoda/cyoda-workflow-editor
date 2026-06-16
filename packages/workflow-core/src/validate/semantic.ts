import {
  CRITERION_DEPTH_WARNING_THRESHOLD,
  MAX_CRITERION_DEPTH,
  UNSUPPORTED_OPERATORS,
} from "../criteria/operators.js";
import { validateJsonPathSubset } from "../criteria/jsonPathSubset.js";
import { idFor as identityIdFor } from "../identity/id-for.js";
import { NAME_MAX_LENGTH } from "../schema/name.js";
import type { Criterion } from "../types/criterion.js";
import { OPERATOR_TYPES, type OperatorType } from "../types/operator.js";
import type { WorkflowEditorDocument } from "../types/editor.js";
import type { WorkflowSession } from "../types/session.js";
import type { ValidationIssue } from "../types/validation.js";
import type { Transition, Workflow } from "../types/workflow.js";
import { isValidName, walkCriteria } from "./helpers.js";

const LIFECYCLE_FIELDS = new Set(["state", "creationDate", "previousTransition"]);

/**
 * Operator warnings for a criterion's `operation` (issue #22).
 * - Unknown operator (outside the editor's known catalogue): non-blocking
 *   `operator-not-recognized` — preserved for round-trip, can't be validated.
 * - Known but engine-unimplemented: existing `unsupported-operator` warning.
 * Never an error: imports must always round-trip.
 */
function operatorWarnings(operation: string, where: CriterionLoc): ValidationIssue[] {
  if (!OPERATOR_TYPES.has(operation as OperatorType)) {
    return [
      {
        severity: "warning",
        code: "operator-not-recognized",
        message: `Operator "${operation}" is not in the editor's known operator set; it is preserved for round-trip but cannot be validated or edited (at ${describe(where)}).`,
        detail: { operation },
      },
    ];
  }
  if (UNSUPPORTED_OPERATORS.has(operation as OperatorType)) {
    return [
      {
        severity: "warning",
        code: "unsupported-operator",
        message: `Operator "${operation}" is not implemented by the engine (at ${describe(where)}).`,
        detail: { operation },
      },
    ];
  }
  return [];
}

/**
 * Full semantic validation over a workflow session.
 * Returns all issues found; never throws.
 */
export function validateSemantics(
  session: WorkflowSession,
  doc?: WorkflowEditorDocument,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...duplicateWorkflowNames(session));

  for (const wf of session.workflows) {
    issues.push(...validateWorkflow(wf, doc));
  }

  issues.push(...criterionRules(session));
  issues.push(...criterionDepthRules(session));
  issues.push(...automatedOrderingRules(session, doc));

  if (session.workflows.length === 1) {
    const only = session.workflows[0];
    if (only && only.criterion !== undefined) {
      issues.push({
        severity: "info",
        code: "unused-workflow-criterion",
        message:
          "Workflow-level criterion is set but the session has only one workflow.",
      });
    }
  }

  return issues;
}

function duplicateWorkflowNames(session: WorkflowSession): ValidationIssue[] {
  const seen = new Map<string, number>();
  for (const wf of session.workflows) {
    seen.set(wf.name, (seen.get(wf.name) ?? 0) + 1);
  }
  const out: ValidationIssue[] = [];
  for (const [name, count] of seen) {
    if (count > 1) {
      out.push({
        severity: "error",
        code: "duplicate-workflow-name",
        message: `Duplicate workflow name: "${name}" (appears ${count}×)`,
        detail: { name, count },
      });
    }
  }
  return out;
}

function validateWorkflow(
  wf: Workflow,
  doc?: WorkflowEditorDocument,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // missing-initial-state
  if (!wf.initialState || wf.initialState.length === 0) {
    issues.push({
      severity: "error",
      code: "missing-initial-state",
      message: `Workflow "${wf.name}" has no initialState.`,
      ...idFor(doc, wf.name, "workflow"),
    });
  } else if (!(wf.initialState in wf.states)) {
    issues.push({
      severity: "error",
      code: "unknown-initial-state",
      message: `Workflow "${wf.name}" initialState "${wf.initialState}" is not a state.`,
      ...idFor(doc, wf.name, "workflow"),
    });
  }

  // name regex
  if (!isValidName(wf.name)) {
    issues.push({
      severity: "error",
      code: "name-regex-violation",
      message: `Workflow name "${wf.name}" is invalid.`,
    });
  }
  issues.push(...nameLengthIssues(wf.name, `Workflow name "${wf.name}"`));

  for (const [stateCode, state] of Object.entries(wf.states)) {
    if (!isValidName(stateCode)) {
      issues.push({
        severity: "error",
        code: "name-regex-violation",
        message: `State code "${stateCode}" is invalid.`,
      });
    }
    issues.push(...nameLengthIssues(stateCode, `State code "${stateCode}"`));

    // duplicate transition names within a state
    const transitionSeen = new Map<string, number>();
    for (const t of state.transitions) {
      transitionSeen.set(t.name, (transitionSeen.get(t.name) ?? 0) + 1);
      if (!isValidName(t.name)) {
        issues.push({
          severity: "error",
          code: "name-regex-violation",
          message: `Transition name "${t.name}" is invalid.`,
        });
      }
      issues.push(...nameLengthIssues(t.name, `Transition name "${t.name}"`));
      if (!(t.next in wf.states)) {
        issues.push({
          severity: "error",
          code: "unknown-transition-target",
          message: `Transition "${t.name}" on "${stateCode}" targets unknown state "${t.next}".`,
        });
      }

      // duplicate processor names within a transition
      if (t.processors) {
        const pSeen = new Map<string, number>();
        for (const p of t.processors) {
          pSeen.set(p.name, (pSeen.get(p.name) ?? 0) + 1);
          if (!isValidName(p.name)) {
            issues.push({
              severity: "error",
              code: "name-regex-violation",
              message: `Processor name "${p.name}" is invalid.`,
            });
          }
          issues.push(...nameLengthIssues(p.name, `Processor name "${p.name}"`));
          if (
            p.type === "externalized" &&
            p.startNewTxOnDispatch === true &&
            p.executionMode !== "COMMIT_BEFORE_DISPATCH"
          ) {
            issues.push({
              severity: "warning",
              code: "start-new-tx-without-commit-before-dispatch",
              message: `Processor "${p.name}" sets startNewTxOnDispatch but executionMode is not COMMIT_BEFORE_DISPATCH.`,
            });
          }
          if (p.type === "externalized" && p.config) {
            if (
              p.config.crossoverToAsyncMs !== undefined &&
              p.config.asyncResult !== true
            ) {
              issues.push({
                severity: "warning",
                code: "crossover-without-async-result",
                message: `Processor "${p.name}" sets crossoverToAsyncMs but asyncResult is not true.`,
              });
            }
          }
        }
        for (const [name, count] of pSeen) {
          if (count > 1) {
            issues.push({
              severity: "error",
              code: "duplicate-processor-name",
              message: `Duplicate processor name "${name}" on transition "${t.name}".`,
            });
          }
        }
        if (t.processors.length > 5) {
          issues.push({
            severity: "warning",
            code: "processor-overload",
            message: `Transition "${t.name}" has ${t.processors.length} processors (>5).`,
          });
        }
      }

      // disabled-transition-on-active-workflow
      if (t.disabled && wf.active) {
        issues.push({
          severity: "warning",
          code: "disabled-transition-on-active-workflow",
          message: `Transition "${t.name}" is disabled in active workflow "${wf.name}".`,
        });
      }
    }
    for (const [name, count] of transitionSeen) {
      if (count > 1) {
        issues.push({
          severity: "error",
          code: "duplicate-transition-name",
          message: `Duplicate transition name "${name}" on state "${stateCode}".`,
        });
      }
    }

    // excessive-fan-out
    if (state.transitions.length > 8) {
      issues.push({
        severity: "warning",
        code: "excessive-fan-out",
        message: `State "${stateCode}" has ${state.transitions.length} outgoing transitions (>8).`,
      });
    }

    // all-transitions-manual
    if (
      state.transitions.length > 0 &&
      state.transitions.every((t) => t.manual === true)
    ) {
      issues.push({
        severity: "warning",
        code: "all-transitions-manual",
        message: `State "${stateCode}" has only manual transitions.`,
      });
    }

    // terminal-state-derived
    if (state.transitions.length === 0 && stateCode !== wf.initialState) {
      issues.push({
        severity: "info",
        code: "terminal-state-derived",
        message: `State "${stateCode}" is terminal.`,
      });
    }
  }

  // unreachable-state
  const reachable = reachableStates(wf);
  for (const stateCode of Object.keys(wf.states)) {
    if (!reachable.has(stateCode) && stateCode !== wf.initialState) {
      issues.push({
        severity: "warning",
        code: "unreachable-state",
        message: `State "${stateCode}" is unreachable from the initial state.`,
      });
    }
  }

  // workflow-inactive
  if (!wf.active) {
    issues.push({
      severity: "info",
      code: "workflow-inactive",
      message: `Workflow "${wf.name}" is inactive.`,
    });
  }

  // sync-on-likely-bottleneck-transition
  const reachableAuto = reachableAutoStates(wf);
  for (const [stateCode, state] of Object.entries(wf.states)) {
    if (!reachableAuto.has(stateCode)) continue;
    for (const t of state.transitions) {
      if (t.manual) continue;
      if (!t.processors) continue;
      for (const p of t.processors) {
        if (p.type === "externalized" && p.executionMode === "SYNC") {
          issues.push({
            severity: "warning",
            code: "sync-on-likely-bottleneck-transition",
            message: `SYNC processor "${p.name}" on auto-reachable transition "${t.name}" may block the main path.`,
          });
        }
      }
    }
  }

  return issues;
}

function criterionRules(session: WorkflowSession): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const { criterion, where } of walkCriteria(session)) {
    switch (criterion.type) {
      case "function":
        if (!criterion.function.name || criterion.function.name.length === 0) {
          issues.push({
            severity: "error",
            code: "function-missing-name",
            message: `Function criterion has empty name (at ${describe(where)}).`,
          });
        } else if (!isValidName(criterion.function.name)) {
          issues.push({
            severity: "error",
            code: "name-regex-violation",
            message: `Function criterion name "${criterion.function.name}" is invalid.`,
          });
        }
        if (!criterion.function.criterion) {
          issues.push({
            severity: "warning",
            code: "function-without-quick-exit",
            message: `Function criterion "${criterion.function.name}" has no local quick-exit criterion.`,
          });
        }
        break;
      case "array": {
        const arrPathCheck = validateJsonPathSubset(criterion.jsonPath);
        if (!arrPathCheck.ok) {
          issues.push({
            severity: "error",
            code: "invalid-jsonpath-subset",
            message: `Array criterion jsonPath "${criterion.jsonPath}" is not in the supported subset (${arrPathCheck.reason}) (at ${describe(where)}).`,
            detail: { jsonPath: criterion.jsonPath, reason: arrPathCheck.reason },
          });
        }
        for (const v of criterion.value) {
          if (typeof v !== "string") {
            issues.push({
              severity: "error",
              code: "array-non-string-value",
              message: `Array criterion value contains a non-string element.`,
            });
            break;
          }
        }
        issues.push(...operatorWarnings(criterion.operation, where));
        break;
      }
      case "lifecycle":
        if (!LIFECYCLE_FIELDS.has(criterion.field)) {
          issues.push({
            severity: "error",
            code: "lifecycle-invalid-field",
            message: `Lifecycle criterion field "${criterion.field}" is invalid.`,
          });
        }
        issues.push(...operatorWarnings(criterion.operation, where));
        break;
      case "group":
        if (criterion.operator === "NOT") {
          issues.push({
            severity: "warning",
            code: "unsupported-group-operator",
            message: `Group operator "NOT" is not implemented by the engine (at ${describe(where)}).`,
            detail: { operator: "NOT" },
          });
          if (criterion.conditions.length > 1) {
            issues.push({
              severity: "warning",
              code: "not-with-multiple-conditions",
              message: `NOT group has ${criterion.conditions.length} conditions; should have exactly one.`,
            });
          }
        }
        break;
      case "simple": {
        const pathCheck = validateJsonPathSubset(criterion.jsonPath);
        if (!pathCheck.ok) {
          issues.push({
            severity: "error",
            code: "invalid-jsonpath-subset",
            message: `Simple criterion jsonPath "${criterion.jsonPath}" is not in the supported subset (${pathCheck.reason}) (at ${describe(where)}).`,
            detail: { jsonPath: criterion.jsonPath, reason: pathCheck.reason },
          });
        } else if (criterion.jsonPath.startsWith("$._meta")) {
          // Spec §5: lifecycle metadata is only accessible via LifecycleCondition;
          // a SimpleCondition on `$._meta.*` resolves to a literal data field and
          // will never match.
          issues.push({
            severity: "warning",
            code: "lifecycle-path-in-simple",
            message: `Simple criterion path "${criterion.jsonPath}" looks like a lifecycle path; use a lifecycle criterion instead (at ${describe(where)}).`,
            detail: { jsonPath: criterion.jsonPath },
          });
        }

        issues.push(...operatorWarnings(criterion.operation, where));

        if (criterion.operation === "BETWEEN" || criterion.operation === "BETWEEN_INCLUSIVE") {
          if (!Array.isArray(criterion.value) || criterion.value.length !== 2) {
            issues.push({
              severity: "error",
              code: "simple-between-shape",
              message: `Operator "${criterion.operation}" requires a two-element [low, high] array value (at ${describe(where)}).`,
              detail: { operation: criterion.operation },
            });
          }
        }

        if (
          criterion.operation === "LIKE" &&
          typeof criterion.value === "string" &&
          /[%_]/.test(criterion.value)
        ) {
          // Spec §3.1: LIKE has no escape mechanism; `%` and `_` are always
          // wildcards.
          issues.push({
            severity: "warning",
            code: "like-wildcard-warning",
            message: `LIKE pattern contains "%" or "_" which are always wildcards (no escape mechanism) (at ${describe(where)}).`,
          });
        }

        if (
          criterion.operation === "MATCHES_PATTERN" &&
          typeof criterion.value === "string" &&
          criterion.value.length > 0 &&
          !criterion.value.startsWith("^") &&
          !criterion.value.endsWith("$")
        ) {
          // Spec §3.1: MATCHES_PATTERN has no implicit anchoring.
          issues.push({
            severity: "warning",
            code: "matches-pattern-unanchored",
            message: `MATCHES_PATTERN regex is unanchored; include "^"/"$" for whole-string match (at ${describe(where)}).`,
          });
        }
        break;
      }
    }
  }
  return issues;
}

function criterionDepthRules(session: WorkflowSession): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const wf of session.workflows) {
    if (wf.criterion) {
      pushDepthIssue(issues, criterionMaxDepth(wf.criterion), {
        kind: "workflow",
        workflow: wf.name,
      });
    }
    for (const [stateCode, state] of Object.entries(wf.states)) {
      for (let i = 0; i < state.transitions.length; i++) {
        const t = state.transitions[i]!;
        if (!t.criterion) continue;
        pushDepthIssue(issues, criterionMaxDepth(t.criterion), {
          kind: "transition",
          workflow: wf.name,
          state: stateCode,
          transitionIndex: i,
          transitionName: t.name,
        });
      }
    }
  }
  return issues;
}

function pushDepthIssue(
  issues: ValidationIssue[],
  maxDepth: number,
  where: CriterionLoc,
): void {
  if (maxDepth >= MAX_CRITERION_DEPTH) {
    issues.push({
      severity: "error",
      code: "criterion-depth-limit",
      message: `Criterion tree depth ${maxDepth} exceeds engine limit ${MAX_CRITERION_DEPTH} (at ${describe(where)}).`,
      detail: { maxDepth, threshold: MAX_CRITERION_DEPTH },
    });
  }
  if (maxDepth >= CRITERION_DEPTH_WARNING_THRESHOLD) {
    issues.push({
      severity: "warning",
      code: "criterion-depth-warning",
      message: `Criterion tree depth ${maxDepth} is hard to read; consider flattening (at ${describe(where)}).`,
      detail: { maxDepth, threshold: CRITERION_DEPTH_WARNING_THRESHOLD },
    });
  }
}

function criterionMaxDepth(root: Criterion): number {
  // Iterative DFS: each frame is { node, depth }.
  const stack: { node: Criterion; depth: number }[] = [{ node: root, depth: 1 }];
  let max = 0;
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > max) max = depth;
    if (node.type === "group") {
      for (const child of node.conditions) stack.push({ node: child, depth: depth + 1 });
    } else if (node.type === "function" && node.function.criterion) {
      stack.push({ node: node.function.criterion, depth: depth + 1 });
    }
  }
  return max;
}

function reachableStates(wf: Workflow): Set<string> {
  const visited = new Set<string>();
  if (!(wf.initialState in wf.states)) return visited;
  const queue: string[] = [wf.initialState];
  visited.add(wf.initialState);
  while (queue.length) {
    const cur = queue.shift()!;
    const state = wf.states[cur];
    if (!state) continue;
    for (const t of state.transitions) {
      if (!visited.has(t.next) && t.next in wf.states) {
        visited.add(t.next);
        queue.push(t.next);
      }
    }
  }
  return visited;
}

function reachableAutoStates(wf: Workflow): Set<string> {
  // States reachable from initial without traversing a manual gate.
  const visited = new Set<string>();
  if (!(wf.initialState in wf.states)) return visited;
  const queue: string[] = [wf.initialState];
  visited.add(wf.initialState);
  while (queue.length) {
    const cur = queue.shift()!;
    const state = wf.states[cur];
    if (!state) continue;
    for (const t of state.transitions) {
      if (t.manual) continue;
      if (!visited.has(t.next) && t.next in wf.states) {
        visited.add(t.next);
        queue.push(t.next);
      }
    }
  }
  return visited;
}

/**
 * cyoda-go v0.8.0 caps every name at {@link NAME_MAX_LENGTH} characters and
 * rejects an over-long name with a 400. Mirror that as a blocking issue so the
 * editor stops a save before it reaches the server.
 */
function nameLengthIssues(name: string, label: string): ValidationIssue[] {
  if (name.length <= NAME_MAX_LENGTH) return [];
  return [
    {
      severity: "error",
      code: "name-too-long",
      message: `${label} exceeds the ${NAME_MAX_LENGTH}-character limit (${name.length}).`,
      detail: { length: name.length, max: NAME_MAX_LENGTH },
    },
  ];
}

type CriterionLoc =
  | { kind: "workflow"; workflow: string }
  | {
      kind: "transition";
      workflow: string;
      state: string;
      transitionIndex: number;
      transitionName: string;
    };

function describe(w: CriterionLoc): string {
  if (w.kind === "workflow") return `workflow "${w.workflow}"`;
  return `transition "${w.transitionName}" on "${w.workflow}:${w.state}"`;
}

function idFor(
  doc: WorkflowEditorDocument | undefined,
  workflowName: string,
  _kind: "workflow",
): { targetId?: string } {
  if (!doc) return {};
  const id = doc.meta.ids.workflows[workflowName];
  return id ? { targetId: id } : {};
}

function transitionTargetId(
  doc: WorkflowEditorDocument | undefined,
  workflow: string,
  state: string,
  declarationIndex: number,
): { targetId?: string } {
  if (!doc) return {};
  const id = identityIdFor(doc.meta, {
    kind: "transition",
    workflow,
    state,
    transitionName: "",
    ordinal: declarationIndex,
  });
  return id ? { targetId: id } : {};
}

function automatedOrderingRules(
  session: WorkflowSession,
  doc?: WorkflowEditorDocument,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const wf of session.workflows) {
    for (const [stateCode, state] of Object.entries(wf.states)) {
      const automated: Array<{ index: number; t: Transition }> = [];
      state.transitions.forEach((t, index) => {
        if (t.manual !== true && t.disabled !== true) {
          automated.push({ index, t });
        }
      });

      const nullIdx = automated.findIndex(({ t }) => t.criterion === undefined);
      if (nullIdx === -1 || nullIdx === automated.length - 1) continue;

      const nullEntry = automated[nullIdx]!;
      issues.push({
        severity: "warning",
        code: "null-criterion-not-last",
        message: `Transition "${nullEntry.t.name}" on state "${stateCode}" is automated and has no criterion, so it always fires; later automated transitions on this state are unreachable.`,
        ...transitionTargetId(doc, wf.name, stateCode, nullEntry.index),
        detail: {
          workflow: wf.name,
          state: stateCode,
          transitionName: nullEntry.t.name,
        },
      });

      for (let j = nullIdx + 1; j < automated.length; j++) {
        const dead = automated[j]!;
        issues.push({
          severity: "warning",
          code: "unreachable-automated-transition",
          message: `Transition "${dead.t.name}" on state "${stateCode}" is unreachable: an earlier automated transition ("${nullEntry.t.name}") has no criterion and will always fire first.`,
          ...transitionTargetId(doc, wf.name, stateCode, dead.index),
          detail: {
            workflow: wf.name,
            state: stateCode,
            transitionName: dead.t.name,
            blockedBy: nullEntry.t.name,
          },
        });
      }
    }
  }
  return issues;
}
