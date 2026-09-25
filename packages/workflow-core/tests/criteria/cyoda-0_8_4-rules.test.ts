import { describe, expect, test } from "vitest";
import { validateSemantics } from "../../src/validate/semantic.js";
import {
  isTemporalOperand,
  likePatternError,
  matchesPatternIssue,
} from "../../src/criteria/patterns.js";
import type { Criterion } from "../../src/types/criterion.js";
import type { WorkflowSession } from "../../src/types/session.js";

// Every expectation below mirrors a request/response pair recorded against a
// running cyoda-go 0.8.4 binary (see ai/cyoda-schema-versions.md § v0.8.4).

function session(criterion: Criterion): WorkflowSession {
  return {
    entity: null,
    importMode: "MERGE",
    workflows: [
      {
        version: "1.4",
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

function issue(criterion: Criterion, code: string) {
  return validateSemantics(session(criterion)).find((i) => i.code === code);
}

function nonInfo(criterion: Criterion) {
  return validateSemantics(session(criterion)).filter((i) => i.severity !== "info");
}

describe("array criteria", () => {
  test("a trailing [*] path with no operator and null/number entries is clean", () => {
    expect(
      nonInfo({ type: "array", jsonPath: "$.tags[*]", value: ["a", null, 1, true] }),
    ).toEqual([]);
  });

  test.each(["$.tags", "$.tags[0]", "$.items[*].sku"])(
    "%s → array-path-not-wildcard error",
    (jsonPath) => {
      expect(issue({ type: "array", jsonPath, value: ["a"] }, "array-path-not-wildcard")?.severity).toBe(
        "error",
      );
    },
  );

  test("an object entry → array-non-scalar-value error", () => {
    const c = { type: "array", jsonPath: "$.tags[*]", value: [{ a: 1 }] } as unknown as Criterion;
    expect(issue(c, "array-non-scalar-value")?.severity).toBe("error");
  });
});

describe("lifecycle criteria", () => {
  test.each(["lastUpdateTime", "transitionForLatestSave", "transactionId", "id"] as const)(
    "field %s is accepted",
    (field) => {
      expect(nonInfo({ type: "lifecycle", field, operation: "NOT_NULL", value: null })).toEqual([]);
    },
  );

  test.each(["CONTAINS", "IEQUALS", "LIKE", "MATCHES_PATTERN", "ENDS_WITH"])(
    "%s on a temporal field → lifecycle-temporal-operator warning",
    (operation) => {
      const found = issue(
        { type: "lifecycle", field: "creationDate", operation, value: "2026" },
        "lifecycle-temporal-operator",
      );
      expect(found?.severity).toBe("warning");
    },
  );

  test("string operators on non-temporal fields are fine", () => {
    expect(
      issue({ type: "lifecycle", field: "id", operation: "LIKE", value: "a%" }, "lifecycle-temporal-operator"),
    ).toBeUndefined();
  });

  test.each([5, "notadate", "1700000000", "2026-01-01 10:00:00", "10:00:00Z"])(
    "operand %j on a temporal field → lifecycle-temporal-operand warning",
    (value) => {
      const found = issue(
        { type: "lifecycle", field: "lastUpdateTime", operation: "GREATER_THAN", value },
        "lifecycle-temporal-operand",
      );
      expect(found?.severity).toBe("warning");
    },
  );

  test("a BETWEEN with one unparsable bound is flagged", () => {
    expect(
      issue(
        {
          type: "lifecycle",
          field: "creationDate",
          operation: "BETWEEN",
          value: ["2026-01-01T00:00:00Z", "x"],
        },
        "lifecycle-temporal-operand",
      ),
    ).toBeDefined();
  });
});

describe("pattern operands", () => {
  test("LIKE with a trailing unpaired escape → like-pattern-invalid error", () => {
    expect(
      issue({ type: "simple", jsonPath: "$.name", operation: "LIKE", value: "abc\\" }, "like-pattern-invalid")
        ?.severity,
    ).toBe("error");
    expect(
      issue({ type: "lifecycle", field: "state", operation: "LIKE", value: "a\\" }, "like-pattern-invalid")
        ?.severity,
    ).toBe("error");
  });

  test.each(["a\\Qb", "a(", "(?=a)", "(a)\\1"])(
    "MATCHES_PATTERN %j → matches-pattern-invalid warning",
    (value) => {
      expect(
        issue({ type: "simple", jsonPath: "$.name", operation: "MATCHES_PATTERN", value }, "matches-pattern-invalid")
          ?.severity,
      ).toBe("warning");
    },
  );
});

describe("function criteria", () => {
  test("a function nested in a group → function-criterion-in-group warning", () => {
    const found = issue(
      {
        type: "group",
        operator: "AND",
        conditions: [{ type: "function", function: { name: "f", config: { calculationNodesTags: "t" } } }],
      },
      "function-criterion-in-group",
    );
    expect(found?.severity).toBe("warning");
  });

  test("a root function criterion is not flagged", () => {
    expect(
      issue({ type: "function", function: { name: "f" } }, "function-criterion-in-group"),
    ).toBeUndefined();
  });
});

describe("pattern helpers", () => {
  test("likePatternError", () => {
    expect(likePatternError("abc\\")).toMatch(/unpaired/);
    expect(likePatternError("abc\\\\")).toBeNull();
    expect(likePatternError("a\\%b")).toBeNull();
    expect(likePatternError("\\\\\\")).toMatch(/unpaired/);
    expect(likePatternError(5)).toBeNull();
  });

  // Server-verified: cyoda-go 0.8.4 accepts `a\(?=b` and `a\\Q` (escaped chars).
  test.each(["^a.*$", "(?i)abc", "(?P<n>a)b", "\\Qa.b\\E", "(?s:a.b)", "[a-z]+\\d", "a\\(?=b", "a\\\\Q", "[(?=]", "[]1]"])(
    "matchesPatternIssue accepts RE2-valid %j",
    (p) => {
      expect(matchesPatternIssue(p)).toBeNull();
    },
  );

  test.each(["2026", "2026-01", "2026-01-01", "2026-01-01T10:00Z", "2026-01-01T00:00:00.123+02:00", "10:00", "10:00:00.5"])(
    "isTemporalOperand accepts %j",
    (v) => {
      expect(isTemporalOperand(v)).toBe(true);
    },
  );

  test.each(["2026-01-01T10:00:00+0200", "10:00:00Z", "2026-1-1", "2026-01-01T10", "+12026", 5, true])(
    "isTemporalOperand rejects %j",
    (v) => {
      expect(isTemporalOperand(v)).toBe(false);
    },
  );
});
