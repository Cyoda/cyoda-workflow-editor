import { describe, it, expect } from "vitest";
import { workflowJsonSchema, registerWorkflowSchema, WORKFLOW_SCHEMA_URI } from "../src/index.js";
import type { MonacoLike, JsonDiagnosticsOptions } from "../src/types.js";

function fakeMonaco(): MonacoLike {
  const state: { opts: JsonDiagnosticsOptions } = { opts: { schemas: [] } };
  return {
    editor: { setModelMarkers: () => {} },
    languages: {
      json: {
        jsonDefaults: {
          get diagnosticsOptions() {
            return state.opts;
          },
          setDiagnosticsOptions(next) {
            state.opts = next;
          },
        },
      },
    },
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
  };
}

describe("workflowJsonSchema", () => {
  it("emits a JSON schema derived from ImportPayloadSchema", () => {
    const schema = workflowJsonSchema() as Record<string, unknown>;
    expect(schema).toBeTypeOf("object");
    expect(typeof schema.$schema === "string" || schema.type === "object").toBe(true);
  });

  it("encodes the ImportPayloadSchema structure under zod 4 native z.toJSONSchema (regression: converter must not return empty/degraded output)", () => {
    const schema = workflowJsonSchema() as Record<string, unknown>;

    // z.toJSONSchema with target:"draft-7" returns a flat JSON Schema object at the
    // root — no $defs/$ref wrapping. The root IS the ImportPayloadSchema object.
    expect(schema["type"]).toBe("object");

    // Both top-level fields are non-optional — they must appear in `required`.
    const required = schema["required"] as string[];
    expect(Array.isArray(required) && required.length > 0, "required must be non-empty").toBe(true);
    expect(required).toContain("importMode");
    expect(required).toContain("workflows");

    // `importMode` must be encoded as an enum with the three known values.
    const properties = schema["properties"] as Record<string, unknown>;
    expect(properties, "properties must be present").toBeDefined();
    const importModeDef = properties["importMode"] as Record<string, unknown>;
    expect(importModeDef, "importMode property must be present").toBeDefined();
    const enumValues = importModeDef["enum"] as unknown[];
    expect(Array.isArray(enumValues), "importMode must have an enum array").toBe(true);
    expect(enumValues).toContain("MERGE");
    expect(enumValues).toContain("REPLACE");
    expect(enumValues).toContain("ACTIVATE");

    // `workflows` must be encoded as an array type.
    const workflowsDef = properties["workflows"] as Record<string, unknown>;
    expect(workflowsDef, "workflows property must be present").toBeDefined();
    expect(workflowsDef["type"]).toBe("array");
  });
});

describe("registerWorkflowSchema", () => {
  it("installs the schema under the default fileMatch prefix", () => {
    const monaco = fakeMonaco();
    const handle = registerWorkflowSchema(monaco);
    expect(handle.schemaUri).toBe(WORKFLOW_SCHEMA_URI);
    const schemas = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!;
    expect(schemas.length).toBe(1);
    expect(schemas[0]!.fileMatch).toEqual(["cyoda://workflow/*"]);
    handle.dispose();
    expect(monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!.length).toBe(0);
  });

  it("is idempotent across repeated register calls", () => {
    const monaco = fakeMonaco();
    registerWorkflowSchema(monaco);
    registerWorkflowSchema(monaco);
    const schemas = monaco.languages.json.jsonDefaults.diagnosticsOptions.schemas!;
    expect(schemas.length).toBe(1);
  });
});
