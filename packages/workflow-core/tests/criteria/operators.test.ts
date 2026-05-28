import { describe, expect, test } from "vitest";
import {
  OPERATOR_GROUPS,
  OPERATOR_VALUE_SHAPE,
  SUPPORTED_GROUP_OPERATORS,
  SUPPORTED_SIMPLE_OPERATORS,
  UNSUPPORTED_OPERATORS,
} from "../../src/criteria/operators.js";
import { OPERATOR_TYPES } from "../../src/types/operator.js";
import type { OperatorType } from "../../src/types/operator.js";

describe("operator catalogue", () => {
  test("SUPPORTED_SIMPLE_OPERATORS has exactly 26 entries", () => {
    expect(SUPPORTED_SIMPLE_OPERATORS.size).toBe(26);
  });

  test("UNSUPPORTED_OPERATORS is { IS_UNCHANGED, IS_CHANGED }", () => {
    expect([...UNSUPPORTED_OPERATORS].sort()).toEqual(["IS_CHANGED", "IS_UNCHANGED"]);
  });

  test("supported and unsupported sets are disjoint", () => {
    for (const op of UNSUPPORTED_OPERATORS) {
      expect(SUPPORTED_SIMPLE_OPERATORS.has(op)).toBe(false);
    }
  });

  test("supported ∪ unsupported === OPERATOR_TYPES", () => {
    const union = new Set<OperatorType>([
      ...SUPPORTED_SIMPLE_OPERATORS,
      ...UNSUPPORTED_OPERATORS,
    ]);
    expect(union.size).toBe(OPERATOR_TYPES.size);
    for (const op of OPERATOR_TYPES) expect(union.has(op)).toBe(true);
  });

  test("SUPPORTED_GROUP_OPERATORS is AND/OR only", () => {
    expect(SUPPORTED_GROUP_OPERATORS).toEqual(["AND", "OR"]);
  });

  test("OPERATOR_GROUPS cover every supported simple operator exactly once", () => {
    const seen = new Set<OperatorType>();
    for (const g of OPERATOR_GROUPS) {
      for (const op of g.operators) {
        expect(seen.has(op)).toBe(false);
        seen.add(op);
        expect(SUPPORTED_SIMPLE_OPERATORS.has(op)).toBe(true);
      }
    }
    expect(seen.size).toBe(SUPPORTED_SIMPLE_OPERATORS.size);
  });

  test("OPERATOR_VALUE_SHAPE: range for BETWEEN, none for nulls, scalar otherwise", () => {
    expect(OPERATOR_VALUE_SHAPE.BETWEEN).toBe("range");
    expect(OPERATOR_VALUE_SHAPE.BETWEEN_INCLUSIVE).toBe("range");
    expect(OPERATOR_VALUE_SHAPE.IS_NULL).toBe("none");
    expect(OPERATOR_VALUE_SHAPE.NOT_NULL).toBe("none");
    expect(OPERATOR_VALUE_SHAPE.IS_CHANGED).toBe("none");
    expect(OPERATOR_VALUE_SHAPE.IS_UNCHANGED).toBe("none");
    expect(OPERATOR_VALUE_SHAPE.EQUALS).toBe("scalar");
    expect(OPERATOR_VALUE_SHAPE.LIKE).toBe("scalar");
    expect(OPERATOR_VALUE_SHAPE.MATCHES_PATTERN).toBe("scalar");
  });
});
