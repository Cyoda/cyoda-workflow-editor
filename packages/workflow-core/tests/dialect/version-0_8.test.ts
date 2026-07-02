import { describe, expect, test } from "vitest";
import { parseImportPayload, serializeImportPayload } from "../../src/index.js";
import { V0_8_WIRE_FIELDS } from "../../src/dialect/cyoda-0_8.js";

function importJson(workflow: Record<string, unknown>): string {
  return JSON.stringify({ importMode: "MERGE", workflows: [workflow] });
}

const scheduledWorkflow = {
  version: "1.0",
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
          processors: [
            { type: "externalized", name: "validate", executionMode: "SYNC" },
            { type: "scheduled", name: "timer", config: { delayMs: 1000, transition: "go" } },
          ],
        },
      ],
    },
    done: { transitions: [] },
  },
};

const v08Workflow = {
  version: "1.0",
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

describe("0.7 dialect drops scheduled processors with a warning", () => {
  test("a scheduled processor is removed and reported", () => {
    const result = parseImportPayload(importJson(scheduledWorkflow), undefined, {
      sourceVersion: "0.7",
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("dropped-scheduled-processor:timer");

    const procs = result.value?.workflows[0]?.states["new"]?.transitions[0]?.processors;
    expect(procs?.map((p) => p.name)).toEqual(["validate"]);
    expect(procs?.some((p) => (p as { type: string }).type === "scheduled")).toBe(false);
  });

  test("no warnings field when there is nothing to drop", () => {
    const result = parseImportPayload(importJson(v08Workflow), undefined, {
      sourceVersion: "0.7",
    });
    expect(result.warnings).toBeUndefined();
  });
});

describe("0.8 dialect preserves transitions[].schedule", () => {
  test("schedule survives parse and is present on the canonical transition", () => {
    const result = parseImportPayload(importJson(v08Workflow), undefined, {
      sourceVersion: "0.8",
    });
    expect(result.ok).toBe(true);
    const t = result.value?.workflows[0]?.states["new"]?.transitions[0];
    expect(t?.schedule).toEqual({ delayMs: 5000, timeoutMs: 30000 });
  });

  test("parse → serialize → parse → serialize is byte-identical (round-trip)", () => {
    const first = parseImportPayload(importJson(v08Workflow), undefined, {
      sourceVersion: "0.8",
    });
    const wire1 = serializeImportPayload(first.document!, { targetVersion: "0.8" });

    const second = parseImportPayload(wire1, undefined, { sourceVersion: "0.8" });
    const wire2 = serializeImportPayload(second.document!, { targetVersion: "0.8" });

    expect(wire2).toBe(wire1);
    expect(wire1).toContain('"schedule"');
    expect(wire1).toContain('"delayMs": 5000');
    expect(wire1).toContain('"timeoutMs": 30000');
  });

  test("0.7 wire omits transitions[].schedule (field absent in v0.7)", () => {
    const parsed = parseImportPayload(importJson(v08Workflow), undefined, {
      sourceVersion: "0.8",
    });
    const wire07 = serializeImportPayload(parsed.document!, { targetVersion: "0.7" });
    expect(wire07).not.toContain('"schedule"');
  });
});

describe("0.8 wire output is provably allowlist-clean", () => {
  test("every node only contains fields in the v0.8 allowlist, even with junk on the canonical model", () => {
    const parsed = parseImportPayload(importJson(v08Workflow), undefined, {
      sourceVersion: "0.8",
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
    (transition["processors"] as Record<string, unknown>[])[0]["__selected"] = true;

    const wire = JSON.parse(serializeImportPayload(parsed.document!, { targetVersion: "0.8" }));
    const workflow = wire.workflows[0];

    assertKeysSubset(workflow, V0_8_WIRE_FIELDS.workflow);
    for (const state of Object.values(workflow.states) as Record<string, unknown>[]) {
      assertKeysSubset(state, V0_8_WIRE_FIELDS.state);
      for (const t of (state["transitions"] as Record<string, unknown>[]) ?? []) {
        assertKeysSubset(t, V0_8_WIRE_FIELDS.transition);
        if (t["schedule"]) assertKeysSubset(t["schedule"], V0_8_WIRE_FIELDS.schedule);
        for (const p of (t["processors"] as Record<string, unknown>[]) ?? []) {
          assertKeysSubset(p, V0_8_WIRE_FIELDS.processor);
          if (p["config"]) assertKeysSubset(p["config"], V0_8_WIRE_FIELDS.processorConfig);
        }
      }
    }

    const serialized = JSON.stringify(wire);
    expect(serialized).not.toContain("__editorOnly");
    expect(serialized).not.toContain("__hover");
    expect(serialized).not.toContain("__note");
    expect(serialized).not.toContain("__selected");
  });
});

function assertKeysSubset(obj: unknown, allowed: readonly string[]): void {
  expect(obj && typeof obj === "object").toBe(true);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    expect(allowed).toContain(key);
  }
}

const annotatedWorkflow = {
  version: "1.0",
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

describe("0.8 dialect round-trips annotations", () => {
  test("annotations at all three levels survive parse -> serialize -> parse", () => {
    const first = parseImportPayload(importJson(annotatedWorkflow), undefined, { sourceVersion: "0.8" });
    const wire1 = serializeImportPayload(first.document!, { targetVersion: "0.8" });
    const second = parseImportPayload(wire1, undefined, { sourceVersion: "0.8" });
    const wire2 = serializeImportPayload(second.document!, { targetVersion: "0.8" });

    expect(wire2).toBe(wire1);
    const wf = JSON.parse(wire1).workflows[0];
    expect(wf.annotations).toEqual({ label: "L", roles: ["r"] });
    expect(wf.states.new.annotations).toEqual({ hint: "start" });
    expect(wf.states.new.transitions[0].annotations).toEqual({ ui: { color: "green" } });
  });

  test("opaque inner keys of annotations are NOT stripped by the allowlist", () => {
    const parsed = parseImportPayload(importJson(annotatedWorkflow), undefined, { sourceVersion: "0.8" });
    const wire = serializeImportPayload(parsed.document!, { targetVersion: "0.8" });
    expect(wire).toContain('"color"');
  });

  test("0.7 wire omits annotations (field absent in v0.7)", () => {
    const parsed = parseImportPayload(importJson(annotatedWorkflow), undefined, { sourceVersion: "0.8" });
    const wire07 = serializeImportPayload(parsed.document!, { targetVersion: "0.7" });
    expect(wire07).not.toContain('"annotations"');
  });
});
