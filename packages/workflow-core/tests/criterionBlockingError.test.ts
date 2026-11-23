// packages/workflow-core/tests/criterionBlockingError.test.ts
import { describe, it, expect } from "vitest";
import { criterionBlockingError } from "../src/index.js";
import type { Criterion } from "../src/index.js";

describe("criterionBlockingError", () => {
  it("passes a complete simple criterion", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.status", operation: "EQUALS", value: "OK" };
    expect(criterionBlockingError(c)).toBeNull();
  });

  it("blocks an empty jsonPath", () => {
    const c: Criterion = { type: "simple", jsonPath: "", operation: "EQUALS", value: "x" };
    expect(criterionBlockingError(c)).toBe("Choose a field for this condition.");
  });

  it("blocks an unsupported jsonPath expression", () => {
    const c: Criterion = { type: "simple", jsonPath: "$..deep", operation: "EQUALS", value: "x" };
    expect(criterionBlockingError(c)).toMatch(/JSON path is invalid/);
  });

  it("blocks a scalar operator with no value", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.a", operation: "EQUALS" };
    expect(criterionBlockingError(c)).toBe("Value is required.");
  });

  it("blocks BETWEEN without a 2-element array", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.a", operation: "BETWEEN", value: [1] };
    expect(criterionBlockingError(c)).toMatch(/BETWEEN requires/);
  });

  it("blocks an invalid function name", () => {
    const c: Criterion = { type: "function", function: { name: "" } };
    expect(criterionBlockingError(c)).toBe("Function name is invalid.");
  });

  it("recurses into a function precheck", () => {
    const c: Criterion = {
      type: "function",
      function: { name: "myFn", criterion: { type: "simple", jsonPath: "", operation: "EQUALS" } },
    };
    expect(criterionBlockingError(c)).toBe("Choose a field for this condition.");
  });

  it("recurses into group conditions and reports the first failure", () => {
    const c: Criterion = {
      type: "group",
      operator: "AND",
      conditions: [
        { type: "simple", jsonPath: "$.ok", operation: "EQUALS", value: "y" },
        { type: "simple", jsonPath: "", operation: "EQUALS", value: "y" },
      ],
    };
    expect(criterionBlockingError(c)).toBe("Choose a field for this condition.");
  });

  it("validates jsonPath and the trailing [*] for array criteria", () => {
    expect(criterionBlockingError({ type: "array", jsonPath: "$.tags[*]", operation: "EQUALS", value: ["a", null] })).toBeNull();
    expect(criterionBlockingError({ type: "array", jsonPath: "", operation: "CONTAINS", value: [] })).toBe("Choose a field for this condition.");
    expect(criterionBlockingError({ type: "array", jsonPath: "$.tags", operation: "EQUALS", value: ["a"] })).toMatch(/must end in \[\*\]/);
    expect(criterionBlockingError({ type: "array", jsonPath: "$.items[*].sku", operation: "EQUALS", value: ["a"] })).toMatch(/must end in \[\*\]/);
  });

  it("blocks an array criterion that tests no position, or has an inner wildcard (cyoda-go 0.9.0)", () => {
    expect(criterionBlockingError({ type: "array", jsonPath: "$.tags[*]", operation: "EQUALS", value: [] })).toMatch(/at least one position/);
    expect(criterionBlockingError({ type: "array", jsonPath: "$.tags[*]", operation: "EQUALS", value: [null, null] })).toMatch(/at least one position/);
    expect(criterionBlockingError({ type: "array", jsonPath: "$.x[*].y[*]", operation: "EQUALS", value: ["a"] })).toMatch(/wildcard before/);
  });

  it("blocks an array or object operand outside BETWEEN, and non-scalar BETWEEN bounds", () => {
    expect(criterionBlockingError({ type: "simple", jsonPath: "$.a", operation: "EQUALS", value: ["a", "b"] })).toMatch(/single value/);
    expect(criterionBlockingError({ type: "lifecycle", field: "state", operation: "EQUALS", value: ["A"] })).toMatch(/single value/);
    expect(criterionBlockingError({ type: "simple", jsonPath: "$.a", operation: "EQUALS", value: { a: 1 } })).toMatch(/not an object/);
    expect(criterionBlockingError({ type: "simple", jsonPath: "$.a", operation: "BETWEEN", value: [1, { a: 1 }] })).toMatch(/scalars/);
    expect(criterionBlockingError({ type: "simple", jsonPath: "$.a", operation: "BETWEEN", value: [1, 5] })).toBeNull();
  });

  it("checks [low, high] pair entries of an array clause against its operator", () => {
    const arr = (operation: string, value: unknown[]): Criterion =>
      ({ type: "array", jsonPath: "$.s[*]", operation, value }) as Criterion;
    expect(criterionBlockingError(arr("BETWEEN", [[1, 2], null]))).toBeNull();
    expect(criterionBlockingError(arr("BETWEEN", [5]))).toMatch(/\[low, high\] pair/);
    expect(criterionBlockingError(arr("BETWEEN", [[1, null]]))).toMatch(/\[low, high\] pair/);
    expect(criterionBlockingError(arr("EQUALS", [[1, 2]]))).toMatch(/single value/);
  });

  it("blocks a function condition inside a pre-check, but not inside a group", () => {
    const fn: Criterion = { type: "function", function: { name: "inner" } };
    expect(criterionBlockingError({ type: "function", function: { name: "outer", criterion: fn } })).toMatch(/pre-check/);
    expect(
      criterionBlockingError({
        type: "function",
        function: { name: "outer", criterion: { type: "group", operator: "AND", conditions: [fn] } },
      }),
    ).toMatch(/pre-check/);
    expect(criterionBlockingError({ type: "group", operator: "AND", conditions: [fn] })).toBeNull();
  });

  it("blocks a NOT group without exactly one condition", () => {
    const leaf: Criterion = { type: "simple", jsonPath: "$.a", operation: "EQUALS", value: 1 };
    expect(criterionBlockingError({ type: "group", operator: "NOT", conditions: [leaf] })).toBeNull();
    expect(criterionBlockingError({ type: "group", operator: "NOT", conditions: [leaf, leaf] })).toMatch(/exactly one/);
  });

  it("blocks a LIKE pattern ending in an unpaired escape", () => {
    expect(criterionBlockingError({ type: "simple", jsonPath: "$.a", operation: "LIKE", value: "abc\\" })).toMatch(/unpaired escape/);
    expect(criterionBlockingError({ type: "simple", jsonPath: "$.a", operation: "LIKE", value: "abc\\\\" })).toBeNull();
    expect(criterionBlockingError({ type: "lifecycle", field: "state", operation: "LIKE", value: "a\\" })).toMatch(/unpaired escape/);
  });
});
