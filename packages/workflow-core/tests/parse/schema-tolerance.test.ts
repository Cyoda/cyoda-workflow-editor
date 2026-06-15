import { describe, expect, test } from "vitest";
import { parseImportPayload, serializeImportPayload } from "../../src/index.js";

// Schema-tolerance fixes for round-tripping real cyoda-go exports.
// Issues #21 (empty-transition states), #22 (unknown operators), #23 (optional active).

function importJson(workflow: Record<string, unknown>): string {
  return JSON.stringify({ importMode: "MERGE", workflows: [workflow] });
}

describe("#21 empty-transition states serialized as {}", () => {
  test("a state with no transitions key parses with transitions: []", () => {
    const json = importJson({
      version: "1.0",
      name: "wf",
      initialState: "new",
      active: true,
      states: {
        new: { transitions: [{ name: "go", next: "done", manual: true }] },
        done: {}, // cyoda-go omits `transitions` for a terminal state
      },
    });

    const result = parseImportPayload(json);

    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.value?.workflows[0]?.states["done"]?.transitions).toEqual([]);
  });
});

describe("#23 workflow.active optional", () => {
  test("a workflow omitting `active` parses with active: true", () => {
    const json = importJson({
      version: "1.0",
      name: "wf",
      initialState: "only",
      states: { only: { transitions: [] } },
    });

    const result = parseImportPayload(json);

    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.value?.workflows[0]?.active).toBe(true);
  });
});

describe("#22 unknown operators round-trip with a warning", () => {
  test("an out-of-set operator parses, round-trips, and warns once", () => {
    const json = importJson({
      version: "1.0",
      name: "wf",
      initialState: "new",
      active: true,
      states: {
        new: {
          transitions: [
            {
              name: "go",
              next: "done",
              manual: false,
              criterion: { type: "simple", jsonPath: "$.x", operation: "REGEXP", value: "^a$" },
            },
          ],
        },
        done: { transitions: [] },
      },
    });

    const result = parseImportPayload(json);

    // No hard error — round-trip must always succeed.
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);

    const notRecognized = result.issues.filter((i) => i.code === "operator-not-recognized");
    expect(notRecognized).toHaveLength(1);
    expect(notRecognized[0]?.severity).toBe("warning");

    // The unknown operator is preserved verbatim on serialize.
    const out = serializeImportPayload(result.document!);
    expect(out).toContain('"operation": "REGEXP"');
  });

  test("a known-but-engine-unimplemented operator warns as unsupported, not unrecognized", () => {
    const json = importJson({
      version: "1.0",
      name: "wf",
      initialState: "new",
      active: true,
      states: {
        new: {
          transitions: [
            {
              name: "go",
              next: "done",
              manual: false,
              criterion: { type: "simple", jsonPath: "$.x", operation: "IS_CHANGED" },
            },
          ],
        },
        done: { transitions: [] },
      },
    });

    const result = parseImportPayload(json);

    expect(result.issues.some((i) => i.code === "operator-not-recognized")).toBe(false);
    expect(result.issues.some((i) => i.code === "unsupported-operator")).toBe(true);
  });
});
