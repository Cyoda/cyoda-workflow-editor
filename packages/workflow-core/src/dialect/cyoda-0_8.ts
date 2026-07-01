import { outputWorkflow } from "../normalize/output.js";
import { normalizeOperatorAlias } from "../parse/operator-alias.js";
import type { Workflow } from "../types/workflow.js";
import { coerceCanonicalDefaults, isObj } from "./cyoda-0_7.js";
import type { CyodaDialect, ToCanonicalResult } from "./dialect.js";

/**
 * The cyoda-go 0.8 dialect — the current default (`LATEST_CYODA_VERSION`).
 * Targets cyoda-go 0.8.1; 0.8.0 was never released.
 *
 * Covers: cyoda-go 0.8.1 (the 0.8 line; 0.8.0 never shipped — see the status
 * note in `ai/cyoda-schema-versions.md`).
 *
 * Deltas from the 0.7 dialect:
 * - **`scheduled` processor removed.** The type no longer exists in the wire
 *   format or the canonical model, so — unlike 0.7 — there is nothing to drop in
 *   `toCanonical` and no warning is ever produced.
 * - **`transitions[].schedule` passed through and emitted.** `toCanonical` lets
 *   it flow straight to the canonical model (already the right shape);
 *   `workflowsToWire` emits it when present. 0.7 omitted it entirely.
 * - **Strict output allowlist.** v0.8.0's import handler uses
 *   `DisallowUnknownFields`, so any stray key (editor metadata or a future
 *   canonical field) is rejected with a 400. `workflowsToWire` runs every node
 *   through a per-level field allowlist (`V0_8_WIRE_FIELDS`) so the output is
 *   provably clean. 0.7 relied only on `outputWorkflow`'s by-construction shape.
 * - **`annotations` added (cyoda-go 0.8.1).** Engine-opaque, client-owned JSON
 *   object at workflow/state/transition level, emitted verbatim (its inner keys
 *   are intentionally not allowlisted). The `"0.8"` dialect targets 0.8.1;
 *   0.8.0 never shipped. The 0.7 dialect omits it.
 *
 * Server-side v0.8.0 constraints mirrored elsewhere (not in this file): `active`
 * preserved on import, names ≤ 256 chars, empty `workflows` rejected in
 * REPLACE/ACTIVATE. See `src/schema/name.ts` and `src/validate/semantic.ts`.
 *
 * Known limitations / deferred:
 * - `transitions[].schedule` is a **schema/SPI placeholder** — configurable and
 *   importable, but the cyoda-go runtime does not yet execute scheduled
 *   transitions (firing one returns 400).
 * - The `internalized` processor type is **reserved** by v0.8.0 but rejected at
 *   dispatch today; it is deliberately **not** modelled here. A future dialect
 *   author must not repurpose the literal.
 */
export const cyoda08Dialect: CyodaDialect = {
  version: "0.8",
  toCanonical(raw: unknown): ToCanonicalResult {
    return { value: coerceCanonicalDefaults(normalizeOperatorAlias(raw)), warnings: [] };
  },
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>> {
    return workflows.map((wf) =>
      allowlistWorkflow(outputWorkflow(wf, { schedule: true, annotations: true })),
    );
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
  "annotations",
  "criterion",
  "states",
] as const;
const STATE_FIELDS = ["transitions", "annotations"] as const;
const TRANSITION_FIELDS = [
  "name",
  "next",
  "manual",
  "annotations",
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
