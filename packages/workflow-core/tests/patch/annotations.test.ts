import { describe, expect, test } from "vitest";
import { applyPatch, invertPatch, parseImportPayload } from "../../src/index.js";
import type { DomainPatch, WorkflowEditorDocument } from "../../src/index.js";

function doc(): WorkflowEditorDocument {
  const json = JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "wf",
        initialState: "NEW",
        active: true,
        states: {
          NEW: { transitions: [{ name: "go", next: "DONE", manual: false }] },
          DONE: { transitions: [] },
        },
      },
    ],
  });
  return parseImportPayload(json).document!;
}

function transitionUuid(d: WorkflowEditorDocument): string {
  return Object.keys(d.meta.ids.transitions)[0]!;
}

describe("setAnnotations apply", () => {
  test("sets, replaces, and removes workflow-level annotations", () => {
    const d0 = doc();
    const set: DomainPatch = { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { a: 1 } };
    const d1 = applyPatch(d0, set);
    expect(d1.session.workflows[0]!.annotations).toEqual({ a: 1 });

    const replace: DomainPatch = { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { b: 2 } };
    const d2 = applyPatch(d1, replace);
    expect(d2.session.workflows[0]!.annotations).toEqual({ b: 2 });

    const remove: DomainPatch = { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" } };
    const d3 = applyPatch(d2, remove);
    expect(d3.session.workflows[0]!.annotations).toBeUndefined();
  });

  test("sets state- and transition-level annotations without touching siblings", () => {
    const d0 = doc();
    const d1 = applyPatch(d0, { op: "setAnnotations", target: { kind: "state", workflow: "wf", stateCode: "NEW" }, annotations: { s: 1 } });
    expect(d1.session.workflows[0]!.states["NEW"]!.annotations).toEqual({ s: 1 });
    expect(d1.session.workflows[0]!.states["DONE"]!.annotations).toBeUndefined();

    const uuid = transitionUuid(d1);
    const d2 = applyPatch(d1, { op: "setAnnotations", target: { kind: "transition", transitionUuid: uuid }, annotations: { t: 1 } });
    expect(d2.session.workflows[0]!.states["NEW"]!.transitions[0]!.annotations).toEqual({ t: 1 });
    expect(d2.session.workflows[0]!.states["NEW"]!.annotations).toEqual({ s: 1 });
  });
});

describe("setAnnotations invert round-trips", () => {
  test("set-over-absent inverts to remove; replace and remove invert exactly", () => {
    const d0 = doc();
    for (const [before, patch] of [
      [d0, { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { a: 1 } }],
      [applyPatch(d0, { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { a: 1 } }),
       { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { b: 2 } }],
      [applyPatch(d0, { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" }, annotations: { a: 1 } }),
       { op: "setAnnotations", target: { kind: "workflow", workflow: "wf" } }],
    ] as [WorkflowEditorDocument, DomainPatch][]) {
      const after = applyPatch(before, patch);
      const inverse = invertPatch(before, patch);
      const restored = applyPatch(after, inverse);
      expect(restored.session.workflows[0]!.annotations).toEqual(before.session.workflows[0]!.annotations);
    }
  });
});
