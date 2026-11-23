import { describe, expect, test } from "vitest";
import { findUnknownCriterionMembers } from "../../src/index.js";

describe("findUnknownCriterionMembers", () => {
  test("a clean tree reports nothing", () => {
    expect(
      findUnknownCriterionMembers({
        type: "group",
        operator: "AND",
        conditions: [
          { type: "simple", jsonPath: "$.a", operation: "EQUALS", value: 1 },
          {
            type: "function",
            function: {
              name: "f",
              config: { attachEntity: false, calculationNodesTags: "t", responseTimeoutMs: 5, retryPolicy: "NONE", context: "c" },
              criterion: { type: "lifecycle", field: "state", operation: "IS_NULL" },
            },
          },
          { type: "array", jsonPath: "$.t[*]", operation: "BETWEEN", value: [[1, 2]] },
        ],
      }),
    ).toEqual([]);
  });

  test("reports each offending object with a JSON Pointer, in tree order", () => {
    expect(
      findUnknownCriterionMembers({
        type: "group",
        operator: "OR",
        note: "root",
        conditions: [
          { type: "simple", jsonPath: "$.a", operation: "EQUALS", value: 1, x: 1, y: 2 },
          { type: "function", function: { name: "f", calculationNodesTags: "t", config: { foo: 1 } } },
        ],
      }),
    ).toEqual([
      { pointer: "", keys: ["note"] },
      { pointer: "/conditions/0", keys: ["x", "y"] },
      { pointer: "/conditions/1/function", keys: ["calculationNodesTags"] },
      { pointer: "/conditions/1/function/config", keys: ["foo"] },
    ]);
  });

  test("skips nodes of an unknown type and non-objects", () => {
    expect(findUnknownCriterionMembers({ type: "bogus", anything: 1 })).toEqual([]);
    expect(findUnknownCriterionMembers(null)).toEqual([]);
    expect(findUnknownCriterionMembers([1, 2])).toEqual([]);
  });

  test("handles a very deep tree without recursion", () => {
    let node: Record<string, unknown> = { type: "simple", jsonPath: "$.a", operation: "EQUALS", value: 1, x: 1 };
    for (let i = 0; i < 20_000; i++) node = { type: "group", operator: "AND", conditions: [node] };
    const found = findUnknownCriterionMembers(node);
    expect(found).toHaveLength(1);
    expect(found[0]!.keys).toEqual(["x"]);
  });
});
