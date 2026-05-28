import { describe, expect, test } from "vitest";
import { validateJsonPathSubset } from "../../src/criteria/jsonPathSubset.js";

describe("validateJsonPathSubset", () => {
  test.each([
    "$",
    "$.x",
    "$.a.b.c",
    "$.list[0]",
    "$.list[0].x",
    "$.list[*]",
    "$.list[*].x",
    "$.a.b[0].c[*].d",
    "$.snake_case_field",
    "$.with-dashes",
  ])("accepts %s", (path) => {
    expect(validateJsonPathSubset(path)).toEqual({ ok: true });
  });

  test("rejects empty", () => {
    expect(validateJsonPathSubset("")).toEqual({ ok: false, reason: "empty" });
  });

  test("rejects missing root", () => {
    expect(validateJsonPathSubset("x.y")).toEqual({ ok: false, reason: "missing-root" });
  });

  test("rejects recursive descent", () => {
    expect(validateJsonPathSubset("$..x")).toEqual({
      ok: false,
      reason: "recursive-descent",
    });
  });

  test("rejects filter expression", () => {
    expect(validateJsonPathSubset("$.list[?(@.x==1)]")).toEqual({
      ok: false,
      reason: "filter-expression",
    });
  });

  test("rejects bracketed quoted key", () => {
    expect(validateJsonPathSubset("$['foo']")).toEqual({ ok: false, reason: "malformed" });
  });

  test("rejects unmatched bracket", () => {
    expect(validateJsonPathSubset("$.list[0")).toEqual({ ok: false, reason: "malformed" });
  });

  test("rejects non-numeric/wildcard index", () => {
    expect(validateJsonPathSubset("$.list[abc]")).toEqual({ ok: false, reason: "malformed" });
  });

  test("rejects segment starting with digit", () => {
    expect(validateJsonPathSubset("$.1foo")).toEqual({ ok: false, reason: "malformed" });
  });

  test("rejects segment with space", () => {
    expect(validateJsonPathSubset("$.foo bar")).toEqual({ ok: false, reason: "malformed" });
  });
});
