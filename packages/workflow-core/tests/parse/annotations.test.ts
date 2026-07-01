import { describe, expect, test } from "vitest";
import { AnnotationsSchema, normalizeOperatorAlias, parseImportPayload } from "../../src/index.js";

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

describe("AnnotationsSchema is object-only", () => {
  test("accepts objects (including empty and nested)", () => {
    expect(AnnotationsSchema.safeParse({}).success).toBe(true);
    expect(AnnotationsSchema.safeParse({ a: { b: [1, 2] } }).success).toBe(true);
  });
  test("rejects non-objects", () => {
    for (const bad of [null, [], "s", 3, true]) {
      expect(AnnotationsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("workflow- and transition-level annotations survive parse", () => {
  test("workflow.annotations and transition.annotations are preserved", () => {
    const json = JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "NEW",
          active: true,
          annotations: { label: "L" },
          states: {
            NEW: {
              transitions: [
                { name: "go", next: "DONE", manual: false, annotations: { ui: 1 } },
              ],
            },
            DONE: { transitions: [] },
          },
        },
      ],
    });
    const result = parseImportPayload(json);
    const wf = result.document!.session.workflows[0]!;
    expect(wf.annotations).toEqual({ label: "L" });
    expect(wf.states["NEW"]!.transitions[0]!.annotations).toEqual({ ui: 1 });
  });
});
