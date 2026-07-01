import { describe, expect, test } from "vitest";
import { normalizeOperatorAlias } from "../../src/index.js";

describe("normalizeOperatorAlias leaves annotations untouched", () => {
  test("does not rename operatorType inside an annotations object", () => {
    const input = {
      workflows: [
        { name: "wf", annotations: { filter: { operatorType: "custom" } }, states: {} },
      ],
    };
    const out = normalizeOperatorAlias(input) as typeof input;
    expect(out.workflows[0]!.annotations).toEqual({ filter: { operatorType: "custom" } });
  });

  test("does not throw when an annotation carries both operation and operatorType", () => {
    const input = { annotations: { operation: "A", operatorType: "B" } };
    expect(() => normalizeOperatorAlias(input)).not.toThrow();
    expect((normalizeOperatorAlias(input) as typeof input).annotations).toEqual({
      operation: "A",
      operatorType: "B",
    });
  });

  test("still aliases operatorType -> operation on a real criterion", () => {
    const out = normalizeOperatorAlias({
      type: "simple",
      jsonPath: "$.x",
      operatorType: "EQUALS",
      value: "1",
    }) as Record<string, unknown>;
    expect(out.operation).toBe("EQUALS");
    expect("operatorType" in out).toBe(false);
  });
});
