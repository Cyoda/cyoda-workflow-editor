import { outputWorkflow } from "../normalize/output.js";
import { findUnknownCriterionMembers } from "../criteria/unknownMembers.js";
import { normalizeOperatorAlias } from "../parse/operator-alias.js";
import type { Workflow } from "../types/workflow.js";
import { coerceCanonicalDefaults, isObj } from "./canonical-defaults.js";
import type { CyodaDialect, ToCanonicalResult } from "./dialect.js";

/**
 * The cyoda-go 0.9 dialect — the only shipped dialect and the default
 * (`LATEST_CYODA_VERSION`). Targets cyoda-go 0.9.0 (workflow schema tag 1.5,
 * accepting 1.1–1.5). Per-release wire deltas are recorded in
 * `ai/cyoda-schema-versions.md`.
 *
 * It replaces the `"0.8"` dialect, which was removed in the same release: the
 * two wire formats cannot share one serializer, because 0.9.0 reads a
 * processor's `startNewTxOnDispatch` beside `executionMode` and refuses it
 * inside `config`, while 0.8.3/0.8.4 did the exact opposite.
 *
 * Parse (`toCanonical`) still accepts everything the 0.8.x line wrote, so old
 * files and exports open and re-save in the 0.9.0 shape:
 * - a `config.startNewTxOnDispatch` is relocated to the processor;
 * - a `delayMs <= 0` (the 0.8.3/0.8.4 exporters wrote `delayMs: 0` beside every
 *   `schedule.function`) is dropped;
 * - an array clause with no operator gets `EQUALS` — the comparison 0.8.x
 *   applied — and is reported as `array-criterion-operator-defaulted`;
 * - an array clause with its list under the legacy `value` key is read and
 *   reported as `array-criterion-legacy-value`.
 *
 * Serialize (`workflowsToWire`) runs the output through a strict per-level
 * field allowlist (`V0_9_WIRE_FIELDS`): cyoda-go refuses any undeclared,
 * duplicate or case-variant member at every nesting level.
 */
export const cyoda09Dialect: CyodaDialect = {
  version: "0.9",
  schemaVersionTag: "1.5",
  acceptedSchemaVersions: [{ major: 1, minMinor: 1, maxMinor: 5 }],
  toCanonical(raw: unknown): ToCanonicalResult {
    const legacyArrays = countLegacyArrayValue(raw);
    const aliased = normalizeOperatorAlias(raw);
    const defaultedOperators = fillArrayOperators(aliased);
    const normalized = normalize09(coerceCanonicalDefaults(aliased));
    const warnings: string[] = [];
    if (legacyArrays > 0) warnings.push(`array-criterion-legacy-value:${legacyArrays}`);
    if (defaultedOperators > 0) {
      warnings.push(`array-criterion-operator-defaulted:${defaultedOperators}`);
    }
    for (const w of normalized.warnings) warnings.push(w);
    return { value: normalized.value, warnings };
  },
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>> {
    return workflows.map((wf) =>
      allowlistWorkflow(outputWorkflow(wf, { schedule: true, annotations: true })),
    );
  },
};

/** Push every element of `node` onto `stack` without spreading (see below). */
function pushChildren(stack: unknown[], node: unknown): void {
  if (Array.isArray(node)) {
    // Not `stack.push(...node)`: spreading passes every element as a call
    // argument and overflows the stack past ~125k elements.
    for (const item of node) stack.push(item);
    return;
  }
  if (!isObj(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (k !== "annotations" && k !== "criterionAnnotations") stack.push(v);
  }
}

/**
 * Count array criteria carrying their list only under the legacy `value` key.
 * cyoda-go reads `values` exclusively, so such a clause — written by editor
 * versions before the 0.8.4 support — was stored on 0.8.x as a guard with no
 * positional tests that matched every entity (0.9.0 refuses it outright). The
 * alias pass silently migrates it; this count surfaces that the file on disk /
 * server is currently wrong. Skips the opaque `annotations` /
 * `criterionAnnotations` subtrees.
 */
function countLegacyArrayValue(raw: unknown): number {
  let count = 0;
  const stack: unknown[] = [raw];
  while (stack.length > 0) {
    const node = stack.pop();
    if (isObj(node) && node["type"] === "array" && "value" in node && !("values" in node)) {
      count += 1;
    }
    pushChildren(stack, node);
  }
  return count;
}

/**
 * Give every array clause without an operator `operation: "EQUALS"`, in place,
 * and return how many were filled. Runs on the alias pass's output, which is a
 * fresh tree, so mutating it does not touch the caller's input.
 *
 * cyoda-go 0.9.0 requires the operator (it is applied at every tested
 * position); 0.8.x compared with equality whatever the clause said, so
 * `EQUALS` preserves what such a clause meant when it was written — and is the
 * migration cyoda-go's own changelog prescribes.
 */
function fillArrayOperators(tree: unknown): number {
  let count = 0;
  const stack: unknown[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (isObj(node) && node["type"] === "array" && node["operation"] === undefined) {
      node["operation"] = "EQUALS";
      count += 1;
    }
    pushChildren(stack, node);
  }
  return count;
}

// The exact fields the v0.9.0 wire format accepts at each nesting level, in
// emission order. Anything not listed here is stripped from the output.
const WORKFLOW_FIELDS = [
  "version",
  "name",
  "desc",
  "initialState",
  "active",
  "annotations",
  "criterion",
  "criterionAnnotations",
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
  "criterionAnnotations",
  "processors",
  "schedule",
] as const;
const PROCESSOR_FIELDS = [
  "type",
  "name",
  "executionMode",
  "startNewTxOnDispatch",
  "annotations",
  "config",
] as const;
const PROCESSOR_CONFIG_FIELDS = [
  "attachEntity",
  "calculationNodesTags",
  "responseTimeoutMs",
  "retryPolicy",
  "context",
  "idempotent",
  "asyncResult",
  "crossoverToAsyncMs",
] as const;
const SCHEDULE_FIELDS = ["delayMs", "timeoutMs", "function"] as const;
const SCHEDULE_FUNCTION_FIELDS = [
  "name",
  "resultKind",
  "calculationNodesTags",
  "attachEntity",
  "context",
  "responseTimeoutMs",
  "retryPolicy",
] as const;

/**
 * The allowlisted field sets, exported so tests can assert the v0.9 wire output
 * contains no key outside these sets at any nesting level. `criterion` is left
 * to the criterion serializer (already an allowlist by construction).
 */
export const V0_9_WIRE_FIELDS = {
  workflow: WORKFLOW_FIELDS,
  state: STATE_FIELDS,
  transition: TRANSITION_FIELDS,
  processor: PROCESSOR_FIELDS,
  processorConfig: PROCESSOR_CONFIG_FIELDS,
  schedule: SCHEDULE_FIELDS,
  scheduleFunction: SCHEDULE_FUNCTION_FIELDS,
} as const;

const CONFIG_KEYS = new Set(PROCESSOR_CONFIG_FIELDS as readonly string[]);
const PROCESSOR_KEYS = new Set(PROCESSOR_FIELDS as readonly string[]);

/**
 * Reshape a raw tree into what the canonical schema accepts:
 *
 * - Drop `delayMs` when `<= 0`. cyoda-go treats such a value as no static
 *   delay, and the 0.8.3/0.8.4 exporters wrote `delayMs: 0` beside every
 *   `function` — which 0.9.0 refuses. Dropping it is not lossy.
 * - Strip `null`-valued optional keys. The server accepts `null` for nearly
 *   every optional field; Zod's `.optional()` rejects it. This is done
 *   shallowly, at each known level (workflow/state/transition/schedule/
 *   schedule.function/processor/processor config), never recursively —
 *   criterion trees (`value: null` for IS_NULL/NOT_NULL) and `annotations`/
 *   `criterionAnnotations` (opaque client data) must never be touched.
 * - Collapse a `null` state, or a `null`/absent `transitions` on a state, to
 *   the same default a transition-less state already gets (`StateSchema`
 *   defaults `transitions` to `[]`).
 * - Treat a `null` processor `config` as absent.
 * - Relocate a legacy `config.startNewTxOnDispatch` (0.8.3/0.8.4) onto the
 *   processor, where cyoda-go 0.9.0 reads it.
 * - Report discarded processor and processor-config keys. Zod strips unknown
 *   keys silently, which would turn an invalid processor into a quietly-emptied
 *   one.
 * - Report undeclared criterion members (workflow and transition criteria,
 *   pre-checks included) for the same reason: cyoda-go 0.9.0 refuses them, and
 *   dropping one can change what the criterion means.
 */
function normalize09(value: unknown): { value: unknown; warnings: string[] } {
  const warnings: string[] = [];
  if (!isObj(value) || !Array.isArray(value["workflows"])) return { value, warnings };

  const stripNulls = (o: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (v !== null) out[k] = v;
    return out;
  };

  const workflows = (value["workflows"] as unknown[]).map((wf) => {
    if (!isObj(wf) || !isObj(wf["states"])) return wf;
    const w = stripNulls(wf);
    const wfName = String(w["name"]);
    reportCriterionMembers(w["criterion"], `workflow "${wfName}"`, warnings);
    const states = w["states"] as Record<string, unknown>;
    const nextStates: Record<string, unknown> = {};

    for (const [code, state] of Object.entries(states)) {
      // A `null` state (the whole entry) and a `null`/absent `transitions`
      // both collapse to the same default a transition-less state already
      // gets: `StateSchema.transitions` defaults missing input to `[]`.
      if (state === null) {
        nextStates[code] = {};
        continue;
      }
      if (!isObj(state)) {
        nextStates[code] = state;
        continue;
      }
      const s = stripNulls(state);
      if (!Array.isArray(s["transitions"])) {
        nextStates[code] = s;
        continue;
      }
      s["transitions"] = (s["transitions"] as unknown[]).map((t) => {
        if (!isObj(t)) return t;
        const tx = stripNulls(t);
        reportCriterionMembers(
          tx["criterion"],
          `transition "${String(tx["name"])}" on "${wfName}:${code}"`,
          warnings,
        );

        if (isObj(tx["schedule"])) {
          const sched = stripNulls(tx["schedule"] as Record<string, unknown>);
          if (typeof sched["delayMs"] === "number" && sched["delayMs"] <= 0) {
            delete sched["delayMs"];
          }
          if (isObj(sched["function"])) {
            sched["function"] = stripNulls(sched["function"] as Record<string, unknown>);
          }
          tx["schedule"] = sched;
        }

        if (Array.isArray(tx["processors"])) {
          tx["processors"] = (tx["processors"] as unknown[]).map((p) =>
            isObj(p) ? normalizeProcessor(p, stripNulls, warnings) : p,
          );
        }
        return tx;
      });
      nextStates[code] = s;
    }
    w["states"] = nextStates;
    return w;
  });

  return { value: { ...value, workflows }, warnings };
}

/**
 * Push one `criterion-keys-dropped:<location>:<keys>` warning per criterion
 * object carrying undeclared members. `<location>` names the workflow or
 * transition and the JSON Pointer inside the criterion; it may contain `:`,
 * which `dialectWarningToIssue` allows for (it splits on the first and last).
 */
function reportCriterionMembers(criterion: unknown, owner: string, warnings: string[]): void {
  if (criterion === undefined || criterion === null) return;
  for (const { pointer, keys } of findUnknownCriterionMembers(criterion)) {
    const at = pointer === "" ? "" : ` at ${pointer}`;
    warnings.push(`criterion-keys-dropped:${owner} criterion${at}:${keys.join(",")}`);
  }
}

function normalizeProcessor(
  p: Record<string, unknown>,
  stripNulls: (o: Record<string, unknown>) => Record<string, unknown>,
  warnings: string[],
): Record<string, unknown> {
  const rawConfig = p["config"];
  // A `config` that is present but neither an object nor `null` is left
  // untouched for Zod to reject.
  if (rawConfig !== undefined && rawConfig !== null && !isObj(rawConfig)) return p;

  const proc: Record<string, unknown> = { ...p };
  // `config: null` (the whole block) is treated as absent, same as every other
  // optional key — `stripNulls` below removes the key.
  const cfg: Record<string, unknown> | undefined = isObj(rawConfig) ? { ...rawConfig } : undefined;

  // Legacy-position migration. cyoda-go 0.8.3/0.8.4 read
  // `startNewTxOnDispatch` inside `config` (and this library wrote it there);
  // 0.9.0 reads it on the processor and refuses it inside `config` as an
  // unknown member. Relocation is lossless: there is exactly one correct
  // destination. A processor-level value wins — it is the current position.
  if (cfg !== undefined && "startNewTxOnDispatch" in cfg) {
    const legacy = cfg["startNewTxOnDispatch"];
    delete cfg["startNewTxOnDispatch"];
    if (
      legacy !== null &&
      (proc["startNewTxOnDispatch"] === undefined || proc["startNewTxOnDispatch"] === null)
    ) {
      proc["startNewTxOnDispatch"] = legacy;
    }
  }

  // Dropped-key warnings are computed on the *original* keys, before
  // null-stripping (an unknown key is unknown, and will be silently dropped by
  // Zod, whether its value is null or not; a null value on a *known* key such
  // as `context: null` is not a dropped key) but *after* the migration above,
  // so the relocated field is not reported as dropped.
  const name = String(proc["name"]);
  const droppedProc = Object.keys(proc).filter((k) => !PROCESSOR_KEYS.has(k));
  if (droppedProc.length > 0) {
    warnings.push(`processor-keys-dropped:${name}:${droppedProc.join(",")}`);
  }
  if (cfg !== undefined) {
    const dropped = Object.keys(cfg).filter((k) => !CONFIG_KEYS.has(k));
    if (dropped.length > 0) {
      warnings.push(`processor-config-keys-dropped:${name}:${dropped.join(",")}`);
    }
  }

  const out = stripNulls(proc);
  if (cfg !== undefined) out["config"] = stripNulls(cfg);
  return out;
}

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
    const sched = pick(out["schedule"] as Record<string, unknown>, SCHEDULE_FIELDS);
    if (isObj(sched["function"])) {
      sched["function"] = pick(
        sched["function"] as Record<string, unknown>,
        SCHEDULE_FUNCTION_FIELDS,
      );
    }
    out["schedule"] = sched;
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
