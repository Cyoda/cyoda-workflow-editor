import { describe, expect, test } from "vitest";
import { parseImportPayload, validateSemantics } from "../../src/index.js";
import type { WorkflowSession } from "../../src/index.js";

// Regression: `Array.prototype.push(...arr)` passes every element as a call
// argument, so an array beyond the engine's argument limit (~125k on V8)
// throws `RangeError: Maximum call stack size exceeded`. A 260 KB file is
// enough to trigger it — far below the 5 MB input cap.
const BIG = 300_000;

function payload(extra: Record<string, unknown>): string {
  return JSON.stringify({
    importMode: "MERGE",
    workflows: [
      { version: "1.4", name: "w", initialState: "A", active: true, ...extra, states: { A: { transitions: [] } } },
    ],
  });
}

describe("very large arrays do not overflow the stack", () => {
  test("a huge array inside opaque annotations reaches the size rule, not a stack overflow", () => {
    const r = parseImportPayload(payload({ annotations: { big: new Array(BIG).fill(1) } }));
    expect(r.document).toBeDefined();
    expect(r.issues.map((i) => i.code)).toContain("annotations-too-large");
    expect(r.issues.map((i) => i.message).join("\n")).not.toMatch(/call stack/i);
  });

  test("a huge array outside annotations is walked without a RangeError", () => {
    // Unknown top-level key: stripped by the schema, but the dialect's
    // legacy-`value` scan still walks the raw tree first.
    const raw = JSON.parse(payload({})) as Record<string, unknown>;
    raw["extra"] = new Array(BIG).fill(1);
    const r = parseImportPayload(JSON.stringify(raw));
    expect(r.issues.map((i) => i.message).join("\n")).not.toMatch(/call stack/i);
    expect(r.document).toBeDefined();
  });

  test("a group with a huge conditions list validates without a RangeError", () => {
    const leaf = { type: "simple" as const, jsonPath: "$.a", operation: "EQUALS", value: 1 };
    const session: WorkflowSession = {
      entity: null,
      importMode: "MERGE",
      workflows: [
        {
          version: "1.4",
          name: "w",
          initialState: "A",
          active: true,
          criterion: { type: "group", operator: "OR", conditions: new Array(BIG).fill(leaf) },
          states: { A: { transitions: [] } },
        },
      ],
    };
    expect(() => validateSemantics(session)).not.toThrow();
  });

  test("a criterion producing a huge number of issues is reported, not a RangeError", () => {
    const bad = { type: "simple" as const, jsonPath: "no-leader", operation: "EQUALS", value: 1 };
    const session: WorkflowSession = {
      entity: null,
      importMode: "MERGE",
      workflows: [
        {
          version: "1.4",
          name: "w",
          initialState: "A",
          active: true,
          criterion: { type: "group", operator: "OR", conditions: new Array(BIG).fill(bad) },
          states: { A: { transitions: [] } },
        },
      ],
    };
    const issues = validateSemantics(session);
    expect(issues.filter((i) => i.code === "invalid-jsonpath-subset")).toHaveLength(BIG);
  });
});
