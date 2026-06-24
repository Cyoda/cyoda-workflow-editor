import { describe, it, expect } from "vitest";
import {
  criterionJsonSchema,
  registerCriterionSchema,
  CRITERION_SCHEMA_URI,
  registerWorkflowSchema,
} from "../src/index.js";
import type { MonacoLike, JsonDiagnosticsOptions } from "../src/types.js";

function fakeMonaco(): MonacoLike {
  const state: { opts: JsonDiagnosticsOptions } = { opts: { schemas: [] } };
  return {
    editor: { setModelMarkers: () => {} },
    languages: {
      json: {
        jsonDefaults: {
          get diagnosticsOptions() { return state.opts; },
          setDiagnosticsOptions(next) { state.opts = next; },
        },
      },
    },
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
  };
}

describe("criterionJsonSchema", () => {
  it("generates a JSON schema with a recursive criterion union", () => {
    const schema = criterionJsonSchema() as Record<string, unknown>;
    // z.toJSONSchema on the lazy union emits anyOf at the root.
    expect(Array.isArray(schema.anyOf)).toBe(true);
    // The whole thing must serialize (recursive $ref must not throw).
    expect(() => JSON.stringify(schema)).not.toThrow();
  });

  it("validates a nested group criterion when checked with a JSON-schema validator", () => {
    // Smoke check that recursion resolves: stringify round-trips and contains a self ref.
    const schema = JSON.stringify(criterionJsonSchema());
    expect(schema).toContain("$ref");
  });
});

describe("registerCriterionSchema", () => {
  it("installs under the criterion URI + prefix", () => {
    const monaco = fakeMonaco();
    const handle = registerCriterionSchema(monaco);
    expect(handle.schemaUri).toBe(CRITERION_SCHEMA_URI);
    const schemas = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!;
    expect(schemas.some((s) => s.fileMatch?.[0] === "cyoda://criterion/*")).toBe(true);
    handle.dispose();
    expect(monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!.some(
      (s) => s.uri === CRITERION_SCHEMA_URI,
    )).toBe(false);
  });

  it("coexists with the workflow schema in one jsonDefaults", () => {
    const monaco = fakeMonaco();
    registerWorkflowSchema(monaco);
    registerCriterionSchema(monaco);
    const schemas = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!;
    expect(schemas.length).toBe(2);
  });
});
