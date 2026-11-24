import { describe, expect, it } from "vitest";
import {
  jsonDefaultsOf,
  registerCriterionSchema,
  registerWorkflowSchema,
  CRITERION_SCHEMA_URI,
  WORKFLOW_SCHEMA_URI,
} from "../src/index.js";
import type { JsonDiagnosticsOptions, JsonLanguageDefaults, MonacoLike } from "../src/types.js";

function defaults(): JsonLanguageDefaults & { opts: JsonDiagnosticsOptions } {
  const d = {
    opts: { schemas: [] } as JsonDiagnosticsOptions,
    get diagnosticsOptions() {
      return d.opts;
    },
    setDiagnosticsOptions(next: JsonDiagnosticsOptions) {
      d.opts = next;
    },
  };
  return d;
}

const base = {
  editor: { setModelMarkers: () => {} },
  MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
};

describe("jsonDefaultsOf — every monaco-editor shape", () => {
  it("0.56+: top-level `json`, `languages.json` is a deprecation tombstone", () => {
    const top = defaults();
    const monaco: MonacoLike = { ...base, json: { jsonDefaults: top }, languages: { json: { deprecated: true } } };
    expect(jsonDefaultsOf(monaco)).toBe(top);
  });

  it("< 0.55: only `languages.json`", () => {
    const legacy = defaults();
    const monaco: MonacoLike = { ...base, languages: { json: { jsonDefaults: legacy } } };
    expect(jsonDefaultsOf(monaco)).toBe(legacy);
  });

  it("0.55: both present — prefers the top-level namespace", () => {
    const top = defaults();
    const monaco: MonacoLike = {
      ...base,
      json: { jsonDefaults: top },
      languages: { json: { jsonDefaults: defaults() } },
    };
    expect(jsonDefaultsOf(monaco)).toBe(top);
  });

  it("throws a descriptive error when neither is available", () => {
    expect(() => jsonDefaultsOf({ ...base, languages: { json: { deprecated: true } } })).toThrow(
      /no JSON language defaults/,
    );
    expect(() => jsonDefaultsOf(base)).toThrow(/monaco-editor's JSON language feature/);
  });
});

describe("schema registration on a 0.56+ shaped instance", () => {
  it("registers and disposes the workflow and criterion schemas via `monaco.json`", () => {
    const top = defaults();
    const monaco: MonacoLike = { ...base, json: { jsonDefaults: top }, languages: { json: { deprecated: true } } };

    const wf = registerWorkflowSchema(monaco);
    const crit = registerCriterionSchema(monaco);
    expect(top.opts.schemas?.map((s) => s.uri)).toEqual([WORKFLOW_SCHEMA_URI, CRITERION_SCHEMA_URI]);
    expect(top.opts.validate).toBe(true);

    wf.dispose();
    expect(top.opts.schemas?.map((s) => s.uri)).toEqual([CRITERION_SCHEMA_URI]);
    crit.dispose();
    expect(top.opts.schemas).toEqual([]);
  });

  it("keeps unrelated diagnostics options when registering", () => {
    const top = defaults();
    top.opts = { schemas: [{ uri: "other", schema: {} }], enableSchemaRequest: true } as JsonDiagnosticsOptions;
    const monaco: MonacoLike = { ...base, json: { jsonDefaults: top } };
    registerWorkflowSchema(monaco).dispose();
    expect(top.opts).toMatchObject({ enableSchemaRequest: true, schemas: [{ uri: "other" }] });
  });
});
