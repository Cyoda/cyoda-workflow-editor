import { describe, expect, test } from "vitest";
import { describeCriterion } from "../../src/criteria/describe.js";
import type { Criterion } from "../../src/types/criterion.js";

describe("describeCriterion", () => {
  test("simple EQUALS", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.x", operation: "EQUALS", value: 1 };
    expect(describeCriterion(c)).toBe("$.x = 1");
  });

  test("simple GREATER_THAN string value", () => {
    const c: Criterion = {
      type: "simple",
      jsonPath: "$.name",
      operation: "GREATER_THAN",
      value: "alice",
    };
    expect(describeCriterion(c)).toBe('$.name > "alice"');
  });

  test("simple IS_NULL omits value", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.a", operation: "IS_NULL", value: null };
    expect(describeCriterion(c)).toBe("$.a IS NULL");
  });

  test("simple BETWEEN renders range", () => {
    const c: Criterion = {
      type: "simple",
      jsonPath: "$.n",
      operation: "BETWEEN",
      value: [0, 10],
    };
    expect(describeCriterion(c)).toBe("$.n ∈ (0, 10)");
  });

  test("simple BETWEEN_INCLUSIVE renders inclusive range", () => {
    const c: Criterion = {
      type: "simple",
      jsonPath: "$.n",
      operation: "BETWEEN_INCLUSIVE",
      value: [0, 10],
    };
    expect(describeCriterion(c)).toBe("$.n ∈ [0, 10]");
  });

  test("group", () => {
    const c: Criterion = {
      type: "group",
      operator: "AND",
      conditions: [
        { type: "simple", jsonPath: "$.a", operation: "EQUALS", value: 1 },
        { type: "simple", jsonPath: "$.b", operation: "EQUALS", value: 2 },
      ],
    };
    expect(describeCriterion(c)).toBe("AND (2 conditions)");
  });

  test("function", () => {
    const c: Criterion = { type: "function", function: { name: "HasOrder" } };
    expect(describeCriterion(c)).toBe("Function: HasOrder");
  });

  test("lifecycle", () => {
    const c: Criterion = {
      type: "lifecycle",
      field: "state",
      operation: "EQUALS",
      value: "APPROVED",
    };
    expect(describeCriterion(c)).toBe('state = "APPROVED"');
  });

  test("array", () => {
    const c: Criterion = {
      type: "array",
      jsonPath: "$.tag",
      operation: "EQUALS",
      value: ["a", "b", "c"],
    };
    expect(describeCriterion(c)).toBe("$.tag EQUALS [3 values]");
  });
});
