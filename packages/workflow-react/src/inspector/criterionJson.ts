import type { Criterion } from "@cyoda/workflow-core";
import {
  CriterionSchema,
  criterionBlockingError,
  normalizeOperatorAlias,
} from "@cyoda/workflow-core";

export interface CriterionJsonResult {
  criterion: Criterion | null;
  error: string | null;
}

export function criterionModelUri(key: string): string {
  return `cyoda://criterion/${key}.json`;
}

/**
 * Render a criterion as the JSON the user edits: the canonical shape, except an
 * array clause's list is shown under its wire key `values` (the only key
 * cyoda-go reads) rather than the in-memory `value`.
 */
export function criterionToJsonText(c: Criterion): string {
  return JSON.stringify(criterionWireShape(c), null, 2);
}

export function criterionWireShape(c: Criterion): unknown {
  switch (c.type) {
    case "array": {
      const { value, ...rest } = c;
      return { ...rest, values: value };
    }
    case "group":
      return { ...c, conditions: c.conditions.map(criterionWireShape) };
    case "function":
      return c.function.criterion
        ? { ...c, function: { ...c.function, criterion: criterionWireShape(c.function.criterion) } }
        : c;
    default:
      return c;
  }
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
 *   1. JSON.parse, then the wire-alias pass (`operatorType` → `operation`,
 *      array `values` → `value`) so a clause pasted from a cyoda-go export parses
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
  try {
    raw = normalizeOperatorAlias(raw);
  } catch (e) {
    return { criterion: null, error: e instanceof Error ? e.message : "Invalid criterion." };
  }

  const res = CriterionSchema.safeParse(raw);
  if (res.success) {
    const blocking = criterionBlockingError(res.data);
    if (blocking) return { criterion: null, error: blocking };
    return { criterion: res.data, error: null };
  }

  // Schema-invalid: prefer a friendlier criterionBlockingError message for the common
  // incomplete-but-criterion-shaped cases (e.g. the empty-jsonPath "Add" seed). Only
  // attempt it when `raw` is plausibly a criterion object; the try/catch is a narrow
  // net for legitimately-partial criteria (e.g. a "simple" missing jsonPath) that can
  // throw inside criterionBlockingError — not a blanket swallow of arbitrary input.
  let friendly: string | null = null;
  if (typeof raw === "object" && raw !== null && typeof (raw as { type?: unknown }).type === "string") {
    try {
      friendly = criterionBlockingError(raw as Criterion);
    } catch {
      friendly = null;
    }
  }
  return { criterion: null, error: friendly ?? zodMessage(res.error) };
}
