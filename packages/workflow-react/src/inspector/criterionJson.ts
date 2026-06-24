import type { Criterion } from "@cyoda/workflow-core";
import { CriterionSchema, criterionBlockingError } from "@cyoda/workflow-core";

export interface CriterionJsonResult {
  criterion: Criterion | null;
  error: string | null;
}

export function criterionModelUri(key: string): string {
  return `cyoda://criterion/${key}.json`;
}

/** Map a zod error to a short, readable single-line message. */
function zodMessage(error: { issues: Array<{ message: string; path: PropertyKey[] }> }): string {
  const first = error.issues[0];
  if (!first) return "Invalid criterion.";
  const path = first.path.length ? ` at ${first.path.join(".")}` : "";
  return `${first.message}${path}`;
}

/**
 * Validation gate for a single criterion edited as JSON:
 *   1. JSON.parse
 *   2. CriterionSchema.safeParse  — structural/schema compliance (the canonical gate)
 *   3. criterionBlockingError     — the extra strictness the permissive schema does NOT
 *      encode (gjson jsonPath subset, BETWEEN arity, scalar value-required), AND the
 *      friendly messages for common incomplete states.
 *
 * On schema success: run criterionBlockingError on the validated value.
 * On schema failure: prefer a friendly criterionBlockingError message when it can produce
 * one safely (e.g. the empty-jsonPath seed), else fall back to the zod message.
 */
export function parseCriterionJson(text: string): CriterionJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { criterion: null, error: "Invalid JSON." };
  }

  const res = CriterionSchema.safeParse(raw);
  if (res.success) {
    const blocking = criterionBlockingError(res.data);
    if (blocking) return { criterion: null, error: blocking };
    return { criterion: res.data, error: null };
  }

  // Schema-invalid: surface a friendly blocking message when criterionBlockingError can
  // produce one on this (untyped) input without throwing; otherwise the zod message.
  let friendly: string | null = null;
  try {
    friendly = criterionBlockingError(raw as Criterion);
  } catch {
    friendly = null;
  }
  return { criterion: null, error: friendly ?? zodMessage(res.error) };
}
