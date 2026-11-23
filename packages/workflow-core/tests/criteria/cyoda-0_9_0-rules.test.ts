import { describe, expect, test } from "vitest";
import { parseImportPayload } from "../../src/index.js";

// Every case below is a payload sent to `POST /model/probe/1/workflow/import`
// on a running cyoda-go 0.9.0 binary (a824b3e), with the verdict it got. The
// editor must block (an `error`) everything the server refused, and must not
// block anything it accepted. See ai/cyoda-schema-versions.md § v0.9.0.
//
// Deliberate divergences are listed at the bottom with their reason.

type Json = Record<string, unknown>;

function payload(transition: Json, workflow: Json = {}): string {
  return JSON.stringify({
    importMode: "REPLACE",
    workflows: [{
      version: "1.5", name: "wf", initialState: "A", active: true,
      ...workflow,
      states: {
        A: { transitions: [{ name: "go", next: "B", manual: true, ...transition }] },
        B: { transitions: [] },
      },
    }],
  });
}

const P = (extra: Json = {}, config: Json = {}): Json => ({
  type: "externalized", name: "p", executionMode: "SYNC",
  config: { calculationNodesTags: "t", ...config }, ...extra,
});
const F = (extra: Json = {}): Json => ({ name: "f", resultKind: "Schedule", calculationNodesTags: "t", ...extra });
const sched = (schedule: Json): Json => ({ manual: false, schedule });
const s = (op: string, value?: unknown, jsonPath = "$.name"): Json => ({
  type: "simple", jsonPath, operatorType: op, ...(value === undefined ? {} : { value }),
});
const lc = (op: string, value?: unknown): Json => ({
  type: "lifecycle", field: "state", operatorType: op, ...(value === undefined ? {} : { value }),
});
const arr = (values: unknown[], extra: Json = {}): Json => ({
  type: "array", jsonPath: "$.scores[*]", operatorType: "EQUALS", values, ...extra,
});
const fn = (extra: Json = {}): Json => ({
  type: "function", function: { name: "g", config: { calculationNodesTags: "t" }, ...extra },
});
const G = (...conditions: Json[]): Json => ({ type: "group", operator: "AND", conditions });
const crit = (criterion: Json): Json => ({ criterion });
const ones = (n: number) => Array.from({ length: n }, () => 1);

function issues(json: string) {
  return parseImportPayload(json).issues;
}

// [case, transition fragment, expected error code — or null for "any error"]
const refused: [string, Json, string | null][] = [
  ["array: all-null values", crit(arr([null])), "array-no-position"],
  ["array: empty values", crit(arr([])), "array-no-position"],
  ["array: wildcard before the trailing [*]", crit(arr(["a"], { jsonPath: "$.x[*].y[*]" })), "array-path-inner-wildcard"],
  ["array: a pair entry under EQUALS", crit(arr([[1, 2]])), "operand-not-scalar"],
  ["array BETWEEN: a scalar entry", crit(arr([5], { operatorType: "BETWEEN" })), "simple-between-shape"],
  ["array BETWEEN: a pair and a scalar", crit(arr([[1, 2], 5], { operatorType: "BETWEEN" })), "simple-between-shape"],
  ["array BETWEEN: a null bound", crit(arr([[1, null]], { operatorType: "BETWEEN" })), "simple-between-shape"],
  ["array BETWEEN: three bounds", crit(arr([[1, 2, 3]], { operatorType: "BETWEEN" })), "simple-between-shape"],
  ["array BETWEEN: 10,001 pairs", crit(arr(Array.from({ length: 10_001 }, () => [1, 2]), { operatorType: "BETWEEN" })), "criterion-entry-limit"],
  ["startNewTxOnDispatch true on a SYNC processor", { processors: [P({ startNewTxOnDispatch: true })] }, "start-new-tx-without-commit-before-dispatch"],
  ["processor type internalized", { processors: [P({ type: "internalized" })] }, "processor-type-internalized"],
  ["processor type EXTERNAL", { processors: [P({ type: "EXTERNAL" })] }, "processor-type-non-canonical"],
  ["schedule.function retryPolicy EXPONENTIAL", sched({ function: F({ retryPolicy: "EXPONENTIAL" }) }), "unknown-retry-policy"],
  ["delayMs 0 alone", sched({ delayMs: 0 }), null],
  ["delayMs -5 alone", sched({ delayMs: -5 }), null],
  ["timeoutMs -1", sched({ delayMs: 5, timeoutMs: -1 }), "schedule-timeout-negative"],
  ["processor responseTimeoutMs -1", { processors: [P({}, { responseTimeoutMs: -1 })] }, "response-timeout-negative"],
  ["schedule.function responseTimeoutMs -1", sched({ function: F({ responseTimeoutMs: -1 }) }), "response-timeout-negative"],
  ["criterion function retryPolicy X", crit(fn({ config: { retryPolicy: "X" } })), "unknown-retry-policy"],
  ["criterion function without a name", crit({ type: "function", function: {} }), null],
  ["pre-check holding a function", crit(fn({ criterion: fn() })), "precheck-function"],
  ["pre-check with a bad path", crit(fn({ criterion: s("EQUALS", "x", "name") })), "invalid-jsonpath-subset"],
  ["pre-check with a null operand", crit(fn({ criterion: s("EQUALS", null) })), "operand-missing"],
  ["manual omitted", { manual: undefined }, null],
  ["manual null", { manual: null }, null],
  ["simple EQUALS without value", crit(s("EQUALS")), "operand-missing"],
  ["simple EQUALS null", crit(s("EQUALS", null)), "operand-missing"],
  ["simple EQUALS [a, b]", crit(s("EQUALS", ["a", "b"])), "operand-not-scalar"],
  ["simple EQUALS {a: 1}", crit(s("EQUALS", { a: 1 })), "operand-not-scalar"],
  ["BETWEEN with a null bound", crit(s("BETWEEN", [1, null], "$.amount")), "simple-between-shape"],
  ["BETWEEN with three elements", crit(s("BETWEEN", [1, 2, 3], "$.amount")), "simple-between-shape"],
  ["BETWEEN with an object bound", crit(s("BETWEEN", [1, { a: 1 }], "$.amount")), "simple-between-shape"],
  ["lifecycle EQUALS null", crit(lc("EQUALS", null)), "operand-missing"],
  ["lifecycle EQUALS [A]", crit(lc("EQUALS", ["A"])), "operand-not-scalar"],
  ["array clause with 10,001 entries", crit(arr(ones(10_001))), "criterion-entry-limit"],
  ["array clause with 1 + 10,000 null entries", crit(arr([1, ...Array(10_000).fill(null)])), "criterion-entry-limit"],
  ["group(array 9,999, simple, simple)", crit(G(arr(ones(9_999)), s("EQUALS", "x"), s("EQUALS", "x"))), "criterion-entry-limit"],
  ["function + pre-check of 10,000 entries", crit(fn({ criterion: arr(ones(10_000)) })), "criterion-entry-limit"],
];

const accepted: [string, Json][] = [
  ["array with `operation`", crit({ type: "array", jsonPath: "$.tags[*]", operation: "EQUALS", values: ["a"] })],
  ["array with `operator`", crit({ type: "array", jsonPath: "$.tags[*]", operator: "EQUALS", values: ["a"] })],
  ["array GREATER_THAN with a null position", crit(arr([1, null], { operatorType: "GREATER_THAN" }))],
  ["array BETWEEN with a pair", crit(arr([[1, 2]], { operatorType: "BETWEEN" }))],
  ["array BETWEEN_INCLUSIVE with pairs and a null position", crit(arr([[1, 2], null, [3, 4]], { operatorType: "BETWEEN_INCLUSIVE" }))],
  ["array BETWEEN with string bounds", crit(arr([["a", "b"]], { operatorType: "BETWEEN" }))],
  ["simple with `operation`", crit({ type: "simple", jsonPath: "$.name", operation: "EQUALS", value: "x" })],
  ["simple with `operator`", crit({ type: "simple", jsonPath: "$.name", operator: "EQUALS", value: "x" })],
  ["startNewTxOnDispatch on a COMMIT_BEFORE_DISPATCH processor", { processors: [P({ executionMode: "COMMIT_BEFORE_DISPATCH", startNewTxOnDispatch: true })] }],
  ["startNewTxOnDispatch false on SYNC", { processors: [P({ startNewTxOnDispatch: false })] }],
  ["idempotent in config", { processors: [P({}, { idempotent: true })] }],
  ["processor type omitted", { processors: [{ name: "p", executionMode: "SYNC" }] }],
  ["processor type empty", { processors: [P({ type: "" })] }],
  ["processor type null", { processors: [P({ type: null })] }],
  ["schedule function only", sched({ function: F() })],
  ["schedule.function retryPolicy FIXED", sched({ function: F({ retryPolicy: "FIXED" }) })],
  ["schedule.function retryPolicy empty", sched({ function: F({ retryPolicy: "" }) })],
  ["timeoutMs 0", sched({ delayMs: 5, timeoutMs: 0 })],
  ["schedule null", { manual: false, schedule: null }],
  ["processor responseTimeoutMs 60000", { processors: [P({}, { responseTimeoutMs: 60_000 })] }],
  ["processor responseTimeoutMs 0", { processors: [P({}, { responseTimeoutMs: 0 })] }],
  ["function condition in an AND group", crit(G(s("EQUALS", "x"), fn()))],
  ["function condition in a NOT group", crit({ type: "group", operator: "NOT", conditions: [fn()] })],
  ["pre-check holding a simple condition", crit(fn({ criterion: s("EQUALS", "x") }))],
  ["IS_NULL without value", crit(s("IS_NULL"))],
  ["IS_NULL with value null", crit(s("IS_NULL", null))],
  ["IS_NULL with a value", crit(s("IS_NULL", "x"))],
  ["BETWEEN [1, 5]", crit(s("BETWEEN", [1, 5], "$.amount"))],
  ["group(array 9,999, simple) = 10,000 entries", crit(G(arr(ones(9_999)), s("EQUALS", "x")))],
  ["array clause with 10,000 entries", crit(arr(ones(10_000)))],
  ["function + pre-check of 9,999 entries", crit(fn({ criterion: arr(ones(9_999)) }))],
];

describe("cyoda-go 0.9.0 import verdicts — refused by the server", () => {
  test.each(refused)("%s → blocked", (_name, transition, code) => {
    const found = issues(payload(transition)).filter((i) => i.severity === "error");
    if (code === null) {
      expect(found.length).toBeGreaterThan(0);
    } else {
      expect(found.map((i) => i.code)).toContain(code);
    }
  });
});

describe("cyoda-go 0.9.0 import verdicts — accepted by the server", () => {
  test.each(accepted)("%s → not blocked", (_name, transition) => {
    expect(issues(payload(transition)).filter((i) => i.severity === "error")).toEqual([]);
  });
});

describe("deliberate divergences from the 0.9.0 verdicts", () => {
  test("responseTimeoutMs above 60000 is a warning: the bound is a per-deployment server setting", () => {
    for (const t of [
      { processors: [P({}, { responseTimeoutMs: 60_001 })] },
      crit(fn({ config: { calculationNodesTags: "t", responseTimeoutMs: 60_001 } })),
    ]) {
      const found = issues(payload(t));
      expect(found.find((i) => i.code === "response-timeout-above-default-max")?.severity).toBe("warning");
      expect(found.filter((i) => i.severity === "error")).toEqual([]);
    }
  });

  test("an unknown or lowercase operator stays a warning: Cyoda Cloud's operator set is wider", () => {
    for (const op of ["IN_SET", "equals"]) {
      const found = issues(payload(crit(s(op, "x"))));
      expect(found.find((i) => i.code === "operator-not-recognized")?.severity).toBe("warning");
    }
  });

  test("asyncResult true / crossoverToAsyncMs stay warnings: Cyoda Cloud honours them", () => {
    const a = issues(payload({ processors: [P({}, { asyncResult: true })] }));
    expect(a.find((i) => i.code === "async-result-unsupported")?.severity).toBe("warning");
    const c = issues(payload({ processors: [P({}, { crossoverToAsyncMs: 0 })] }));
    expect(c.find((i) => i.code === "crossover-unsupported")?.severity).toBe("warning");
  });

  // cyoda-go 0.9.0 refuses every one of these (strict member names). The
  // editor cannot keep a member it has no field for, so it drops it — and says
  // so, because dropping can change the criterion's meaning.
  test.each([
    ["calculationNodesTags beside function.config", crit({ type: "function", function: { name: "g", calculationNodesTags: "t" } }), "/function", ["calculationNodesTags"]],
    ["an unknown member in function.config", crit(fn({ config: { foo: 1 } })), "/function/config", ["foo"]],
    ["idempotent in a criterion function's config", crit(fn({ config: { idempotent: true } })), "/function/config", ["idempotent"]],
    ["a sibling of `function`", crit({ ...fn(), note: 1 }), "", ["note"]],
    ["an unknown member on a group", crit({ ...G(s("EQUALS", "x")), note: 1 }), "", ["note"]],
    ["an unknown member on a lifecycle leaf", crit({ ...lc("EQUALS", "A"), x: 1 }), "", ["x"]],
    ["an unknown member on an array leaf", crit({ ...arr([1]), x: 1 }), "", ["x"]],
    ["an unknown member inside a pre-check", crit(fn({ criterion: { ...s("EQUALS", "x"), note: 1 } })), "/function/criterion", ["note"]],
  ])("%s → dropped with a criterion-keys-dropped warning", (_name, transition, pointer, keys) => {
    const parsed = parseImportPayload(payload(transition));
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    const issue = parsed.issues.find((i) => i.code === "criterion-keys-dropped");
    expect(issue?.severity).toBe("warning");
    expect(issue?.detail).toEqual({
      location: `transition "go" on "wf:A" criterion${pointer === "" ? "" : ` at ${pointer}`}`,
      keys,
    });
  });

  test("an unknown member on a workflow criterion is reported against the workflow", () => {
    const parsed = parseImportPayload(payload({}, { criterion: { ...s("EQUALS", "x"), note: 1 } }));
    const issue = parsed.issues.find((i) => i.code === "criterion-keys-dropped");
    expect(issue?.detail).toEqual({ location: 'workflow "wf" criterion', keys: ["note"] });
    expect(issue?.message).toMatch(/^workflow "wf" criterion: /);
  });

  test("operator spellings and `values` are not reported as unknown members", () => {
    const parsed = parseImportPayload(
      payload(crit(G(
        { type: "simple", jsonPath: "$.a", operator: "EQUALS", value: 1 },
        { type: "array", jsonPath: "$.t[*]", operatorType: "EQUALS", values: [1] },
      ))),
    );
    expect(parsed.issues.map((i) => i.code)).not.toContain("criterion-keys-dropped");
  });

  test("an array clause with no operator is migrated (EQUALS + warning), not blocked", () => {
    const found = issues(payload(crit({ type: "array", jsonPath: "$.tags[*]", values: ["a"] })));
    expect(found.filter((i) => i.severity === "error")).toEqual([]);
    expect(found.map((i) => i.code)).toContain("array-criterion-operator-defaulted");
  });
});
