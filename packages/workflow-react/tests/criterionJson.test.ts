import { describe, it, expect } from "vitest";
import { parseCriterionJson } from "../src/inspector/criterionJson.js";

describe("parseCriterionJson", () => {
  it("accepts a valid criterion", () => {
    const r = parseCriterionJson('{"type":"simple","jsonPath":"$.a","operation":"EQUALS","value":"x"}');
    expect(r.error).toBeNull();
    expect(r.criterion).toEqual({ type: "simple", jsonPath: "$.a", operation: "EQUALS", value: "x" });
  });

  it("rejects malformed JSON", () => {
    const r = parseCriterionJson("{ not json");
    expect(r.criterion).toBeNull();
    expect(r.error).toMatch(/JSON/i);
  });

  it("rejects schema-invalid JSON (missing discriminant)", () => {
    const r = parseCriterionJson('{"jsonPath":"$.a"}');
    expect(r.criterion).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it("rejects a structurally-valid but incomplete criterion via the strictness gate", () => {
    const r = parseCriterionJson('{"type":"simple","jsonPath":"","operation":"EQUALS"}');
    expect(r.criterion).toBeNull();
    expect(r.error).toBe("Choose a field for this condition.");
  });

  it("rejects a jsonPath outside the supported gjson subset (beyond-schema)", () => {
    const r = parseCriterionJson('{"type":"simple","jsonPath":"$..deep","operation":"EQUALS","value":"x"}');
    expect(r.criterion).toBeNull();
    expect(r.error).toMatch(/JSON path is invalid/);
  });

  it("rejects BETWEEN without a 2-element array (beyond-schema)", () => {
    const r = parseCriterionJson('{"type":"simple","jsonPath":"$.a","operation":"BETWEEN","value":[1]}');
    expect(r.criterion).toBeNull();
    expect(r.error).toMatch(/BETWEEN requires/);
  });

  it("rejects an empty group via the schema", () => {
    const r = parseCriterionJson('{"type":"group","operator":"AND","conditions":[]}');
    expect(r.criterion).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it("accepts a valid nested group", () => {
    const r = parseCriterionJson('{"type":"group","operator":"AND","conditions":[{"type":"simple","jsonPath":"$.a","operation":"EQUALS","value":"x"}]}');
    expect(r.error).toBeNull();
    expect(r.criterion).not.toBeNull();
  });
});
