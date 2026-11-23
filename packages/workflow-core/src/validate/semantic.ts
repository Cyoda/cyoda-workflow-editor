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

/**
 * `retryPolicy` values cyoda-go accepts on a processor, a criterion function
 * and (since 0.9.0) a schedule function; anything else is a hard 400.
 */
const RETRY_POLICIES = new Set(["NONE", "FIXED", ""]);

/**
 * cyoda-go 0.9.0's default `CYODA_CALLOUT_RESPONSE_TIMEOUT_MAX_MS`. Import
 * refuses a `responseTimeoutMs` above the server's setting; the setting is per
 * deployment, so exceeding the default is a warning, not an error.
 */
export const CALLOUT_RESPONSE_TIMEOUT_DEFAULT_MAX_MS = 60_000;

/**
 * cyoda-go 0.9.0 refuses a criterion that tests more than this many entries:
 * an array clause counts one per entry in its values (nulls included), a
 * function condition one plus its pre-check, every other leaf one; groups
 * count nothing themselves.
 */
export const MAX_CRITERION_ENTRIES = 10_000;

export const ANNOTATIONS_MAX_BYTES = 64 * 1024;

/**
 * Grammar for the in-document workflow schema `version` tag, mirrored exactly
 * from the server (spec §4): MAJOR.MINOR, no leading zeros.
 */
const TAG_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

/**
 * Append `more` to `into` without `into.push(...more)`: spreading passes every
 * element as a call argument, which overflows the stack once a rule list is
 * large (~125k issues, e.g. one per leaf of a huge criterion).
 */
function append(into: ValidationIssue[], more: readonly ValidationIssue[]): void {
  for (const issue of more) into.push(issue);
}

/**
 * The `retryPolicy` / `responseTimeoutMs` checks cyoda-go 0.9.0 applies at
 * import to every callout: a processor's `config`, a criterion function's
 * `config` and a `schedule.function`. `subject` names the callout in messages.
 */
function calloutConfigIssues(
  subject: string,
  retryPolicy: string | undefined,
  responseTimeoutMs: number | undefined,
  target: { targetId?: string } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (retryPolicy !== undefined && !RETRY_POLICIES.has(retryPolicy)) {
    issues.push({
      severity: "error",
      code: "unknown-retry-policy",
      message: `${subject}: unknown retryPolicy "${retryPolicy}" (allowed: NONE, FIXED, or empty).`,
      ...target,
    });
  }
  if (responseTimeoutMs !== undefined) {
    if (responseTimeoutMs < 0) {
      issues.push({
        severity: "error",
        code: "response-timeout-negative",
        message: `${subject}: responseTimeoutMs must not be negative (got ${responseTimeoutMs}); cyoda-go refuses it at import.`,
        ...target,
      });
    } else if (responseTimeoutMs > CALLOUT_RESPONSE_TIMEOUT_DEFAULT_MAX_MS) {
      issues.push({
        severity: "warning",
        code: "response-timeout-above-default-max",
        message: `${subject}: responseTimeoutMs ${responseTimeoutMs} exceeds cyoda-go's default upper bound of ${CALLOUT_RESPONSE_TIMEOUT_DEFAULT_MAX_MS} ms; import is refused unless the server's CYODA_CALLOUT_RESPONSE_TIMEOUT_MAX_MS is raised to at least this value.`,
        detail: { responseTimeoutMs, defaultMax: CALLOUT_RESPONSE_TIMEOUT_DEFAULT_MAX_MS },
        ...target,
      });
    }
  }
  return issues;
}

/**
 * Entry checks cyoda-go 0.9.0 applies to an `array` clause's `values`: an
 * object is never an operand; under `BETWEEN` / `BETWEEN_INCLUSIVE` each
 * tested (non-null) position is a `[low, high]` pair of non-null scalars, and
 * under any other operator it is a single scalar. One issue per clause.
 */
function arrayEntryIssues(
  operation: string,
  values: readonly unknown[],
  where: CriterionLoc,
): ValidationIssue[] {
  const at = `(at ${describe(where)})`;
  if (values.some((v) => v !== null && typeof v === "object" && !Array.isArray(v))) {
    return [
      {
        severity: "error",
        code: "array-non-scalar-value",
        message: `Array criterion value contains an object; each entry must be a scalar, null, or (under BETWEEN) a [low, high] pair ${at}.`,
      },
    ];
  }
  if (!OPERATOR_TYPES.has(operation as OperatorType)) return [];
  if (UNSUPPORTED_OPERATORS.has(operation as OperatorType)) return [];
  const isRange = operation === "BETWEEN" || operation === "BETWEEN_INCLUSIVE";
  if (isRange) {
    const bad = values.find(
      (v) =>
        v !== null &&
        (!Array.isArray(v) || v.length !== 2 || v.some((b) => b === null || typeof b === "object")),
    );
    return bad === undefined
      ? []
      : [
          {
            severity: "error",
            code: "simple-between-shape",
            message: `Operator "${operation}" on an array criterion needs each tested position to be a [low, high] pair of two non-null scalars; got ${JSON.stringify(bad)} ${at}.`,
            detail: { operation },
          },
        ];
  }
  return values.some((v) => Array.isArray(v))
    ? [
        {
          severity: "error",
          code: "operand-not-scalar",
          message: `Operator "${operation}" takes a single value per position, not an array; only BETWEEN and BETWEEN_INCLUSIVE take a [low, high] pair ${at}.`,
          detail: { operation },
        },
      ]
    : [];
}

/**
 * Operand checks cyoda-go 0.9.0 applies at import to a `simple` or
 * `lifecycle` leaf (in a criterion and in a pre-check alike). Skipped for an
 * operator outside the editor's catalogue or one cyoda-go does not implement
 * (`IS_CHANGED` / `IS_UNCHANGED`, which take no operand) — the operator itself
 * is already reported.
 */
function operandIssues(operation: string, value: unknown, where: CriterionLoc): ValidationIssue[] {
  if (!OPERATOR_TYPES.has(operation as OperatorType)) return [];
  if (UNSUPPORTED_OPERATORS.has(operation as OperatorType)) return [];
  if (operation === "IS_NULL" || operation === "NOT_NULL") return [];
  const at = `(at ${describe(where)})`;
  if (value === undefined || value === null) {
    return [
      {
        severity: "error",
        code: "operand-missing",
        message: `Operator "${operation}" takes an operand, and value is missing or null; only IS_NULL and NOT_NULL take none ${at}.`,
        detail: { operation },
      },
    ];
  }
  if (operation === "BETWEEN" || operation === "BETWEEN_INCLUSIVE") {
    if (!Array.isArray(value) || value.length !== 2) {
      return [
        {
          severity: "error",
          code: "simple-between-shape",
          message: `Operator "${operation}" requires a two-element [low, high] array value ${at}.`,
          detail: { operation },
        },
      ];
    }
    if (value.some((b) => b === null || typeof b === "object")) {
      return [
        {
          severity: "error",
          code: "simple-between-shape",
          message: `Operator "${operation}" bounds must be two non-null scalars (string, number or boolean) ${at}.`,
          detail: { operation },
        },
      ];
    }
    return [];
  }
  if (Array.isArray(value)) {
    return [
      {
        severity: "error",
        code: "operand-not-scalar",
        message: `Operator "${operation}" takes a single value, not an array; only BETWEEN and BETWEEN_INCLUSIVE take a [low, high] pair ${at}.`,
        detail: { operation },
      },
    ];
  }
  if (typeof value === "object") {
    return [
      {
        severity: "error",
        code: "operand-not-scalar",
        message: `Operator "${operation}" operand is an object; an operand must be a string, number or boolean ${at}.`,
        detail: { operation },
      },
    ];
  }
  return [];
}

/**
 * Operator warnings for a criterion's `operation` (issue #22).
 * - Unknown operator (outside the editor's known catalogue): non-blocking
 *   `operator-not-recognized` — preserved for round-trip, can't be validated.
 * - Known but not implemented by cyoda-go (`IS_CHANGED` / `IS_UNCHANGED`):
 *   `unsupported-operator`.
 * cyoda-go rejects both at import (`unknown operatorType`; its 0.9.0 OpenAPI
 * lists only the 26 operators it implements), but Cyoda Cloud's operator set
 * is wider, so these stay warnings (backend-conditional — see
 * docs/validation-rules.md) and imports always round-trip.
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

  append(issues, duplicateWorkflowNames(session));

  for (const wf of session.workflows) {
    append(issues, validateWorkflow(wf, doc, dialect));

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

  append(issues, criterionRules(session));
  append(issues, criterionDepthRules(session));
  append(issues, automatedOrderingRules(session, doc));
  append(issues, annotationsSizeIssues(session, doc));

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
          if (p.startNewTxOnDispatch === true && p.executionMode !== "COMMIT_BEFORE_DISPATCH") {
            issues.push({
              severity: "error",
              code: "start-new-tx-without-commit-before-dispatch",
              message: `Processor "${p.name}": startNewTxOnDispatch=true is only valid with executionMode=COMMIT_BEFORE_DISPATCH (got "${p.executionMode ?? ""}").`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          }
          const target = transitionTargetId(doc, wf.name, stateCode, index);
          append(
            issues,
            calloutConfigIssues(
              `Processor "${p.name}"`,
              p.config?.retryPolicy,
              p.config?.responseTimeoutMs,
              target,
            ),
          );
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
              severity: "error",
              code: "processor-type-internalized",
              message: `Processor "${p.name}" uses the reserved type "internalized", which cyoda-go refuses at import. Set the type to "externalized" (or leave it empty).`,
              ...transitionTargetId(doc, wf.name, stateCode, index),
            });
          } else if (p.type !== "externalized" && p.type !== "") {
            issues.push({
              severity: "error",
              code: "processor-type-non-canonical",
              message: `Processor "${p.name}" has type "${p.type}"; cyoda-go refuses any type other than "externalized" (or empty) at import.`,
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
        // dialect's `delayMs <= 0` drop has run. Mirrors cyoda-go 0.9.0:
        // any `delayMs` beside a `function` is refused, whatever its value;
        // on its own, a `delayMs <= 0` is no static delay.
        const hasFunction = t.schedule.function !== undefined && t.schedule.function !== null;
        const delay = t.schedule.delayMs;
        if (hasFunction && typeof delay === "number") {
          issues.push({
            severity: "error",
            code: "schedule-delay-with-function",
            message: `Transition "${t.name}": schedule.delayMs and schedule.function are mutually exclusive; remove delayMs (cyoda-go refuses it beside a function whatever its value, 0 included).`,
            ...transitionTargetId(doc, wf.name, stateCode, index),
          });
        } else if (!hasFunction && !(typeof delay === "number" && delay > 0)) {
          issues.push({
            severity: "error",
            code: "schedule-mode-required",
            message: `Transition "${t.name}": exactly one of schedule.delayMs (at least 1) or schedule.function is required.`,
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
        if (fn) {
          append(
            issues,
            calloutConfigIssues(
              `Transition "${t.name}" schedule.function`,
              fn.retryPolicy,
              fn.responseTimeoutMs,
              transitionTargetId(doc, wf.name, stateCode, index),
            ),
          );
        }
        if (t.schedule.timeoutMs !== undefined && t.schedule.timeoutMs < 0) {
          issues.push({
            severity: "error",
            code: "schedule-timeout-negative",
            message: `Transition "${t.name}": schedule.timeoutMs must not be negative (got ${t.schedule.timeoutMs}); cyoda-go refuses it at import. Use 0 to drop the run on any lateness.`,
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
  for (const { criterion, where, inPreCheck } of walkCriteria(session)) {
    switch (criterion.type) {
      case "function":
        if (inPreCheck) {
          issues.push({
            severity: "error",
            code: "precheck-function",
            message: `Function criterion "${criterion.function.name}" sits inside another function condition's pre-check; a pre-check holds only local conditions (simple, lifecycle, array and groups of those) (at ${describe(where)}).`,
          });
        }
        append(
          issues,
          calloutConfigIssues(
            `Function criterion "${criterion.function.name}" (at ${describe(where)})`,
            criterion.function.config?.retryPolicy,
            criterion.function.config?.responseTimeoutMs,
          ),
        );
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
        if (
          arrPathCheck.ok &&
          criterion.jsonPath.endsWith("[*]") &&
          criterion.jsonPath.slice(0, -3).includes("[*]")
        ) {
          issues.push({
            severity: "error",
            code: "array-path-inner-wildcard",
            message: `Array criterion jsonPath "${criterion.jsonPath}" has a wildcard before its trailing [*]; an array clause tests the positions of one array — index the outer array instead, e.g. "$.orders[0].lines[*]" (at ${describe(where)}).`,
            detail: { jsonPath: criterion.jsonPath },
          });
        }
        append(issues, arrayEntryIssues(criterion.operation, criterion.value, where));
        if (criterion.value.every((v) => v === null)) {
          issues.push({
            severity: "error",
            code: "array-no-position",
            message: `Array criterion on "${criterion.jsonPath}" tests no position: values must hold at least one non-null entry (at ${describe(where)}).`,
            detail: { jsonPath: criterion.jsonPath },
          });
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
        issues.push(...patternIssues(criterion.operation, criterion.value, where));
        issues.push(...operandIssues(criterion.operation, criterion.value, where));
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
        issues.push(...operandIssues(criterion.operation, criterion.value, where));

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
      const where: CriterionLoc = { kind: "workflow", workflow: wf.name };
      pushDepthIssue(issues, criterionMaxDepth(wf.criterion), where);
      pushEntryIssue(issues, criterionEntryCount(wf.criterion), where);
    }
    for (const [stateCode, state] of Object.entries(wf.states)) {
      for (let i = 0; i < state.transitions.length; i++) {
        const t = state.transitions[i]!;
        if (!t.criterion) continue;
        const where: CriterionLoc = {
          kind: "transition",
          workflow: wf.name,
          state: stateCode,
          transitionIndex: i,
          transitionName: t.name,
        };
        pushDepthIssue(issues, criterionMaxDepth(t.criterion), where);
        pushEntryIssue(issues, criterionEntryCount(t.criterion), where);
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

function pushEntryIssue(issues: ValidationIssue[], entries: number, where: CriterionLoc): void {
  if (entries > MAX_CRITERION_ENTRIES) {
    issues.push({
      severity: "error",
      code: "criterion-entry-limit",
      message: `Criterion tests ${entries} entries; cyoda-go's limit is ${MAX_CRITERION_ENTRIES} (an array clause counts one per entry in its values, a function condition one plus its pre-check, every other condition one) (at ${describe(where)}).`,
      detail: { entries, limit: MAX_CRITERION_ENTRIES },
    });
  }
}

/** The entry count cyoda-go 0.9.0 holds a criterion to — see MAX_CRITERION_ENTRIES. */
function criterionEntryCount(root: Criterion): number {
  const stack: Criterion[] = [root];
  let count = 0;
  while (stack.length > 0) {
    const node = stack.pop()!;
    switch (node.type) {
      case "group":
        for (const child of node.conditions) stack.push(child);
        break;
      case "array":
        count += node.value.length;
        break;
      case "function":
        count += 1;
        if (node.function.criterion) stack.push(node.function.criterion);
        break;
      default:
        count += 1;
    }
  }
  return count;
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
