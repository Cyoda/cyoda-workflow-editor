import { outputWorkflow } from "../normalize/output.js";
import { normalizeOperatorAlias } from "../parse/operator-alias.js";
import type { Workflow } from "../types/workflow.js";
import type { CyodaDialect, ToCanonicalResult } from "./dialect.js";

/**
 * The cyoda-go 0.7.x dialect.
 *
 * `toCanonical` runs the historical operator-alias normalisation + canonical-
 * default coercion, then drops any `{type:"scheduled"}` processors. Scheduled
 * processors were an unsupported v0.7 platform hack; they no longer exist in the
 * canonical model (see the v0.8 major bump). Each dropped processor is reported
 * as a warning so the host can tell the user.
 *
 * `workflowsToWire` emits the historical `outputWorkflow` shape. It never emits
 * a `scheduled` processor (the canonical model has none) nor `transitions[].schedule`
 * (the field does not exist in the v0.7 wire format); an explicit safety-net
 * filter strips any non-`externalized` processor that somehow reaches it.
 */
export const cyoda07Dialect: CyodaDialect = {
  version: "0.7",
  toCanonical(raw: unknown): ToCanonicalResult {
    const defaulted = coerceCanonicalDefaults(normalizeOperatorAlias(raw));
    return dropScheduledProcessors(defaulted);
  },
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>> {
    return workflows.map((wf) => stripNonExternalizedProcessors(outputWorkflow(wf)));
  },
};

/**
 * Pre-schema coercion for canonical Cyoda workflow payloads that omit fields
 * the schema considers required with a known safe default.
 *
 * - Processor objects with a `name` but no `type` default to `"externalized"`.
 *   (`disabled` and `transitions` defaults are handled by Zod directly.)
 *
 * Runs before Zod validation on the raw parsed value so the schema stays
 * unchanged and round-trip semantics are preserved. Exported so the 0.8 dialect
 * can reuse the same alias/defaults pass without duplicating it.
 */
export function coerceCanonicalDefaults(value: unknown): unknown {
  if (!isObj(value)) return value;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v["workflows"])) return value;
  return {
    ...v,
    workflows: v["workflows"].map((wf) => {
      if (!isObj(wf)) return wf;
      const w = wf as Record<string, unknown>;
      if (!isObj(w["states"])) return wf;
      const states = w["states"] as Record<string, unknown>;
      const nextStates: Record<string, unknown> = {};
      for (const [code, state] of Object.entries(states)) {
        if (!isObj(state)) {
          nextStates[code] = state;
          continue;
        }
        const s = state as Record<string, unknown>;
        if (!Array.isArray(s["transitions"])) {
          nextStates[code] = state;
          continue;
        }
        nextStates[code] = {
          ...s,
          transitions: s["transitions"].map((t) => {
            if (!isObj(t)) return t;
            const tx = t as Record<string, unknown>;
            if (!Array.isArray(tx["processors"])) return t;
            return {
              ...tx,
              processors: tx["processors"].map((p) => {
                if (!isObj(p)) return p;
                const proc = p as Record<string, unknown>;
                if (typeof proc["type"] === "string") return p;
                return { type: "externalized", ...proc };
              }),
            };
          }),
        };
      }
      return { ...w, states: nextStates };
    }),
  };
}

/**
 * Remove every `{type:"scheduled"}` processor from a canonical raw payload,
 * recording each removal as `dropped-scheduled-processor:<name>`. Case-insensitive
 * on the type literal to cover both the `scheduled` and `SCHEDULED` casings seen
 * across v0.7.x wire variants.
 */
function dropScheduledProcessors(value: unknown): ToCanonicalResult {
  const warnings: string[] = [];
  if (!isObj(value) || !Array.isArray(value["workflows"])) {
    return { value, warnings };
  }
  const v = value as Record<string, unknown>;
  const workflows = (v["workflows"] as unknown[]).map((wf) => {
    if (!isObj(wf) || !isObj(wf["states"])) return wf;
    const w = wf as Record<string, unknown>;
    const states = w["states"] as Record<string, unknown>;
    const nextStates: Record<string, unknown> = {};
    for (const [code, state] of Object.entries(states)) {
      if (!isObj(state) || !Array.isArray((state as Record<string, unknown>)["transitions"])) {
        nextStates[code] = state;
        continue;
      }
      const s = state as Record<string, unknown>;
      nextStates[code] = {
        ...s,
        transitions: (s["transitions"] as unknown[]).map((t) => {
          if (!isObj(t) || !Array.isArray((t as Record<string, unknown>)["processors"])) return t;
          const tx = t as Record<string, unknown>;
          const kept = (tx["processors"] as unknown[]).filter((p) => {
            if (isScheduledProcessor(p)) {
              const name = isObj(p) && typeof p["name"] === "string" ? p["name"] : "(unnamed)";
              warnings.push(`dropped-scheduled-processor:${name}`);
              return false;
            }
            return true;
          });
          return { ...tx, processors: kept };
        }),
      };
    }
    return { ...w, states: nextStates };
  });
  return { value: { ...v, workflows }, warnings };
}

function isScheduledProcessor(p: unknown): boolean {
  return isObj(p) && typeof p["type"] === "string" && p["type"].toLowerCase() === "scheduled";
}

/**
 * Safety net: strip any processor whose `type` is not `externalized` from a wire
 * workflow. The canonical model only contains externalized processors, so this
 * should never remove anything — it guards against a future regression.
 */
function stripNonExternalizedProcessors(
  wf: Record<string, unknown>,
): Record<string, unknown> {
  if (!isObj(wf["states"])) return wf;
  const states = wf["states"] as Record<string, unknown>;
  const nextStates: Record<string, unknown> = {};
  for (const [code, state] of Object.entries(states)) {
    if (!isObj(state) || !Array.isArray((state as Record<string, unknown>)["transitions"])) {
      nextStates[code] = state;
      continue;
    }
    const s = state as Record<string, unknown>;
    nextStates[code] = {
      ...s,
      transitions: (s["transitions"] as unknown[]).map((t) => {
        if (!isObj(t) || !Array.isArray((t as Record<string, unknown>)["processors"])) return t;
        const tx = t as Record<string, unknown>;
        return {
          ...tx,
          processors: (tx["processors"] as unknown[]).filter(
            (p) => isObj(p) && p["type"] === "externalized",
          ),
        };
      }),
    };
  }
  return { ...wf, states: nextStates };
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
