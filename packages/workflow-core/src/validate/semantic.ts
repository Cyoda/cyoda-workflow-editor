import {
  CRITERION_DEPTH_WARNING_THRESHOLD,
  MAX_CRITERION_DEPTH,
  TEMPORAL_LIFECYCLE_FIELDS,
  TEMPORAL_OPERATORS,
  UNSUPPORTED_OPERATORS,
} from "../criteria/operators.js";
import { validateJsonPathSubset } from "../criteria/jsonPathSubset.js";
import {
  isTemporalOperand,
  likePatternError,
  matchesPatternIssue,
} from "../criteria/patterns.js";
import { LIFECYCLE_FIELDS as LIFECYCLE_FIELD_LIST } from "../schema/criterion.js";
import { getDialect, LATEST_CYODA_VERSION, type CyodaDialect } from "../dialect/index.js";
import { findUnguardedCycles } from "./cycles.js";
import { requiredSchemaMinor } from "./schema-features.js";
import { idFor as identityIdFor } from "../identity/id-for.js";
import { NAME_MAX_LENGTH } from "../schema/name.js";
import type { Criterion } from "../types/criterion.js";
import { OPERATOR_TYPES, type OperatorType } from "../types/operator.js";
import type { WorkflowEditorDocument } from "../types/editor.js";
import type { WorkflowSession } from "../types/session.js";
import type { ValidationIssue } from "../types/validation.js";
import type { Transition, Workflow } from "../types/workflow.js";
import { isValidName, walkCriteria } from "./helpers.js";

const LIFECYCLE_FIELDS: ReadonlySet<string> = new Set(LIFECYCLE_FIELD_LIST);

/** Processor config `retryPolicy` values cyoda-go accepts; anything else is a hard 400. */
const RETRY_POLICIES = new Set(["NONE", "FIXED", ""]);

export const ANNOTATIONS_MAX_BYTES = 64 * 1024;

/**
 * Grammar for the in-document workflow schema `version` tag, mirrored exactly
 * from the server (spec §4): MAJOR.MINOR, no leading zeros.
 */
const TAG_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

/**
 * Operator warnings for a criterion's `operation` (issue #22).
 * - Unknown operator (outside the editor's known catalogue): non-blocking
 *   `operator-not-recognized` — preserved for round-trip, can't be validated.
 * - Known but not implemented by cyoda-go (`IS_CHANGED` / `IS_UNCHANGED`):
 *   `unsupported-operator`.
 * cyoda-go 0.8.4 rejects both at import (`unknown operatorType`), but Cyoda
 * Cloud's operator set is wider, so these stay warnings (backend-conditional —
 * see docs/validation-rules.md) and imports always round-trip.
 */
function operatorWarnings(operation: string, where: CriterionLoc): ValidationIssue[] {
  if (!OPERATOR_TYPES.has(operation as OperatorType)) {
    return [
      {
        severity: "warning",
        code: "operator-not-recognized",
        message: `Operator "${operation}" is not in the editor's known operator set; it is preserved for round-trip but cannot be validated or edited. cyoda-go rejects it at import; Cyoda Cloud may accept it (at ${describe(where)}).`,
        detail: { operation },
      },
    ];
  }
  if (UNSUPPORTED_OPERATORS.has(operation as OperatorType)) {
    return [
      {
        severity: "warning",
        code: "unsupported-operator",
        message: `Operator "${operation}" is not implemented by cyoda-go, which rejects it at import (at ${describe(where)}).`,
        detail: { operation },
      },
    ];
  }
  return [];
}

/**
 * Pattern-operand checks shared by simple and lifecycle criteria. cyoda-go
 * 0.8.4 validates both pattern operators at import. The LIKE rule is an exact
 * mirror (error); the MATCHES_PATTERN rule approximates Go's RE2 in JS and is
 * therefore a warning.
 */
function patternIssues(operation: string, value: unknown, where: CriterionLoc): ValidationIssue[] {
  if (operation === "LIKE") {
    const reason = likePatternError(value);
    if (reason) {
      return [
        {
          severity: "error",
          code: "like-pattern-invalid",
          message: `LIKE pattern ${JSON.stringify(value)} is invalid: ${reason}. For a literal trailing backslash, end the pattern with two backslash characters (at ${describe(where)}).`,
          detail: { operation, reason },
        },
      ];
    }
  } else if (operation === "MATCHES_PATTERN") {
    const reason = matchesPatternIssue(value);
    if (reason) {
      return [
        {
          severity: "warning",
          code: "matches-pattern-invalid",
          message: `MATCHES_PATTERN operand ${JSON.stringify(value)} is probably not a valid RE2 pattern (${reason}); cyoda-go rejects invalid patterns at import (at ${describe(where)}).`,
          detail: { operation, reason },
        },
      ];
    }
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

  // Resolve the target dialect ONCE, and never let its throw escape: this
  // function is documented to never throw, and `validateAll` /
  // `validateAfterPatch` / the React derive path all call it without a
  // try/catch, so a throw here tears the editor down mid-render. It is not
  // hypothetical — every document saved by a pre-0.8.3 build of this library
  // carries `meta.cyodaVersion: "0.7"`, and that dialect was removed. Report
  // it instead, so a user whose document names a dialect this build cannot
  // resolve is told rather than left with rules silently not running.
  const cyodaVersion = doc?.meta.cyodaVersion ?? LATEST_CYODA_VERSION;
  let dialect: CyodaDialect | undefined;
  try {
    dialect = getDialect(cyodaVersion);
  } catch (e) {
    issues.push({
      severity: "info",
      code: "cyoda-version-unresolvable",
      message: `This document targets cyoda-go schema dialect "${cyodaVersion}", which is not registered, so workflow schema version-tag checks are skipped. ${(e as Error).message}`,
    });
  }

  issues.push(...duplicateWorkflowNames(session));

  for (const wf of session.workflows) {
    issues.push(...validateWorkflow(wf, doc, dialect));

    // unguarded-automated-cycle (spec §4): warning, not error — cyoda-go runs
    // cycle detection against the merged STORED result, not the payload, so a
    // MERGE can be rejected over a cycle in a workflow this document does not
    // contain. Necessary but not sufficient; a rule that cannot be complete
    // must not block a save. No `wf.active` check: the server does not skip
    // inactive workflows during cycle detection.
    if (session.allowCycles !== true) {
      // Both the cycle count and each cycle's path are capped by
      // `findUnguardedCycles` — a pathological workflow otherwise renders tens
      // of thousands of multi-KB messages into the issues drawer. Say so in the
      // message wherever output was cut, so a truncated report never reads as a
      // complete one.
      const report = findUnguardedCycles(wf);
      for (const cycle of report.cycles) {
        const omitted = cycle.length - cycle.path.length;
        const rendered =
          cycle.path.join(" -> ") +
          (omitted > 0 ? ` -> ... (${omitted} more states omitted)` : "");
        issues.push({
          severity: "warning",
          code: "unguarded-automated-cycle",
          message: `Workflow "${wf.name}": infinite loop detected: ${rendered} via unguarded automated transitions. cyoda-go rejects this import unless allowCycles is set.`,
          ...idFor(doc, wf.name, "workflow"),
        });
      }
      if (report.total > report.cycles.length) {
        issues.push({
          severity: "warning",
          code: "unguarded-automated-cycle",
          message: `Workflow "${wf.name}": ${report.total} unguarded automated cycles detected; only the first ${report.cycles.length} are listed. cyoda-go rejects this import unless allowCycles is set.`,
          ...idFor(doc, wf.name, "workflow"),
        });
      }
    }
  }

  issues.push(...criterionRules(session));
  issues.push(...criterionDepthRules(session));
  issues.push(...automatedOrderingRules(session, doc));
  issues.push(...annotationsSizeIssues(session, doc));

  if (session.workflows.length === 1) {
    const only = session.workflows[0];
    // `!= null` rather than `!== undefined`: same predicate mismatch already
    // fixed in `validate/cycles.ts` and at automatedOrderingRules below.
    // `validateSemantics` is public API and `validateAfterPatch` calls it
    // with zero normalization, so an explicit `criterion: null` (what the
    // server emits, and what a hand-edited document carries) must read the
    // same as an absent key — not as "set" — or the rule fires spuriously.
    if (only && only.criterion != null) {
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
  dialect?: CyodaDialect,
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

  // workflow schema version tag (spec §4)
  // `dialect` is undefined when the document names one this build cannot
  // resolve; `validateSemantics` has already reported that once as
  // `cyoda-version-unresolvable`. Skip the rule rather than guessing which
  // tags some unknown server accepts.
  if (dialect) {
    const accepted = dialect.acceptedSchemaVersions;
    // Absent means this server does not validate the tag — skip entirely.
    if (accepted) {
      const m = TAG_RE.exec(wf.version);
      if (!m) {
        issues.push({
          severity: "error",
          code: "workflow-schema-version-malformed",
          message: `Workflow "${wf.name}": workflow schema version "${wf.version}" is not in MAJOR.MINOR form.`,
          ...idFor(doc, wf.name, "workflow"),
        });
      } else {
        const major = Number(m[1]);
        const minor = Number(m[2]);
        const range = accepted.find((r) => r.major === major);
        if (!range) {
          issues.push({
            severity: "error",
            code: "workflow-schema-version-malformed",
            message: `Workflow "${wf.name}": workflow schema major version ${major} unsupported on this server; supported majors: [${accepted.map((r) => r.major).join(", ")}].`,
            ...idFor(doc, wf.name, "workflow"),
          });
        } else if (minor > range.maxMinor) {
          issues.push({
            severity: "error",
            code: "workflow-schema-version-malformed",
            message: `Workflow "${wf.name}": this server supports workflow schema up to ${range.major}.${range.maxMinor}; payload declares ${wf.version}.`,
            ...idFor(doc, wf.name, "workflow"),
          });
        } else if (minor < range.minMinor) {
          // Warning, not error: the user must open the file to fix it, and
          // rewriting it silently would churn bytes they did not ask to change.
          issues.push({
            severity: "warning",
            code: "workflow-schema-version-outdated",
            message: `Workflow "${wf.name}": workflow schema ${wf.version} is no longer accepted; minimum supported in major ${range.major} is ${range.major}.${range.minMinor}.`,
            ...idFor(doc, wf.name, "workflow"),
            fix: {
              label: `Update schema version to ${dialect.schemaVersionTag}`,
              apply: (d) => ({
                ...d,
                session: {
                  ...d.session,
                  workflows: d.session.workflows.map((w) =>
                    w.name === wf.name ? { ...w, version: dialect.schemaVersionTag } : w,
                  ),
                },
                meta: { ...d.meta, revision: d.meta.revision + 1 },
              }),
            },
          });
        } else if (major === 1) {
          // The tag must cover every feature the workflow uses (see
          // schema-features.ts). cyoda-go does not enforce this, but a tag
          // below the workflow's features misstates its contract.
          const required = requiredSchemaMinor(wf);
          if (minor < required.minor) {
            const tag = `1.${required.minor}`;
            issues.push({
              severity: "error",
              code: "workflow-schema-version-below-features",
              message: `Workflow "${wf.name}": uses ${required.features.join(", ")}, which requires workflow schema ${tag}; it declares ${wf.version}.`,
              ...idFor(doc, wf.name, "workflow"),
              detail: { declared: wf.version, required: tag, features: required.features },
              fix: {
                label: `Update schema version to ${tag}`,
                apply: (d) => ({
                  ...d,
                  session: {
                    ...d.session,
                    workflows: d.session.workflows.map((w) =>
                      w.name === wf.name ? { ...w, version: tag } : w,
                    ),
                  },
                  meta: { ...d.meta, revision: d.meta.revision + 1 },
                }),
              },
            });
          }
        }
      }
    }
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
    for (const [index, t] of state.transitions.entries()) {
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
          ...transitionTargetId(doc, wf.name, stateCode, index),
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
            p.config?.startNewTxOnDispatch === true &&
            p.executionMode !== "COMMIT_BEFORE_DISPATCH"
          ) {
            issues.push({
              severity: "error",
              code: "start-new-tx-without-commit-before-dispatch",
              message: `Processor "${p.name}": startNewTxOnDispatch=true is only valid with executionMode=COMMIT_BEFORE_DISPATCH (got "${p.executionMode ?? ""}").`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          }
          if (p.config?.retryPolicy !== undefined && !RETRY_POLICIES.has(p.config.retryPolicy)) {
            issues.push({
              severity: "error",
              code: "unknown-retry-policy",
              message: `Processor "${p.name}": unknown retryPolicy "${p.config.retryPolicy}" (allowed: NONE, FIXED, or empty).`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          }
          if (p.config?.asyncResult === true) {
            issues.push({
              severity: "warning",
              code: "async-result-unsupported",
              message: `Processor "${p.name}": asyncResult=true is rejected by cyoda-go; supported on Cyoda Cloud only.`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          }
          if (p.config?.crossoverToAsyncMs !== undefined) {
            issues.push({
              severity: "warning",
              code: "crossover-unsupported",
              message: `Processor "${p.name}": crossoverToAsyncMs is rejected by cyoda-go; supported on Cyoda Cloud only.`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          }
          if (p.type === "internalized") {
            issues.push({
              severity: "warning",
              code: "processor-type-internalized",
              message: `Processor "${p.name}" uses the reserved type "internalized". cyoda-go accepts it at import but rejects it at dispatch with WORKFLOW_FAILED, so any transition firing this processor will fail at runtime.`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          } else if (p.type !== "externalized" && p.type !== "") {
            issues.push({
              severity: "warning",
              code: "processor-type-non-canonical",
              message: `Processor "${p.name}" has a non-canonical type "${p.type}". cyoda-go accepts it today and treats it as externalized, but this permissiveness is documented as narrowing in a future release.`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          }
        }
        for (const [name, count] of pSeen) {
          if (count > 1) {
            issues.push({
              severity: "error",
              code: "duplicate-processor-name",
              message: `Duplicate processor name "${name}" on transition "${t.name}".`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          }
        }
        if (t.processors.length > 5) {
          issues.push({
            severity: "info",
            code: "processor-overload",
            message: `Transition "${t.name}" has ${t.processors.length} processors (>5).`,
            ...transitionTargetId(doc, wf.name, stateCode, index),
          });
        }
      }

      // scheduled-transition rules (spec §4)
      if (t.schedule !== undefined) {
        // `null` is treated as absent for each mode field, matching the
        // dialect's own null-stripping elsewhere: a mode key present but
        // explicitly null is not a mode. This block runs on the canonical
        // model, which can arrive via `applyPatch` (a `Partial<Transition>`
        // that bypasses Zod) as well as the parse path, so it can't assume
        // Zod already ruled out `null`/missing string fields — nor that the
        // dialect's `delayMs <= 0` drop has run. cyoda-go's own presence test
        // is `> 0`, so a `delayMs: 0` reaching here via applyPatch is zero
        // modes to the server and must be zero modes here too.
        const modes = [
          typeof t.schedule.delayMs === "number" && t.schedule.delayMs > 0,
          t.schedule.function !== undefined && t.schedule.function !== null,
        ].filter(Boolean).length;
        if (modes !== 1) {
          issues.push({
            severity: "error",
            code: "schedule-mode-required",
            message: `Transition "${t.name}": exactly one of schedule.delayMs or schedule.function is required.`,
            ...transitionTargetId(doc, wf.name, stateCode, index),
          });
        }
        if (t.manual === true) {
          issues.push({
            severity: "error",
            code: "schedule-manual-conflict",
            message: `Transition "${t.name}": manual and scheduled are mutually exclusive.`,
            ...transitionTargetId(doc, wf.name, stateCode, index),
          });
        }
        const fn = t.schedule.function;
        if (
          fn &&
          ((fn.name ?? "").trim() === "" || (fn.calculationNodesTags ?? "").trim() === "")
        ) {
          issues.push({
            severity: "error",
            code: "schedule-function-incomplete",
            message: `Transition "${t.name}": schedule.function requires name and calculationNodesTags.`,
            ...transitionTargetId(doc, wf.name, stateCode, index),
          });
        }
        if (t.schedule.timeoutMs !== undefined && t.schedule.timeoutMs < 0) {
          issues.push({
            severity: "warning",
            code: "schedule-timeout-negative",
            message: `Transition "${t.name}": a negative timeoutMs behaves like 0 (drop on any lateness).`,
            ...transitionTargetId(doc, wf.name, stateCode, index),
          });
        }
      }

      // disabled-transition-on-active-workflow
      if (t.disabled && wf.active) {
        issues.push({
          severity: "info",
          code: "disabled-transition-on-active-workflow",
          message: `Transition "${t.name}" is disabled in active workflow "${wf.name}".`,
          ...transitionTargetId(doc, wf.name, stateCode, index),
        });
      }
    }
    for (const [name, count] of transitionSeen) {
      if (count > 1) {
        issues.push({
          severity: "error",
          code: "duplicate-transition-name",
          message: `Duplicate transition name "${name}" on state "${stateCode}".`,
          ...stateTargetId(doc, wf.name, stateCode),
        });
      }
    }

    // excessive-fan-out
    if (state.transitions.length > 8) {
      issues.push({
        severity: "info",
        code: "excessive-fan-out",
        message: `State "${stateCode}" has ${state.transitions.length} outgoing transitions (>8).`,
        ...stateTargetId(doc, wf.name, stateCode),
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
        ...stateTargetId(doc, wf.name, stateCode),
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

  return issues;
}

function criterionRules(session: WorkflowSession): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const { criterion, where, parent } of walkCriteria(session)) {
    switch (criterion.type) {
      case "function":
        if (parent?.type === "group") {
          issues.push({
            severity: "warning",
            code: "function-criterion-in-group",
            message: `Function criterion "${criterion.function.name}" is nested inside a group; cyoda-go requires a function criterion to be the whole criterion and fails the evaluation otherwise (at ${describe(where)}).`,
          });
        }
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
            severity: "info",
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
        } else if (!criterion.jsonPath.endsWith("[*]")) {
          issues.push({
            severity: "error",
            code: "array-path-not-wildcard",
            message: `Array criterion jsonPath "${criterion.jsonPath}" must end in [*] — it addresses the array's elements, and cyoda-go rejects any other path at import (at ${describe(where)}).`,
            detail: { jsonPath: criterion.jsonPath },
          });
        }
        for (const v of criterion.value) {
          if (v !== null && typeof v === "object") {
            issues.push({
              severity: "error",
              code: "array-non-scalar-value",
              message: `Array criterion value contains an object or array; each entry must be a scalar or null (at ${describe(where)}).`,
            });
            break;
          }
        }
        if (criterion.operation !== undefined) {
          issues.push(...operatorWarnings(criterion.operation, where));
        }
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
        issues.push(...patternIssues(criterion.operation, criterion.value, where));
        if (TEMPORAL_LIFECYCLE_FIELDS.has(criterion.field)) {
          if (!TEMPORAL_OPERATORS.has(criterion.operation as OperatorType)) {
            // Warning, not error: cyoda-go rejects it at import, but a pushdown
            // evaluator matches the field's RFC3339 text lexically, so another
            // backend may accept it.
            issues.push({
              severity: "warning",
              code: "lifecycle-temporal-operator",
              message: `Operator "${criterion.operation}" is not valid on temporal field "${criterion.field}"; cyoda-go accepts only comparison, range and null-presence operators there and rejects this at import (at ${describe(where)}).`,
              detail: { field: criterion.field, operation: criterion.operation },
            });
          } else if (criterion.operation !== "IS_NULL" && criterion.operation !== "NOT_NULL") {
            const operands = Array.isArray(criterion.value) ? criterion.value : [criterion.value];
            const bad = operands.find((v) => v !== null && v !== undefined && !isTemporalOperand(v));
            if (bad !== undefined) {
              issues.push({
                severity: "warning",
                code: "lifecycle-temporal-operand",
                message: `Operand ${JSON.stringify(bad)} for temporal field "${criterion.field}" does not look like a date, date-time or time; cyoda-go rejects operands it cannot parse as temporal (at ${describe(where)}).`,
                detail: { field: criterion.field },
              });
            }
          }
        }
        break;
      case "group":
        if (criterion.operator === "NOT" && criterion.conditions.length !== 1) {
          issues.push({
            severity: "error",
            code: "not-with-multiple-conditions",
            message: `NOT group has ${criterion.conditions.length} conditions; NOT takes exactly one — nest an AND/OR group to negate several (at ${describe(where)}).`,
            detail: { count: criterion.conditions.length },
          });
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
            severity: "info",
            code: "lifecycle-path-in-simple",
            message: `Simple criterion path "${criterion.jsonPath}" looks like a lifecycle path; use a lifecycle criterion instead (at ${describe(where)}).`,
            detail: { jsonPath: criterion.jsonPath },
          });
        }

        issues.push(...operatorWarnings(criterion.operation, where));
        issues.push(...patternIssues(criterion.operation, criterion.value, where));

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

function stateTargetId(
  doc: WorkflowEditorDocument | undefined,
  workflow: string,
  state: string,
): { targetId?: string } {
  if (!doc) return {};
  const id = identityIdFor(doc.meta, { kind: "state", workflow, state });
  return id ? { targetId: id } : {};
}

function annotationBytes(annotations: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(annotations)).length;
}

function annotationsSizeIssues(
  session: WorkflowSession,
  doc?: WorkflowEditorDocument,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const max = ANNOTATIONS_MAX_BYTES;
  for (const wf of session.workflows) {
    if (wf.annotations !== undefined) {
      const bytes = annotationBytes(wf.annotations);
      if (bytes > max) {
        issues.push({
          severity: "error",
          code: "annotations-too-large",
          message: `Annotations on workflow "${wf.name}" are ${bytes} bytes, over the ${max}-byte limit.`,
          ...idFor(doc, wf.name, "workflow"),
          detail: { bytes, max },
        });
      }
    }
    if (wf.criterionAnnotations !== undefined) {
      const bytes = annotationBytes(wf.criterionAnnotations);
      if (bytes > max) {
        issues.push({
          severity: "error",
          code: "annotations-too-large",
          message: `Criterion annotations on workflow "${wf.name}" are ${bytes} bytes, over the ${max}-byte limit.`,
          ...idFor(doc, wf.name, "workflow"),
          detail: { bytes, max },
        });
      }
    }
    for (const [stateCode, state] of Object.entries(wf.states)) {
      if (state.annotations !== undefined) {
        const bytes = annotationBytes(state.annotations);
        if (bytes > max) {
          issues.push({
            severity: "error",
            code: "annotations-too-large",
            message: `Annotations on state "${stateCode}" (workflow "${wf.name}") are ${bytes} bytes, over the ${max}-byte limit.`,
            ...stateTargetId(doc, wf.name, stateCode),
            detail: { bytes, max },
          });
        }
      }
      state.transitions.forEach((t, index) => {
        if (t.annotations !== undefined) {
          const bytes = annotationBytes(t.annotations);
          if (bytes > max) {
            issues.push({
              severity: "error",
              code: "annotations-too-large",
              message: `Annotations on transition "${t.name}" (state "${stateCode}", workflow "${wf.name}") are ${bytes} bytes, over the ${max}-byte limit.`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
              detail: { bytes, max },
            });
          }
        }
        if (t.criterionAnnotations !== undefined) {
          const bytes = annotationBytes(t.criterionAnnotations);
          if (bytes > max) {
            issues.push({
              severity: "error",
              code: "annotations-too-large",
              message: `Criterion annotations on transition "${t.name}" (state "${stateCode}", workflow "${wf.name}") are ${bytes} bytes, over the ${max}-byte limit.`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
              detail: { bytes, max },
            });
          }
        }
        for (const processor of t.processors ?? []) {
          if (processor.annotations === undefined) continue;
          const bytes = annotationBytes(processor.annotations);
          if (bytes > max) {
            issues.push({
              severity: "error",
              code: "annotations-too-large",
              message: `Annotations on processor "${processor.name}" (transition "${t.name}", state "${stateCode}", workflow "${wf.name}") are ${bytes} bytes, over the ${max}-byte limit.`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
              detail: { bytes, max },
            });
          }
        }
      });
    }
  }
  return issues;
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

      // `== null` rather than `=== undefined`: `validateSemantics` is public
      // API and `validateAfterPatch` calls it with zero normalization, so an
      // explicit `criterion: null` (what the server emits, and what a
      // hand-edited document carries) must count as unguarded here exactly as
      // it does in `findUnguardedCycles`, which asks the same question.
      const nullIdx = automated.findIndex(({ t }) => t.criterion == null);
      if (nullIdx === -1 || nullIdx === automated.length - 1) continue;

      const nullEntry = automated[nullIdx]!;
      const deadNames = automated.slice(nullIdx + 1).map((entry) => entry.t.name);
      issues.push({
        severity: "warning",
        code: "null-criterion-not-last",
        message: `Transition "${nullEntry.t.name}" on state "${stateCode}" is automated and has no criterion, so it always fires; later automated transitions on this state are unreachable${
          deadNames.length > 0 ? ` (${deadNames.map((n) => `"${n}"`).join(", ")})` : ""
        }.`,
        ...transitionTargetId(doc, wf.name, stateCode, nullEntry.index),
        detail: {
          workflow: wf.name,
          state: stateCode,
          transitionName: nullEntry.t.name,
          unreachable: deadNames,
        },
      });
    }
  }
  return issues;
}
