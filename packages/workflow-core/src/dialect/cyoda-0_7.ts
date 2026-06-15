import { outputWorkflow } from "../normalize/output.js";
import { normalizeOperatorAlias } from "../parse/operator-alias.js";
import type { Workflow } from "../types/workflow.js";
import type { CyodaDialect } from "./dialect.js";

/**
 * The cyoda-go 0.7.x dialect — the baseline this editor targets by default.
 *
 * `toCanonical` and `workflowsToWire` reproduce the editor's historical
 * behaviour exactly (operator-alias normalisation + canonical-default coercion
 * on the way in; `outputWorkflow` on the way out), so introducing the dialect
 * seam is behaviour-neutral for 0.7.
 */
export const cyoda07Dialect: CyodaDialect = {
  version: "0.7",
  toCanonical(raw: unknown): unknown {
    return coerceCanonicalDefaults(normalizeOperatorAlias(raw));
  },
  workflowsToWire(workflows: Workflow[]): Array<Record<string, unknown>> {
    return workflows.map(outputWorkflow);
  },
};

/**
 * Pre-schema coercion for canonical Cyoda workflow payloads that omit fields
 * the schema considers required with a known safe default.
 *
 * - Processor objects with a `name` but no `type` default to `"externalized"`.
 *   (`disabled` and `transitions` defaults are handled by Zod directly.)
 *
 * Runs before Zod validation on the raw parsed value so the discriminated-union
 * schema stays unchanged and round-trip semantics are preserved. Previously
 * lived in `parse/parse-import.ts`; relocated here as 0.7-specific dialect logic.
 */
function coerceCanonicalDefaults(value: unknown): unknown {
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

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
