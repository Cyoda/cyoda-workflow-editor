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

  it("validates only jsonPath for array criteria", () => {
    expect(criterionBlockingError({ type: "array", jsonPath: "$.tags", operation: "CONTAINS", value: [] })).toBeNull();
    expect(criterionBlockingError({ type: "array", jsonPath: "", operation: "CONTAINS", value: [] })).toBe("Choose a field for this condition.");
  });
});
