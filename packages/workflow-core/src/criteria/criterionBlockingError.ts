// packages/workflow-core/src/criteria/criterionBlockingError.ts
import type { Criterion } from "../types/criterion.js";
import type { OperatorType } from "../types/operator.js";
import type { OperatorValue } from "../types/criterion.js";
import { NAME_REGEX } from "../schema/name.js";
import { OPERATOR_VALUE_SHAPE, type OperatorValueShape } from "./operators.js";
import { validateJsonPathSubset } from "./jsonPathSubset.js";

function shapeOf(op: OperatorValue): OperatorValueShape {
  return OPERATOR_VALUE_SHAPE[op as OperatorType] ?? "scalar";
}

function formatScalar(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function jsonPathBlockingError(jsonPath: string): string | null {
  if (jsonPath === "") return "Choose a field for this condition.";
  const check = validateJsonPathSubset(jsonPath);
  return check.ok ? null : `JSON path is invalid (${check.reason}).`;
}

function rangeBlockingError(operation: OperatorValue, value: unknown): string | null {
  if (operation !== "BETWEEN" && operation !== "BETWEEN_INCLUSIVE") return null;
  return Array.isArray(value) &&
    value.length === 2 &&
    formatScalar(value[0]).trim() !== "" &&
    formatScalar(value[1]).trim() !== ""
    ? null
    : "BETWEEN requires both Low and High values.";
}

/**
 * First human-readable reason this criterion may not be committed, or null if
 * it is committable. Recurses into `group.conditions` and `function.criterion`.
 * Mirrors the rules the old structured builder enforced; the JSON schema stays
 * deliberately permissive (issue #22), so this is where strictness lives.
 */
export function criterionBlockingError(criterion: Criterion): string | null {
  switch (criterion.type) {
    case "simple": {
      const pathError = jsonPathBlockingError(criterion.jsonPath);
      if (pathError) return pathError;
      if (
        shapeOf(criterion.operation) === "scalar" &&
        (criterion.value === undefined || formatScalar(criterion.value).trim() === "")
      ) {
        return "Value is required.";
      }
      return rangeBlockingError(criterion.operation, criterion.value);
    }
    case "array":
      return jsonPathBlockingError(criterion.jsonPath);
    case "lifecycle":
      if (!NAME_REGEX.test(criterion.field)) return null;
      if (
        shapeOf(criterion.operation) === "scalar" &&
        (criterion.value === undefined || formatScalar(criterion.value).trim() === "")
      ) {
        return "Value is required.";
      }
      return rangeBlockingError(criterion.operation, criterion.value);
    case "function":
      if (!criterion.function.name || !NAME_REGEX.test(criterion.function.name)) {
        return "Function name is invalid.";
      }
      return criterion.function.criterion
        ? criterionBlockingError(criterion.function.criterion)
        : null;
    case "group":
      for (const child of criterion.conditions) {
        const childError = criterionBlockingError(child);
        if (childError) return childError;
      }
      return null;
  }
}
