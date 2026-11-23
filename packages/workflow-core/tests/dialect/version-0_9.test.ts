import { describe, expect, test } from "vitest";
import { parseImportPayload, serializeImportPayload } from "../../src/index.js";
import { V0_9_WIRE_FIELDS } from "../../src/dialect/cyoda-0_9.js";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function importJson(workflow: Record<string, unknown>): string {
  return JSON.stringify({ importMode: "MERGE", workflows: [workflow] });
}

const v09Workflow = {
  version: "1.3",
  name: "wf",
  initialState: "new",
  active: true,
  states: {
    new: {
      transitions: [
        {
          name: "go",
          next: "done",
          manual: false,
          schedule: { delayMs: 5000, timeoutMs: 30000 },
          processors: [{ type: "externalized", name: "validate", executionMode: "SYNC" }],
        },
      ],
    },
    done: { transitions: [] },
  },
};

describe("0.9 dialect preserves transitions[].schedule", () => {
  test("schedule survives parse and is present on the canonical transition", () => {
    const result = parseImportPayload(importJson(v09Workflow), undefined, {
      sourceVersion: "0.9",
    });
    expect(result.ok).toBe(true);
    const t = result.value?.workflows[0]?.states["new"]?.transitions[0];
    expect(t?.schedule).toEqual({ delayMs: 5000, timeoutMs: 30000 });
  });

  test("parse → serialize → parse → serialize is byte-identical (round-trip)", () => {
    const first = parseImportPayload(importJson(v09Workflow), undefined, {
      sourceVersion: "0.9",
    });
    const wire1 = serializeImportPayload(first.document!, { targetVersion: "0.9" });

    const second = parseImportPayload(wire1, undefined, { sourceVersion: "0.9" });
    const wire2 = serializeImportPayload(second.document!, { targetVersion: "0.9" });

    expect(wire2).toBe(wire1);
    expect(wire1).toContain('"schedule"');
    expect(wire1).toContain('"delayMs": 5000');
    expect(wire1).toContain('"timeoutMs": 30000');
  });
});

describe("0.9 wire output is provably allowlist-clean", () => {
  test("every node only contains fields in the v0.9 allowlist, even with junk on the canonical model", () => {
    const parsed = parseImportPayload(importJson(v09Workflow), undefined, {
      sourceVersion: "0.9",
    });

    // Inject editor metadata / unknown keys at every level to prove the
    // allowlist strips them rather than leaking them into the import payload.
    const wf = parsed.document!.session.workflows[0] as unknown as Record<string, unknown>;
    wf["__editorOnly"] = true;
    const transition = (
      (wf["states"] as Record<string, { transitions: Record<string, unknown>[] }>)["new"]
        .transitions[0]
    );
    transition["__hover"] = true;
    (transition["schedule"] as Record<string, unknown>)["__note"] = "x";
    // Inject a schedule.function object bearing a junk key too, so the nested
    // pick in allowlistTransition (SCHEDULE_FUNCTION_FIELDS) is actually
    // exercised — without this, assertKeysSubset's `scheduleFunction` branch
    // never runs against any object in this suite.
    (transition["schedule"] as Record<string, unknown>)["function"] = {
      name: "c",
      resultKind: "Schedule",
      calculationNodesTags: "s",
      __fnJunk: "z",
    };
    (transition["processors"] as Record<string, unknown>[])[0]["__selected"] = true;

    const wire = JSON.parse(serializeImportPayload(parsed.document!, { targetVersion: "0.9" }));
    const workflow = wire.workflows[0];

    assertKeysSubset(workflow, V0_9_WIRE_FIELDS.workflow);
    for (const state of Object.values(workflow.states) as Record<string, unknown>[]) {
      assertKeysSubset(state, V0_9_WIRE_FIELDS.state);
      for (const t of (state["transitions"] as Record<string, unknown>[]) ?? []) {
        assertKeysSubset(t, V0_9_WIRE_FIELDS.transition);
        if (isObj(t["schedule"])) {
          assertKeysSubset(t["schedule"], V0_9_WIRE_FIELDS.schedule);
          const fn = (t["schedule"] as Record<string, unknown>)["function"];
          if (isObj(fn)) assertKeysSubset(fn, V0_9_WIRE_FIELDS.scheduleFunction);
        }
        for (const p of (t["processors"] as Record<string, unknown>[]) ?? []) {
          assertKeysSubset(p, V0_9_WIRE_FIELDS.processor);
          if (p["config"]) assertKeysSubset(p["config"], V0_9_WIRE_FIELDS.processorConfig);
        }
      }
    }

    const serialized = JSON.stringify(wire);
    expect(serialized).not.toContain("__editorOnly");
    expect(serialized).not.toContain("__hover");
    expect(serialized).not.toContain("__note");
    expect(serialized).not.toContain("__selected");
    expect(serialized).not.toContain("__fnJunk");
    // And prove the function survives at all — its known fields must be present
    // beside the ones just stripped.
    expect(serialized).toContain('"resultKind":"Schedule"');
  });
});

function assertKeysSubset(obj: unknown, allowed: readonly string[]): void {
  expect(obj && typeof obj === "object").toBe(true);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    expect(allowed).toContain(key);
  }
}

const annotatedWorkflow = {
  version: "1.3",
  name: "wf",
  initialState: "new",
  active: true,
  annotations: { label: "L", roles: ["r"] },
  states: {
    new: {
      transitions: [
        { name: "go", next: "done", manual: false, annotations: { ui: { color: "green" } } },
      ],
      annotations: { hint: "start" },
    },
    done: { transitions: [] },
  },
};

describe("0.9 dialect emits schedule.function", () => {
  test("emits schedule.function in wire order and strips unknown nested keys", () => {
    const raw = JSON.stringify({
      importMode: "MERGE",
      workflows: [{
        version: "1.3", name: "w", initialState: "A", active: true,
        states: { A: { transitions: [{
          name: "t", next: "A", manual: false,
          schedule: {
            timeoutMs: 500,
            function: {
              name: "c", resultKind: "Schedule", calculationNodesTags: "s",
              attachEntity: false, context: "ctx", responseTimeoutMs: 5000,
              retryPolicy: "NONE",
            },
          },
        }] } },
      }],
    });
    const parsed = parseImportPayload(raw);
    const out = JSON.parse(serializeImportPayload(parsed.document!));
    const s = out.workflows[0].states.A.transitions[0].schedule;
    expect(Object.keys(s)).toEqual(["timeoutMs", "function"]);
    expect(Object.keys(s.function)).toEqual([
      "name", "resultKind", "calculationNodesTags",
      "attachEntity", "context", "responseTimeoutMs", "retryPolicy",
    ]);
    // attachEntity: false must survive — absent would mean true server-side.
    expect(s.function.attachEntity).toBe(false);
  });

  test("wire output drops delayMs: 0 beside function (restores Task 7's wire-level assertion)", () => {
    // Task 7's normalization test (tests/dialect/normalization.test.ts) had to
    // retarget this assertion at the canonical document because outputSchedule
    // could not yet emit `function`. Now that it can, assert it here on the
    // serialized wire bytes: a schedule arriving as `{delayMs: 0, timeoutMs: 500,
    // function: {...}}` re-serializes without `delayMs` but with `function` intact.
    const raw = JSON.stringify({
      importMode: "MERGE",
      workflows: [{
        version: "1.3", name: "w", initialState: "A", active: true,
        states: { A: { transitions: [{
          name: "t", next: "A", manual: false,
          schedule: {
            delayMs: 0, timeoutMs: 500,
            function: { name: "c", resultKind: "Schedule", calculationNodesTags: "s" },
          },
        }] } },
      }],
    });
    const parsed = parseImportPayload(raw);
    const wire = serializeImportPayload(parsed.document!);
    const out = JSON.parse(wire);
    const s = out.workflows[0].states.A.transitions[0].schedule;
    expect(s).not.toHaveProperty("delayMs");
    expect(s.function).toEqual({
      name: "c", resultKind: "Schedule", calculationNodesTags: "s",
    });
  });
});

describe("0.9 dialect round-trips annotations", () => {
  test("annotations at all three levels survive parse -> serialize -> parse", () => {
    const first = parseImportPayload(importJson(annotatedWorkflow), undefined, { sourceVersion: "0.9" });
    const wire1 = serializeImportPayload(first.document!, { targetVersion: "0.9" });
    const second = parseImportPayload(wire1, undefined, { sourceVersion: "0.9" });
    const wire2 = serializeImportPayload(second.document!, { targetVersion: "0.9" });

    expect(wire2).toBe(wire1);
    const wf = JSON.parse(wire1).workflows[0];
    expect(wf.annotations).toEqual({ label: "L", roles: ["r"] });
    expect(wf.states.new.annotations).toEqual({ hint: "start" });
    expect(wf.states.new.transitions[0].annotations).toEqual({ ui: { color: "green" } });
  });

  test("opaque inner keys of annotations are NOT stripped by the allowlist", () => {
    const parsed = parseImportPayload(importJson(annotatedWorkflow), undefined, { sourceVersion: "0.9" });
    const wire = serializeImportPayload(parsed.document!, { targetVersion: "0.9" });
    expect(wire).toContain('"color"');
  });
});
