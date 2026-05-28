import type { Criterion } from "../types/criterion.js";
import type { OperatorType } from "../types/operator.js";

const OPERATOR_SYMBOL: Readonly<Partial<Record<OperatorType, string>>> = {
  EQUALS: "=",
  NOT_EQUAL: "≠",
  GREATER_THAN: ">",
  LESS_THAN: "<",
  GREATER_OR_EQUAL: "≥",
  LESS_OR_EQUAL: "≤",
  IEQUALS: "=",
  INOT_EQUAL: "≠",
};

export function describeCriterion(c: Criterion): string {
  switch (c.type) {
    case "simple":
      return describeBinary(c.jsonPath, c.operation, c.value);
    case "group": {
      const n = c.conditions.length;
      return `${c.operator} (${n} condition${n === 1 ? "" : "s"})`;
    }
    case "function":
      return `Function: ${c.function.name || "<unnamed>"}`;
    case "lifecycle":
      return describeBinary(c.field, c.operation, c.value);
    case "array": {
      const n = c.value.length;
      return `${c.jsonPath} ${c.operation} [${n} value${n === 1 ? "" : "s"}]`;
    }
  }
}

function describeBinary(lhs: string, op: OperatorType, value: unknown): string {
  if (op === "IS_NULL") return `${lhs} IS NULL`;
  if (op === "NOT_NULL") return `${lhs} IS NOT NULL`;
  if (op === "IS_CHANGED") return `${lhs} CHANGED`;
  if (op === "IS_UNCHANGED") return `${lhs} UNCHANGED`;
  if (op === "BETWEEN" || op === "BETWEEN_INCLUSIVE") {
    const inclusive = op === "BETWEEN_INCLUSIVE";
    if (Array.isArray(value) && value.length === 2) {
      return `${lhs} ∈ ${inclusive ? "[" : "("}${formatValue(value[0])}, ${formatValue(value[1])}${inclusive ? "]" : ")"}`;
    }
    return `${lhs} ${op} ${formatValue(value)}`;
  }
  const symbol = OPERATOR_SYMBOL[op] ?? op;
  return `${lhs} ${symbol} ${formatValue(value)}`;
}

function formatValue(v: unknown): string {
  if (v === undefined) return "?";
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v);
}
