import { outputWorkflow } from "../normalize/output.js";
import { normalizeOperatorAlias } from "../parse/operator-alias.js";
import type { Workflow } from "../types/workflow.js";
import { coerceCanonicalDefaults, isObj } from "./canonical-defaults.js";
import type { CyodaDialect, ToCanonicalResult } from "./dialect.js";

/**
 * The cyoda-go 0.8 dialect — the current default (`LATEST_CYODA_VERSION`).
 * Extended in place across the 0.8 line; currently targets cyoda-go 0.8.4
 * (workflow schema tag 1.4, accepting 1.1–1.4). 0.8.0 was never released.
 * Per-release wire deltas are recorded in `ai/cyoda-schema-versions.md`.
 *
 * Deltas from the 0.7 dialect:
 * - **`scheduled` processor no longer specially handled.** The dedicated
 *   `ScheduledProcessorSchema` type is gone, but `Processor.type` is an open
 *   string (cyoda-go 0.8.3 round-trips whatever value it was given), so
 *   `{type:"scheduled"}` still parses and survives into the canonical model —
 *   unlike 0.7, `toCanonical` has nothing to drop and produces no
 *   `dropped-scheduled-processor` warning. It instead surfaces as a
 *   `processor-type-non-canonical` semantic-validation warning (the server
 *   accepts it and treats it as `externalized` today, per that warning's own
 *   message).
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
 * - `transitions[].schedule` — cyoda-go **executes** scheduled transitions on
 *   their own (as of 0.8.3); only firing one *manually by name* is rejected,
 *   with a 400 `TRANSITION_NOT_FOUND` ("is scheduled and fires automatically;
 *   it is not manually fireable").
 * - The `internalized` processor type is **reserved** by v0.8.0 but rejected at
 *   dispatch today; it is deliberately **not** modelled here. A future dialect
 *   author must not repurpose the literal.
 */
export const cyoda08Dialect: CyodaDialect = {
  version: "0.8",
  schemaVersionTag: "1.4",
  acceptedSchemaVersions: [{ major: 1, minMinor: 1, maxMinor: 4 }],
  toCanonical(raw: unknown): ToCanonicalResult {
    const legacyArrays = countLegacyArrayValue(raw);
    const normalized = normalize08(coerceCanonicalDefaults(normalizeOperatorAlias(raw)));
    const warnings =
      legacyArrays > 0
        ? [`array-criterion-legacy-value:${legacyArrays}`, ...normalized.warnings]
        : normalized.warnings;
    return { value: normalized.value, warnings };
  },
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>> {
    return workflows.map((wf) =>
      allowlistWorkflow(outputWorkflow(wf, { schedule: true, annotations: true })),
    );
  },
};

/**
 * Count array criteria carrying their list only under the legacy `value` key.
 * cyoda-go reads `values` exclusively, so such a clause — written by editor
 * versions before the 0.8.4 support — is stored as a guard with no positional
 * tests and matches every entity. The alias pass silently migrates it; this
 * count surfaces that the file on disk / server is currently wrong. Skips the
 * opaque `annotations` / `criterionAnnotations` subtrees.
 */
function countLegacyArrayValue(raw: unknown): number {
  let count = 0;
  const stack: unknown[] = [raw];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      // Not `stack.push(...node)`: spreading passes every element as a call
      // argument and overflows the stack past ~125k elements.
      for (const item of node) stack.push(item);
      continue;
    }
    if (!isObj(node)) continue;
    if (node["type"] === "array" && "value" in node && !("values" in node)) count += 1;
    for (const [k, v] of Object.entries(node)) {
      if (k !== "annotations" && k !== "criterionAnnotations") stack.push(v);
    }
  }
  return count;
}

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
const PROCESSOR_FIELDS = ["type", "name", "executionMode", "annotations", "config"] as const;
const PROCESSOR_CONFIG_FIELDS = [
  "attachEntity",
  "calculationNodesTags",
  "responseTimeoutMs",
  "retryPolicy",
  "context",
  "startNewTxOnDispatch",
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
] as const;

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
  scheduleFunction: SCHEDULE_FUNCTION_FIELDS,
} as const;

const CONFIG_KEYS = new Set(PROCESSOR_CONFIG_FIELDS as readonly string[]);
const PROCESSOR_KEYS = new Set(PROCESSOR_FIELDS as readonly string[]);

/**
 * Reshape a raw 0.8.3 tree into what the canonical schema accepts:
 *
 * - Drop `delayMs` when `<= 0`. cyoda-go's presence test is `> 0`, not "key
 *   exists" — and its own export emits `delayMs: 0` beside `function`.
 * - Strip `null`-valued optional keys. The server accepts `null` for nearly
 *   every optional field; Zod's `.optional()` rejects it. This is done
 *   shallowly, at each known level (workflow/state/transition/schedule/
 *   schedule.function/processor/processor config), never recursively —
 *   criterion trees (`value: null` for IS_NULL/NOT_NULL) and `annotations`/
 *   `criterionAnnotations` (opaque client data) must never be touched.
 *   Verified against 0.8.3: `type: null`, `executionMode: null` and
 *   `annotations: null` on a processor are all accepted with a 200.
 * - Collapse a `null` state, or a `null`/absent `transitions` on a state, to
 *   the same default a transition-less state already gets (`StateSchema`
 *   defaults `transitions` to `[]`).
 * - Treat a `null` processor `config` as absent.
 * - Relocate a legacy processor-level `startNewTxOnDispatch` into `config`,
 *   where cyoda-go 0.8.3 requires it.
 * - Report discarded processor and processor-config keys. Zod strips unknown
 *   keys silently, which would turn an invalid processor into a quietly-emptied
 *   one.
 */
function normalize08(value: unknown): { value: unknown; warnings: string[] } {
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
          tx["processors"] = (tx["processors"] as unknown[]).map((p) => {
            if (!isObj(p)) return p;
            const rawConfig = p["config"];
            // A `config` that is present but neither an object nor `null` is
            // left untouched for Zod to reject.
            if (rawConfig !== undefined && rawConfig !== null && !isObj(rawConfig)) return p;

            const proc: Record<string, unknown> = { ...p };
            // `config: null` (the whole block) is treated as absent, same as
            // every other optional key — `stripNulls` below removes the key.
            let cfg: Record<string, unknown> | undefined = isObj(rawConfig)
              ? { ...rawConfig }
              : undefined;

            // Legacy-position migration. This library emitted
            // `startNewTxOnDispatch` on the *processor object* for its entire
            // history before 0.8.3, which requires it inside `config` and
            // hard-400s the processor-level key ("unknown field"). Without
            // this, every previously-saved COMMIT_BEFORE_DISPATCH processor
            // would silently lose its transactional semantics on first open.
            // Relocation is lossless: there is exactly one correct
            // destination. A value already in `config` wins — the
            // processor-level one is the legacy position.
            if ("startNewTxOnDispatch" in proc) {
              const legacy = proc["startNewTxOnDispatch"];
              delete proc["startNewTxOnDispatch"];
              if (legacy !== null && !(cfg !== undefined && "startNewTxOnDispatch" in cfg)) {
                cfg = { ...(cfg ?? {}), startNewTxOnDispatch: legacy };
              }
            }

            // Dropped-key warnings are computed on the *original* keys, before
            // null-stripping (an unknown key is unknown, and will be silently
            // dropped by Zod, whether its value is null or not; a null value on
            // a *known* key such as `context: null` is not a dropped key) but
            // *after* the migration above, so the relocated field is not
            // reported as dropped.
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
          });
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
