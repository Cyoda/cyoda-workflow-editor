import { describe, expect, test } from "vitest";
import { validateSemantics } from "../../src/validate/semantic.js";
import type { Criterion } from "../../src/types/criterion.js";
import type { WorkflowSession } from "../../src/types/session.js";
import type { Transition } from "../../src/types/workflow.js";

function tr(
  name: string,
  opts: {
    manual?: boolean;
    disabled?: boolean;
    criterion?: Criterion;
    next?: string;
  } = {},
): Transition {
  return {
    name,
    next: opts.next ?? "end",
    manual: opts.manual ?? false,
    disabled: opts.disabled ?? false,
    ...(opts.criterion ? { criterion: opts.criterion } : {}),
  };
}

function sessionWith(transitions: Transition[]): WorkflowSession {
  return {
    entity: null,
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "wf",
        initialState: "start",
        active: true,
        states: {
          start: { transitions },
          end: { transitions: [] },
        },
      },
    ],
  };
}

const SIMPLE: Criterion = {
  type: "simple",
  jsonPath: "$.x",
  operation: "EQUALS",
  value: 1,
};

describe("automated transition ordering rules", () => {
  test("single null-criterion automated transition → no warning", () => {
    const issues = validateSemantics(sessionWith([tr("go")]));
    const codes = issues.map((i) => i.code);
    expect(codes).not.toContain("null-criterion-not-last");
    expect(codes).not.toContain("unreachable-automated-transition");
  });

  test("null-criterion followed by another automated → both codes emitted", () => {
    const issues = validateSemantics(
      sessionWith([tr("go"), tr("fallback", { criterion: SIMPLE })]),
    );
    const offender = issues.find((i) => i.code === "null-criterion-not-last");
    const dead = issues.find((i) => i.code === "unreachable-automated-transition");
    expect(offender).toBeDefined();
    expect(offender?.severity).toBe("warning");
    expect(offender?.detail?.["transitionName"]).toBe("go");
    expect(dead).toBeDefined();
    expect(dead?.severity).toBe("warning");
    expect(dead?.detail?.["transitionName"]).toBe("fallback");
    expect(dead?.detail?.["blockedBy"]).toBe("go");
  });

  test("null-criterion followed only by manual transitions → no warning", () => {
    const codes = validateSemantics(
      sessionWith([tr("go"), tr("approve", { manual: true })]),
    ).map((i) => i.code);
    expect(codes).not.toContain("null-criterion-not-last");
    expect(codes).not.toContain("unreachable-automated-transition");
  });

  test("null-criterion followed only by disabled automated → no warning", () => {
    const codes = validateSemantics(
      sessionWith([tr("go"), tr("legacy", { disabled: true })]),
    ).map((i) => i.code);
    expect(codes).not.toContain("null-criterion-not-last");
    expect(codes).not.toContain("unreachable-automated-transition");
  });

  test("null-criterion in middle, later guarded automated still flagged unreachable", () => {
    const issues = validateSemantics(
      sessionWith([
        tr("first", { criterion: SIMPLE }),
        tr("middle"),
        tr("last", { criterion: SIMPLE }),
      ]),
    );
    const offender = issues.find((i) => i.code === "null-criterion-not-last");
    expect(offender?.detail?.["transitionName"]).toBe("middle");
    const dead = issues.filter((i) => i.code === "unreachable-automated-transition");
    expect(dead.map((d) => d.detail?.["transitionName"])).toEqual(["last"]);
  });

  test("two null-criterion automateds in a row → first offender, second unreachable", () => {
    const issues = validateSemantics(
      sessionWith([tr("alpha"), tr("beta")]),
    );
    const offenders = issues.filter((i) => i.code === "null-criterion-not-last");
    const deads = issues.filter((i) => i.code === "unreachable-automated-transition");
    expect(offenders).toHaveLength(1);
    expect(offenders[0]?.detail?.["transitionName"]).toBe("alpha");
    expect(deads).toHaveLength(1);
    expect(deads[0]?.detail?.["transitionName"]).toBe("beta");
    expect(deads[0]?.detail?.["blockedBy"]).toBe("alpha");
  });

  test("all guarded automated transitions → no warnings emitted", () => {
    const codes = validateSemantics(
      sessionWith([
        tr("a", { criterion: SIMPLE }),
        tr("b", { criterion: SIMPLE }),
        tr("c", { criterion: SIMPLE }),
      ]),
    ).map((i) => i.code);
    expect(codes).not.toContain("null-criterion-not-last");
    expect(codes).not.toContain("unreachable-automated-transition");
  });
});
