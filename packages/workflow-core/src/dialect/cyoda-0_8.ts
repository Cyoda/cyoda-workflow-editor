import { outputWorkflow } from "../normalize/output.js";
import { normalizeOperatorAlias } from "../parse/operator-alias.js";
import type { Workflow } from "../types/workflow.js";
import { coerceCanonicalDefaults, isObj } from "./cyoda-0_7.js";
import type { CyodaDialect, ToCanonicalResult } from "./dialect.js";

/**
 * The cyoda-go 0.8.0 dialect.
 *
 * `toCanonical` composes the same operator-alias + canonical-default pass as 0.7
 * and passes `transitions[].schedule` straight through to the canonical model
 * (it is already the right shape). There is no `scheduled` processor handling —
 * that type does not exist in the 0.8 wire format.
 *
 * `workflowsToWire` emits `externalized` processors and `transitions[].schedule`
 * when present, then runs every node through a strict field allowlist. v0.8.0's
 * import handler uses `DisallowUnknownFields`, so any stray key (editor metadata
 * or a future canonical field) would be rejected with a 400; the allowlist makes
 * the output provably clean.
 */
export const cyoda08Dialect: CyodaDialect = {
  version: "0.8",
  toCanonical(raw: unknown): ToCanonicalResult {
    return { value: coerceCanonicalDefaults(normalizeOperatorAlias(raw)), warnings: [] };
  },
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>> {
    return workflows.map((wf) => allowlistWorkflow(outputWorkflow(wf, { schedule: true })));
  },
};

// The exact fields the v0.8.0 wire format accepts at each nesting level, in
// emission order. Anything not listed here is stripped from the output.
const WORKFLOW_FIELDS = [
  "version",
  "name",
  "desc",
  "initialState",
  "active",
  "criterion",
  "states",
] as const;
const STATE_FIELDS = ["transitions"] as const;
const TRANSITION_FIELDS = [
  "name",
  "next",
  "manual",
  "disabled",
  "criterion",
  "processors",
  "schedule",
] as const;
const PROCESSOR_FIELDS = [
  "type",
  "name",
  "executionMode",
  "startNewTxOnDispatch",
  "config",
] as const;
const PROCESSOR_CONFIG_FIELDS = [
  "attachEntity",
  "calculationNodesTags",
  "responseTimeoutMs",
  "retryPolicy",
  "context",
  "asyncResult",
  "crossoverToAsyncMs",
] as const;
const SCHEDULE_FIELDS = ["delayMs", "timeoutMs"] as const;

/**
 * The allowlisted field sets, exported so tests can assert the v0.8 wire output
 * contains no key outside these sets at any nesting level. `criterion` is left
 * to the criterion serializer (already an allowlist by construction).
 */
export const V0_8_WIRE_FIELDS = {
  workflow: WORKFLOW_FIELDS,
  state: STATE_FIELDS,
  transition: TRANSITION_FIELDS,
  processor: PROCESSOR_FIELDS,
  processorConfig: PROCESSOR_CONFIG_FIELDS,
  schedule: SCHEDULE_FIELDS,
} as const;

/** Copy only `allowed` keys from `obj`, preserving allowlist order. */
function pick(obj: Record<string, unknown>, allowed: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in obj) out[key] = obj[key];
  }
  return out;
}

function allowlistWorkflow(wf: Record<string, unknown>): Record<string, unknown> {
  const out = pick(wf, WORKFLOW_FIELDS);
  if (isObj(out["states"])) {
    const states = out["states"] as Record<string, unknown>;
    const nextStates: Record<string, unknown> = {};
    for (const [code, state] of Object.entries(states)) {
      nextStates[code] = isObj(state) ? allowlistState(state) : state;
    }
    out["states"] = nextStates;
  }
  return out;
}

function allowlistState(state: Record<string, unknown>): Record<string, unknown> {
  const out = pick(state, STATE_FIELDS);
  if (Array.isArray(out["transitions"])) {
    out["transitions"] = (out["transitions"] as unknown[]).map((t) =>
      isObj(t) ? allowlistTransition(t) : t,
    );
  }
  return out;
}

function allowlistTransition(t: Record<string, unknown>): Record<string, unknown> {
  const out = pick(t, TRANSITION_FIELDS);
  if (Array.isArray(out["processors"])) {
    out["processors"] = (out["processors"] as unknown[]).map((p) =>
      isObj(p) ? allowlistProcessor(p) : p,
    );
  }
  if (isObj(out["schedule"])) {
    out["schedule"] = pick(out["schedule"] as Record<string, unknown>, SCHEDULE_FIELDS);
  }
  return out;
}

function allowlistProcessor(p: Record<string, unknown>): Record<string, unknown> {
  const out = pick(p, PROCESSOR_FIELDS);
  if (isObj(out["config"])) {
    out["config"] = pick(out["config"] as Record<string, unknown>, PROCESSOR_CONFIG_FIELDS);
  }
  return out;
}
