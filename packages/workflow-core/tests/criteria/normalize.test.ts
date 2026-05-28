import { describe, expect, test } from "vitest";
import { normalizeCriterion } from "../../src/normalize/input.js";
import { outputCriterion } from "../../src/normalize/output.js";
import type { Criterion } from "../../src/types/criterion.js";

describe("normalizeCriterion (IS_NULL/NOT_NULL value enforcement)", () => {
  test("simple IS_NULL with undefined value gets value: null", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.x", operation: "IS_NULL" };
    const out = normalizeCriterion(c);
    expect(out).toEqual({ type: "simple", jsonPath: "$.x", operation: "IS_NULL", value: null });
  });

  test("simple NOT_NULL with undefined value gets value: null", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.x", operation: "NOT_NULL" };
    expect(normalizeCriterion(c)).toMatchObject({ operation: "NOT_NULL", value: null });
  });

  test("lifecycle IS_NULL gets value: null", () => {
    const c: Criterion = { type: "lifecycle", field: "state", operation: "IS_NULL" };
    expect(normalizeCriterion(c)).toMatchObject({ operation: "IS_NULL", value: null });
  });

  test("simple EQUALS is passed through unchanged", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.x", operation: "EQUALS", value: 1 };
    expect(normalizeCriterion(c)).toBe(c);
  });
});

describe("outputCriterion (IS_NULL/NOT_NULL emit value: null)", () => {
  test("simple IS_NULL emits value: null", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.x", operation: "IS_NULL", value: null };
    expect(outputCriterion(c)).toEqual({
      type: "simple",
      jsonPath: "$.x",
      operation: "IS_NULL",
      value: null,
    });
  });

  test("simple NOT_NULL emits value: null even when internal value is undefined", () => {
    // Models a session that was hand-built without normalisation.
    const c = { type: "simple", jsonPath: "$.x", operation: "NOT_NULL" } as Criterion;
    expect(outputCriterion(c)).toEqual({
      type: "simple",
      jsonPath: "$.x",
      operation: "NOT_NULL",
      value: null,
    });
  });

  test("simple EQUALS with undefined value omits value key", () => {
    const c = { type: "simple", jsonPath: "$.x", operation: "EQUALS" } as Criterion;
    const out = outputCriterion(c);
    expect("value" in out).toBe(false);
  });

  test("simple EQUALS with explicit value preserves it", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.x", operation: "EQUALS", value: 1 };
    expect(outputCriterion(c)).toEqual({
      type: "simple",
      jsonPath: "$.x",
      operation: "EQUALS",
      value: 1,
    });
  });

  test("lifecycle IS_NULL emits value: null", () => {
    const c: Criterion = { type: "lifecycle", field: "state", operation: "IS_NULL", value: null };
    expect(outputCriterion(c)).toEqual({
      type: "lifecycle",
      field: "state",
      operation: "IS_NULL",
      value: null,
    });
  });
});
