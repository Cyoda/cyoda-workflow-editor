import { describe, expect, test } from "vitest";
import { parseAnnotationsJson, sameJson, annotationsModelUri } from "../src/inspector/annotationsJson.js";

describe("parseAnnotationsJson", () => {
  test("accepts objects (including empty and nested)", () => {
    expect(parseAnnotationsJson("{}")).toEqual({ annotations: {}, error: null });
    expect(parseAnnotationsJson('{"a":{"b":[1,2]}}').annotations).toEqual({ a: { b: [1, 2] } });
  });
  test("rejects invalid JSON", () => {
    expect(parseAnnotationsJson("{").annotations).toBeNull();
    expect(parseAnnotationsJson("{").error).toMatch(/Invalid JSON/);
  });
  test("rejects non-objects", () => {
    for (const bad of ["null", "[]", '"s"', "3", "true"]) {
      const r = parseAnnotationsJson(bad);
      expect(r.annotations).toBeNull();
      expect(r.error).toMatch(/object/i);
    }
  });
  test("rejects over-cap annotations", () => {
    const big = JSON.stringify({ blob: "x".repeat(70_000) });
    const r = parseAnnotationsJson(big);
    expect(r.annotations).toBeNull();
    expect(r.error).toMatch(/limit/i);
  });
});

describe("sameJson", () => {
  test("compares by value, ignores whitespace", () => {
    expect(sameJson({ a: 1 }, JSON.parse("{ \"a\":  1 }"))).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
  });
});

test("annotationsModelUri namespaces distinctly from criterion", () => {
  expect(annotationsModelUri("state-NEW")).toBe("cyoda://annotations/state-NEW.json");
});
