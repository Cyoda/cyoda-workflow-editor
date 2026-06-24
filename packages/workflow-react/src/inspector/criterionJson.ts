import type { Criterion } from "@cyoda/workflow-core";
import { criterionBlockingError } from "@cyoda/workflow-core";

export interface CriterionJsonResult {
  criterion: Criterion | null;
  error: string | null;
}

export function criterionModelUri(key: string): string {
  return `cyoda://criterion/${key}.json`;
}

const VALID_TYPES = new Set(["simple", "group", "function", "lifecycle", "array"]);

/**
 * Light structural validation that accepts the full Criterion union including
 * empty-string fields that the zod schema rejects but criterionBlockingError
 * handles with user-friendly messages (issue #22 — schema stays permissive,
 * strictness lives in criterionBlockingError).
 */
function validateShape(raw: unknown): { ok: true; value: Criterion } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Expected a JSON object." };
  }
  const obj = raw as Record<string, unknown>;
  const type = obj["type"];
  if (typeof type !== "string" || !VALID_TYPES.has(type)) {
    const valid = [...VALID_TYPES].join(", ");
    return {
      ok: false,
      error: type == null
        ? `Missing required field "type". Expected one of: ${valid}.`
        : `Invalid type "${String(type)}". Expected one of: ${valid}.`,
    };
  }

  switch (type) {
    case "simple": {
      if (typeof obj["jsonPath"] !== "string") return { ok: false, error: 'Missing "jsonPath" (string).' };
      if (typeof obj["operation"] !== "string" || obj["operation"] === "") return { ok: false, error: 'Missing "operation" (string).' };
      return { ok: true, value: raw as Criterion };
    }
    case "array": {
      if (typeof obj["jsonPath"] !== "string") return { ok: false, error: 'Missing "jsonPath" (string).' };
      if (typeof obj["operation"] !== "string" || obj["operation"] === "") return { ok: false, error: 'Missing "operation" (string).' };
      if (!Array.isArray(obj["value"])) return { ok: false, error: '"value" must be an array of strings.' };
      return { ok: true, value: raw as Criterion };
    }
    case "lifecycle": {
      const validFields = new Set(["state", "creationDate", "previousTransition"]);
      if (typeof obj["field"] !== "string" || !validFields.has(obj["field"])) {
        return { ok: false, error: '"field" must be one of: state, creationDate, previousTransition.' };
      }
      if (typeof obj["operation"] !== "string" || obj["operation"] === "") return { ok: false, error: 'Missing "operation" (string).' };
      return { ok: true, value: raw as Criterion };
    }
    case "group": {
      if (!["AND", "OR", "NOT"].includes(obj["operator"] as string)) {
        return { ok: false, error: '"operator" must be one of: AND, OR, NOT.' };
      }
      if (!Array.isArray(obj["conditions"]) || obj["conditions"].length < 1) {
        return { ok: false, error: '"conditions" must be a non-empty array.' };
      }
      for (let i = 0; i < (obj["conditions"] as unknown[]).length; i++) {
        const child = validateShape((obj["conditions"] as unknown[])[i]);
        if (!child.ok) return { ok: false, error: `conditions[${i}]: ${child.error}` };
      }
      return { ok: true, value: raw as Criterion };
    }
    case "function": {
      const fn = obj["function"];
      if (typeof fn !== "object" || fn === null) return { ok: false, error: '"function" must be an object.' };
      const fnObj = fn as Record<string, unknown>;
      if (typeof fnObj["name"] !== "string" || fnObj["name"] === "") {
        return { ok: false, error: '"function.name" is required.' };
      }
      return { ok: true, value: raw as Criterion };
    }
    default:
      return { ok: false, error: "Unrecognized criterion type." };
  }
}

/** Three-stage gate: JSON.parse -> structural shape check -> criterionBlockingError. */
export function parseCriterionJson(text: string): CriterionJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { criterion: null, error: "Invalid JSON." };
  }
  const shaped = validateShape(raw);
  if (!shaped.ok) {
    return { criterion: null, error: shaped.error };
  }
  const blocking = criterionBlockingError(shaped.value);
  if (blocking) return { criterion: null, error: blocking };
  return { criterion: shaped.value, error: null };
}
