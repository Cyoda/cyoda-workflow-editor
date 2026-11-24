import { describe, expect, test } from "vitest";
import { validateSemantics } from "../../src/validate/semantic.js";
import { cyoda09Dialect } from "../../src/dialect/cyoda-0_9.js";
import type { WorkflowSession } from "../../src/types/session.js";

function session(transition: Record<string, unknown>): WorkflowSession {
  return {
    entity: null,
    importMode: "MERGE",
    workflows: [{
      version: "1.3", name: "w", initialState: "A", active: true,
      states: { A: { transitions: [{ disabled: false, ...transition }] } },
    }],
  } as unknown as WorkflowSession;
}

function issuesFor(transition: Record<string, unknown>) {
  return validateSemantics(session(transition));
}

const codes = (t: Record<string, unknown>) => issuesFor(t).map((i) => i.code);
const FN = { name: "c", resultKind: "Schedule", calculationNodesTags: "s" };

describe("schedule semantic rules (spec §4)", () => {
  test("flags a schedule with neither mode, as an error", () => {
    const issues = issuesFor({ name: "t", next: "A", manual: false, schedule: { timeoutMs: 5 } });
    const issue = issues.find((i) => i.code === "schedule-mode-required");
    expect(issue?.severity).toBe("error");
  });

  test("flags a bare schedule: {} (zero modes), as an error", () => {
    const issues = issuesFor({ name: "t", next: "A", manual: false, schedule: {} });
    const issue = issues.find((i) => i.code === "schedule-mode-required");
    expect(issue?.severity).toBe("error");
  });

  test.each([0, -1])(
    "flags delayMs: %s as zero modes — cyoda-go's presence test is `> 0`",
    (delayMs) => {
      // This rule exists for the applyPatch path, where the dialect's
      // normalization (which drops a `delayMs <= 0`) has NOT run. Counting a
      // non-positive delayMs as a mode makes the editor pass a document the
      // server reads as mode-less and 400s.
      const issues = issuesFor({ name: "t", next: "A", manual: false, schedule: { delayMs } });
      const issue = issues.find((i) => i.code === "schedule-mode-required");
      expect(issue?.severity).toBe("error");
    },
  );

  test.each([5, 0, -1])(
    "flags delayMs: %s beside a function as schedule-delay-with-function (cyoda-go 0.9.0)",
    (delayMs) => {
      // 0.9.0 refuses any delayMs beside a function, whatever its value —
      // the v0.8.3/0.8.4 exporters' `delayMs: 0` included.
      const c = issuesFor({
        name: "t", next: "A", manual: false, schedule: { delayMs, function: FN },
      });
      const issue = c.find((i) => i.code === "schedule-delay-with-function");
      expect(issue?.severity).toBe("error");
      expect(c.map((i) => i.code)).not.toContain("schedule-mode-required");
    },
  );

  test("a function-only schedule raises neither mode rule", () => {
    const c = codes({ name: "t", next: "A", manual: false, schedule: { function: FN } });
    expect(c).not.toContain("schedule-mode-required");
    expect(c).not.toContain("schedule-delay-with-function");
  });

  test("schedule.function retryPolicy outside NONE/FIXED/empty is an error", () => {
    const issues = issuesFor({
      name: "t", next: "A", manual: false,
      schedule: { function: { ...FN, retryPolicy: "EXPONENTIAL" } },
    });
    expect(issues.find((i) => i.code === "unknown-retry-policy")?.severity).toBe("error");
    expect(
      codes({
        name: "t", next: "A", manual: false, schedule: { function: { ...FN, retryPolicy: "FIXED" } },
      }),
    ).not.toContain("unknown-retry-policy");
  });

  test("schedule.function responseTimeoutMs: negative is an error, above 60000 a warning", () => {
    const neg = issuesFor({
      name: "t", next: "A", manual: false,
      schedule: { function: { ...FN, responseTimeoutMs: -1 } },
    });
    expect(neg.find((i) => i.code === "response-timeout-negative")?.severity).toBe("error");
    const high = issuesFor({
      name: "t", next: "A", manual: false,
      schedule: { function: { ...FN, responseTimeoutMs: 60_001 } },
    });
    expect(high.find((i) => i.code === "response-timeout-above-default-max")?.severity)
      .toBe("warning");
    expect(
      codes({
        name: "t", next: "A", manual: false,
        schedule: { function: { ...FN, responseTimeoutMs: 60_000 } },
      }),
    ).not.toContain("response-timeout-above-default-max");
  });

  test("flags schedule together with manual: true, as an error", () => {
    const issues = issuesFor({ name: "t", next: "A", manual: true, schedule: { delayMs: 5 } });
    const issue = issues.find((i) => i.code === "schedule-manual-conflict");
    expect(issue?.severity).toBe("error");
  });

  test("flags an incomplete schedule function, as an error", () => {
    const issues = issuesFor({
      name: "t", next: "A", manual: false,
      schedule: { function: { ...FN, calculationNodesTags: "" } },
    });
    const issue = issues.find((i) => i.code === "schedule-function-incomplete");
    expect(issue?.severity).toBe("error");
  });

  test("flags a schedule function with both fields omitted, without throwing", () => {
    // Not reachable through the parse entry points (Zod requires both as
    // .min(1) strings), but reachable via applyPatch, which takes a
    // Partial<Transition> and bypasses Zod entirely. validateSemantics must
    // never throw, even when handed a canonical-shaped-but-Zod-unchecked
    // schedule.function missing its required string fields.
    expect(() =>
      issuesFor({
        name: "t", next: "A", manual: false,
        schedule: { function: {} },
      }),
    ).not.toThrow();
    const issues = issuesFor({
      name: "t", next: "A", manual: false,
      schedule: { function: {} },
    });
    const issue = issues.find((i) => i.code === "schedule-function-incomplete");
    expect(issue?.severity).toBe("error");
  });

  test("a negative timeoutMs is an error (cyoda-go 0.9.0 refuses it at import)", () => {
    const issues = validateSemantics(session({
      name: "t", next: "A", manual: false, schedule: { delayMs: 5, timeoutMs: -1 },
    }));
    const issue = issues.find((i) => i.code === "schedule-timeout-negative");
    expect(issue?.severity).toBe("error");
  });

  test("accepts a valid static schedule", () => {
    expect(codes({ name: "t", next: "A", manual: false, schedule: { delayMs: 5, timeoutMs: 0 } }))
      .not.toContain("schedule-mode-required");
  });

  test("treats an explicit function: null as absent, not as a second mode", () => {
    // Off the Zod path (applyPatch's Partial<Transition> bypasses it): a
    // `delayMs` alongside an explicit `function: null` is one mode, not two.
    // A `!== undefined` check alone would miscount this as two modes and
    // wrongly raise schedule-mode-required.
    expect(codes({
      name: "t", next: "A", manual: false, schedule: { delayMs: 5, function: null },
    })).not.toContain("schedule-mode-required");
  });

  test("does not fire on a transition with no schedule", () => {
    const c = codes({ name: "t", next: "A", manual: true });
    expect(c).not.toContain("schedule-mode-required");
    expect(c).not.toContain("schedule-manual-conflict");
  });

  test("end-to-end: normalization strips a lone delayMs: 0, and the rule then fires as zero-mode", () => {
    // Proves normalize09 and schedule-mode-required
    // compose correctly rather than each being right in isolation. The wire
    // payload has delayMs: 0 and no function — a shape the server itself
    // emits (delayMs: 0 beside a function it considers absent) and reads as
    // "no mode". normalize09 strips the 0 because its presence test is `> 0`,
    // not "key exists".
    //
    // This deliberately calls the dialect's toCanonical() directly rather
    // than going through parseImportPayload: TransitionScheduleSchema's own
    // Zod refine (schema/workflow.ts) already rejects a zero-mode schedule
    // as a schema-level error on the *normalized* input, before
    // parseImportPayload ever builds a document — so parseImportPayload
    // never reaches schedule-mode-required for this shape. That refine is
    // exactly why the semantic rule is redundant on the Zod-checked parse
    // path and load-bearing on the Zod-free path (`applyPatch`, a
    // `Partial<Transition>` editor writes into directly). Calling
    // toCanonical() and feeding its output straight to validateSemantics
    // reproduces that second path and proves the two stages compose.
    const raw = {
      importMode: "MERGE",
      workflows: [{
        version: "1.3", name: "w", initialState: "A", active: true,
        states: {
          A: {
            transitions: [{
              name: "t", next: "A", manual: false, disabled: false,
              schedule: { delayMs: 0, timeoutMs: 500 },
            }],
          },
        },
      }],
    };
    const { value: canonical } = cyoda09Dialect.toCanonical(raw);
    const workflows = (canonical as { workflows: unknown[] }).workflows;
    const normalizedTransition = (
      (workflows[0] as Record<string, unknown>)["states"] as Record<string, unknown>
    )["A"] as { transitions: Array<{ schedule?: Record<string, unknown> }> };
    const s = normalizedTransition.transitions[0]!.schedule;
    expect(s).not.toHaveProperty("delayMs");
    expect(s).not.toHaveProperty("function");

    const session = {
      entity: null,
      importMode: "MERGE",
      workflows,
    } as unknown as WorkflowSession;
    const issues = validateSemantics(session);
    const errorCodes = issues.filter((i) => i.severity === "error").map((i) => i.code);
    expect(errorCodes).toContain("schedule-mode-required");
  });
});
