import { describe, it, expect } from "vitest";
import { criterionToJsonText, parseCriterionJson } from "../src/inspector/criterionJson.js";

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

  it("rejects an invalid function precheck (recursion through the gate)", () => {
    const r = parseCriterionJson('{"type":"function","function":{"name":"myFn","criterion":{"type":"simple","jsonPath":"","operation":"EQUALS"}}}');
    expect(r.criterion).toBeNull();
    expect(r.error).toBe("Choose a field for this condition.");
  });
});

describe("array criterion wire key in the JSON editor", () => {
  it("shows an array clause's list under `values`, nested ones included", () => {
    const text = criterionToJsonText({
      type: "group",
      operator: "NOT",
      conditions: [{ type: "array", jsonPath: "$.tags[*]", value: ["a", null] }],
    });
    const shown = JSON.parse(text);
    expect(shown.conditions[0]).toEqual({ type: "array", jsonPath: "$.tags[*]", values: ["a", null] });
  });

  it("accepts a clause pasted from a cyoda-go export (`values`, `operatorType`)", () => {
    const res = parseCriterionJson(
      JSON.stringify({ type: "array", jsonPath: "$.tags[*]", operatorType: "EQUALS", values: ["a"] }),
    );
    expect(res.error).toBeNull();
    expect(res.criterion).toEqual({ type: "array", jsonPath: "$.tags[*]", operation: "EQUALS", value: ["a"] });
  });

  it("round-trips its own display text unchanged", () => {
    const c = { type: "array" as const, jsonPath: "$.tags[*]", value: ["a"] };
    expect(parseCriterionJson(criterionToJsonText(c)).criterion).toEqual(c);
  });

  it("reports a value/values conflict instead of guessing", () => {
    const res = parseCriterionJson(
      JSON.stringify({ type: "array", jsonPath: "$.tags[*]", value: ["a"], values: ["b"] }),
    );
    expect(res.criterion).toBeNull();
    expect(res.error).toMatch(/Conflicting/);
  });
});
