import { describe, expect, test } from "vitest";
import { validateJsonPathSubset } from "../../src/criteria/jsonPathSubset.js";

describe("validateJsonPathSubset", () => {
  test.each([
    "$.x",
    "$.a.b.c",
    "$.list[0]",
    "$.list[0].x",
    "$.list[*]",
    "$.list[*].x",
    "$.a.b[0].c[*].d",
    "$.snake_case_field",
    "$.with-dashes",
    // cyoda-go 0.8.4 grammar: name = 1*( ALPHA / DIGIT / "_" / "-" ), so a
    // segment may start with a digit or a hyphen (verified against the binary).
    "$.1foo",
    "$.-a",
    "$.0-a[01]",
    "$.items.0",
    "$.matrix[*][*]",
    "$.tags[2147483647]",
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

  test("rejects bare root (cyoda-go 0.8.4 requires the `$.` leader)", () => {
    expect(validateJsonPathSubset("$")).toEqual({ ok: false, reason: "bare-root" });
  });

  test("rejects an index that does not fit an int32", () => {
    expect(validateJsonPathSubset("$.tags[2147483648]")).toEqual({
      ok: false,
      reason: "index-out-of-range",
    });
  });

  test.each(["$.a.", "$.[0]", "$.a[0]b", "$.a[-1]", "$.a[0:2]", "$.a[]", "$.a[ 0]", "$.café", "$[0]"])(
    "rejects malformed %s",
    (path) => {
      expect(validateJsonPathSubset(path)).toEqual({ ok: false, reason: "malformed" });
    },
  );

  test("rejects segment with space", () => {
    expect(validateJsonPathSubset("$.foo bar")).toEqual({ ok: false, reason: "malformed" });
  });
});
