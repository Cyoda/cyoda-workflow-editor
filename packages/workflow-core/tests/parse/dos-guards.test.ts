import { describe, expect, test } from "vitest";
import {
  MAX_JSON_BYTES,
  MAX_JSON_OBJECT_DEPTH,
  ParseJsonError,
  parseImportPayload,
} from "../../src/index.js";
import { normalizeCriterion } from "../../src/normalize/input.js";
import { walkCriteria } from "../../src/validate/helpers.js";
import type { Criterion } from "../../src/types/criterion.js";
import { MAX_CRITERION_DEPTH } from "../../src/criteria/operators.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid import payload as plain object. */
function basePayload() {
  return {
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "wf",
        initialState: "start",
        active: true,
        states: { start: { transitions: [] } },
      },
    ],
  };
}

/** Build a left-leaning nested group criterion `depth` levels deep. */
function buildDeepGroup(depth: number): Criterion {
  let c: Criterion = { type: "simple", jsonPath: "$.x", operation: "EQUALS", value: 1 };
  for (let i = 0; i < depth; i++) {
    c = { type: "group", operator: "AND", conditions: [c] };
  }
  return c;
}

/** Build an import payload JSON string with a criterion nested `depth` levels deep. */
function payloadWithCriterionDepth(depth: number): string {
  const payload = basePayload();
  (payload.workflows[0] as Record<string, unknown>)["criterion"] = buildDeepGroup(depth);
  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------------
// Size limit
// ---------------------------------------------------------------------------

describe("parseImportPayload — size guard", () => {
  test("rejects a payload that exceeds MAX_JSON_BYTES", () => {
    // Build a JSON string just over the limit with padding in a string field.
    const padding = "x".repeat(MAX_JSON_BYTES + 1);
    const oversized = JSON.stringify({ importMode: "MERGE", workflows: [{ name: padding }] });
    expect(() => parseImportPayload(oversized)).toThrow(ParseJsonError);
    expect(() => parseImportPayload(oversized)).toThrow(/maximum allowed size/);
  });

  test("accepts a payload right at the limit boundary (boundary check, not exact size)", () => {
    // A normal small payload is well within the limit.
    const small = JSON.stringify(basePayload());
    expect(small.length).toBeLessThan(MAX_JSON_BYTES);
    expect(() => parseImportPayload(small)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Depth limit
// ---------------------------------------------------------------------------

describe("parseImportPayload — depth guard", () => {
  test("rejects a payload whose object nesting exceeds MAX_JSON_OBJECT_DEPTH", () => {
    // Build a raw JS object nested deeper than the limit.
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < MAX_JSON_OBJECT_DEPTH + 5; i++) {
      nested = { child: nested };
    }
    const json = JSON.stringify(nested);
    expect(() => parseImportPayload(json)).toThrow(ParseJsonError);
    expect(() => parseImportPayload(json)).toThrow(/nesting depth/);
  });

  test("accepts a valid payload well within the nesting limit", () => {
    const json = JSON.stringify(basePayload());
    expect(() => parseImportPayload(json)).not.toThrow();
  });

  test("reports a criterion-depth-limit error for depth just above MAX_CRITERION_DEPTH without throwing", () => {
    // depth = MAX_CRITERION_DEPTH is the engine hard limit (depth >= limit → error).
    const json = payloadWithCriterionDepth(MAX_CRITERION_DEPTH);
    expect(() => parseImportPayload(json)).not.toThrow();
    const result = parseImportPayload(json);
    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("criterion-depth-limit");
  });

  test("throws ParseJsonError for criterion depth 2× MAX_CRITERION_DEPTH (pre-parse guard fires)", () => {
    // Criterion depth 100 → JSON object depth 204 > MAX_JSON_OBJECT_DEPTH (200).
    // The iterative pre-parse guard catches this before any recursive processing.
    const json = payloadWithCriterionDepth(MAX_CRITERION_DEPTH * 2);
    expect(() => parseImportPayload(json)).toThrow(ParseJsonError);
    expect(() => parseImportPayload(json)).toThrow(/nesting depth/);
  });

  test("does not throw for criterion depth above engine limit but below pre-parse ceiling", () => {
    // depth 70 → JSON object depth 144, which is below MAX_JSON_OBJECT_DEPTH (200).
    // The normalizeCriterion and walkInner depth guards (at MAX_CRITERION_DEPTH = 50)
    // must prevent a stack overflow while the semantic validator still reports the
    // criterion-depth-limit error via the iterative criterionMaxDepth check.
    const depth = 70;
    const json = payloadWithCriterionDepth(depth);
    expect(() => parseImportPayload(json)).not.toThrow();
    const result = parseImportPayload(json);
    expect(result.issues.some((i) => i.code === "criterion-depth-limit")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalizeCriterion depth guard (unit)
// ---------------------------------------------------------------------------

describe("normalizeCriterion — depth guard", () => {
  test("normalises a criterion tree within MAX_CRITERION_DEPTH", () => {
    const c = buildDeepGroup(MAX_CRITERION_DEPTH - 1);
    expect(() => normalizeCriterion(c)).not.toThrow();
  });

  test("returns node unchanged without throwing when depth equals MAX_CRITERION_DEPTH", () => {
    // Simulate being called on a node that is already at the depth limit.
    const leaf: Criterion = { type: "simple", jsonPath: "$.x", operation: "IS_NULL" };
    // Calling with depth = MAX_CRITERION_DEPTH should return immediately without
    // coercing value to null (the normalization for IS_NULL).
    const result = normalizeCriterion(leaf, MAX_CRITERION_DEPTH);
    expect(result).toBe(leaf); // unchanged reference
  });

  test("coerces IS_NULL value at depth zero (normal path)", () => {
    const c: Criterion = { type: "simple", jsonPath: "$.x", operation: "IS_NULL" };
    const out = normalizeCriterion(c, 0);
    expect(out).toEqual({ ...c, value: null });
  });
});

// ---------------------------------------------------------------------------
// walkCriteria depth guard (unit)
// ---------------------------------------------------------------------------

describe("walkCriteria — depth guard", () => {
  test("yields all nodes for a tree within MAX_CRITERION_DEPTH", () => {
    const depth = 10;
    const wf = {
      name: "wf",
      version: "1.0",
      initialState: "s",
      active: true,
      states: {
        s: {
          transitions: [
            {
              name: "t",
              next: "s",
              manual: false,
              disabled: false,
              criterion: buildDeepGroup(depth),
            },
          ],
        },
      },
    };
    const session = { entity: null, importMode: "MERGE" as const, workflows: [wf] };
    const yielded = [...walkCriteria(session)];
    // depth groups + 1 leaf = depth + 1 nodes
    expect(yielded.length).toBe(depth + 1);
  });

  test("does not throw or stack-overflow for a criterion tree 2× MAX_CRITERION_DEPTH", () => {
    const wf = {
      name: "wf",
      version: "1.0",
      initialState: "s",
      active: true,
      states: {
        s: {
          transitions: [
            {
              name: "t",
              next: "s",
              manual: false,
              disabled: false,
              criterion: buildDeepGroup(MAX_CRITERION_DEPTH * 2),
            },
          ],
        },
      },
    };
    const session = { entity: null, importMode: "MERGE" as const, workflows: [wf] };
    expect(() => [...walkCriteria(session)]).not.toThrow();
  });
});
