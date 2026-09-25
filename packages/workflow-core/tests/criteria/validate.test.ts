import { describe, expect, test } from "vitest";
import { validateSemantics } from "../../src/validate/semantic.js";
import {
  CRITERION_DEPTH_WARNING_THRESHOLD,
  MAX_CRITERION_DEPTH,
} from "../../src/criteria/operators.js";
import type { Criterion } from "../../src/types/criterion.js";
import type { WorkflowSession } from "../../src/types/session.js";

function nestedGroup(depth: number): Criterion {
  // Returns a tree whose max depth equals `depth`. A simple leaf has depth 1.
  let node: Criterion = { type: "simple", jsonPath: "$.x", operation: "EQUALS", value: 1 };
  for (let i = 1; i < depth; i++) {
    node = { type: "group", operator: "AND", conditions: [node] };
  }
  return node;
}

function sessionWithTransitionCriterion(criterion: Criterion): WorkflowSession {
  return {
    entity: null,
    importMode: "MERGE",
    workflows: [
      {
        version: "1.3",
        name: "wf",
        initialState: "start",
        active: true,
        states: {
          start: {
            transitions: [{ name: "go", next: "end", manual: false, disabled: false, criterion }],
          },
          end: { transitions: [] },
        },
      },
    ],
  };
}

function codes(session: WorkflowSession): string[] {
  return validateSemantics(session).map((i) => i.code);
}

describe("criterion semantic rules", () => {
  test("simple IS_CHANGED → unsupported-operator warning, no errors", () => {
    const session = sessionWithTransitionCriterion({
      type: "simple",
      jsonPath: "$.x",
      operation: "IS_CHANGED",
      value: null,
    });
    const issues = validateSemantics(session);
    expect(issues.map((i) => i.code)).toContain("unsupported-operator");
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  test("simple BETWEEN with scalar value → simple-between-shape error", () => {
    const session = sessionWithTransitionCriterion({
      type: "simple",
      jsonPath: "$.n",
      operation: "BETWEEN",
      value: 5,
    });
    expect(codes(session)).toContain("simple-between-shape");
  });

  test("simple BETWEEN with [low, high] → no shape error", () => {
    const session = sessionWithTransitionCriterion({
      type: "simple",
      jsonPath: "$.n",
      operation: "BETWEEN",
      value: [0, 10],
    });
    expect(codes(session)).not.toContain("simple-between-shape");
  });

  test("simple with recursive descent path → invalid-jsonpath-subset error", () => {
    const session = sessionWithTransitionCriterion({
      type: "simple",
      jsonPath: "$..foo",
      operation: "EQUALS",
      value: 1,
    });
    const issues = validateSemantics(session);
    const issue = issues.find((i) => i.code === "invalid-jsonpath-subset");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
    expect(issue?.detail?.["reason"]).toBe("recursive-descent");
  });

  test("simple MATCHES_PATTERN unanchored → no longer flagged (rule removed)", () => {
    const session = sessionWithTransitionCriterion({
      type: "simple",
      jsonPath: "$.s",
      operation: "MATCHES_PATTERN",
      value: "foo",
    });
    // Anchoring is a valid, common choice — not the editor's call to warn about.
    expect(codes(session)).not.toContain("matches-pattern-unanchored");
  });

  test("simple LIKE with wildcard chars → no longer flagged (rule removed)", () => {
    const session = sessionWithTransitionCriterion({
      type: "simple",
      jsonPath: "$.s",
      operation: "LIKE",
      value: "foo%",
    });
    expect(codes(session)).not.toContain("like-wildcard-warning");
  });

  test("simple with $._meta path → lifecycle-path-in-simple info", () => {
    const session = sessionWithTransitionCriterion({
      type: "simple",
      jsonPath: "$._meta.state",
      operation: "EQUALS",
      value: "APPROVED",
    });
    const issue = validateSemantics(session).find((i) => i.code === "lifecycle-path-in-simple");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("info");
  });

  test("group NOT with one condition is clean (implemented in cyoda-go 0.8.4)", () => {
    const session = sessionWithTransitionCriterion({
      type: "group",
      operator: "NOT",
      conditions: [{ type: "simple", jsonPath: "$.x", operation: "EQUALS", value: 1 }],
    });
    expect(validateSemantics(session).filter((i) => i.severity !== "info")).toEqual([]);
  });

  test("group NOT with two conditions → not-with-multiple-conditions error", () => {
    const leaf: Criterion = { type: "simple", jsonPath: "$.x", operation: "EQUALS", value: 1 };
    const session = sessionWithTransitionCriterion({
      type: "group",
      operator: "NOT",
      conditions: [leaf, leaf],
    });
    const issue = validateSemantics(session).find((i) => i.code === "not-with-multiple-conditions");
    expect(issue?.severity).toBe("error");
  });

  test("group AND with valid children → no group operator warning", () => {
    const session = sessionWithTransitionCriterion({
      type: "group",
      operator: "AND",
      conditions: [
        { type: "simple", jsonPath: "$.a", operation: "EQUALS", value: 1 },
        { type: "simple", jsonPath: "$.b", operation: "EQUALS", value: 2 },
      ],
    });
    expect(codes(session)).not.toContain("unsupported-group-operator");
  });

  test("array criterion with filter-expression path → invalid-jsonpath-subset error", () => {
    const session = sessionWithTransitionCriterion({
      type: "array",
      jsonPath: "$.items[?(@.x==1)]",
      operation: "EQUALS",
      value: ["a"],
    });
    const issue = validateSemantics(session).find((i) => i.code === "invalid-jsonpath-subset");
    expect(issue?.detail?.["reason"]).toBe("filter-expression");
  });

  test(`depth ${CRITERION_DEPTH_WARNING_THRESHOLD + 1} → warning, no error`, () => {
    const session = sessionWithTransitionCriterion(
      nestedGroup(CRITERION_DEPTH_WARNING_THRESHOLD + 1),
    );
    const issues = validateSemantics(session);
    const warn = issues.find((i) => i.code === "criterion-depth-warning");
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe("warning");
    expect(issues.find((i) => i.code === "criterion-depth-limit")).toBeUndefined();
  });

  test(`depth ${MAX_CRITERION_DEPTH + 1} → error (and still emits warning)`, () => {
    const session = sessionWithTransitionCriterion(nestedGroup(MAX_CRITERION_DEPTH + 1));
    const issues = validateSemantics(session);
    const err = issues.find((i) => i.code === "criterion-depth-limit");
    expect(err).toBeDefined();
    expect(err?.severity).toBe("error");
    expect(issues.find((i) => i.code === "criterion-depth-warning")).toBeDefined();
  });

  test("lifecycle with IS_CHANGED → unsupported-operator warning, no errors", () => {
    const session = sessionWithTransitionCriterion({
      type: "lifecycle",
      field: "state",
      operation: "IS_CHANGED",
      value: null,
    });
    const issues = validateSemantics(session);
    expect(issues.map((i) => i.code)).toContain("unsupported-operator");
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  test(`depth ${CRITERION_DEPTH_WARNING_THRESHOLD - 1} → no depth issues`, () => {
    const session = sessionWithTransitionCriterion(
      nestedGroup(CRITERION_DEPTH_WARNING_THRESHOLD - 1),
    );
    const codes = validateSemantics(session).map((i) => i.code);
    expect(codes).not.toContain("criterion-depth-warning");
    expect(codes).not.toContain("criterion-depth-limit");
  });
});
