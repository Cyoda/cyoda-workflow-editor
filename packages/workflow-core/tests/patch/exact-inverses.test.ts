import { describe, expect, test } from "vitest";
import { applyPatch, applyPatches, invertPatch } from "../../src/index.js";
import type { WorkflowEditorDocument } from "../../src/index.js";
import { firstTransitionUuid, makeDoc } from "./helpers.js";

/** Apply patch, then invert, expect to be back to original (modulo revision). */
function roundTrip(doc: WorkflowEditorDocument, patch: Parameters<typeof applyPatch>[1]) {
  const afterApply = applyPatch(doc, patch);
  const inverse = invertPatch(doc, patch);
  const afterInvert = applyPatch(afterApply, inverse);
  // Sessions must match exactly; revision differs by design
  expect(afterInvert.session).toEqual(doc.session);
}

describe("exact patch inverses", () => {
  test("renameState has exact inverse", () => {
    const doc = makeDoc();
    roundTrip(doc, { op: "renameState", workflow: "wf", from: "start", to: "renamed" });
  });

  test("removeTransition has exact inverse (re-adds transition)", () => {
    const doc0 = makeDoc();
    const doc1 = applyPatch(doc0, {
      op: "addTransition",
      workflow: "wf",
      fromState: "start",
      transition: { name: "go", next: "end", manual: false, disabled: false },
    });
    const transitionUuid = firstTransitionUuid(doc1, "wf", "start");
    roundTrip(doc1, { op: "removeTransition", transitionUuid });
  });

  test("reorderTransition has exact inverse", () => {
    const doc0 = makeDoc();
    const doc1 = applyPatch(doc0, {
      op: "addTransition",
      workflow: "wf",
      fromState: "start",
      transition: { name: "a", next: "end", manual: false, disabled: false },
    });
    const doc2 = applyPatch(doc1, {
      op: "addTransition",
      workflow: "wf",
      fromState: "start",
      transition: { name: "b", next: "end", manual: false, disabled: false },
    });
    const uuids = Object.entries(doc2.meta.ids.transitions)
      .filter(([, p]) => p.workflow === "wf" && p.state === "start")
      .map(([uuid]) => uuid);
    // reorder first transition to index 1
    roundTrip(doc2, {
      op: "reorderTransition",
      workflow: "wf",
      fromState: "start",
      transitionUuid: uuids[0]!,
      toIndex: 1,
    });
  });

  test("removeProcessor has exact inverse", () => {
    const doc0 = makeDoc();
    const doc1 = applyPatch(doc0, {
      op: "addTransition",
      workflow: "wf",
      fromState: "start",
      transition: { name: "go", next: "end", manual: false, disabled: false },
    });
    const transitionUuid = firstTransitionUuid(doc1, "wf", "start");
    const doc2 = applyPatch(doc1, {
      op: "addProcessor",
      transitionUuid,
      processor: { type: "externalized", name: "proc1", executionMode: "ASYNC_NEW_TX", config: {} },
    });
    const processorUuid = Object.keys(doc2.meta.ids.processors)[0]!;
    roundTrip(doc2, { op: "removeProcessor", processorUuid });
  });

  test("reorderProcessor has exact inverse", () => {
    const doc0 = makeDoc();
    const doc1 = applyPatch(doc0, {
      op: "addTransition",
      workflow: "wf",
      fromState: "start",
      transition: { name: "go", next: "end", manual: false, disabled: false },
    });
    const transitionUuid = firstTransitionUuid(doc1, "wf", "start");
    const doc2 = applyPatch(doc1, {
      op: "addProcessor",
      transitionUuid,
      processor: { type: "externalized", name: "proc1", executionMode: "ASYNC_NEW_TX", config: {} },
    });
    const doc3 = applyPatch(doc2, {
      op: "addProcessor",
      transitionUuid,
      processor: { type: "externalized", name: "proc2", executionMode: "ASYNC_NEW_TX", config: {} },
    });
    const processorUuids = Object.keys(doc3.meta.ids.processors);
    roundTrip(doc3, {
      op: "reorderProcessor",
      transitionUuid,
      processorUuid: processorUuids[0]!,
      toIndex: 1,
    });
  });

  test("moveTransitionSource has exact inverse", () => {
    const doc0 = makeDoc();
    const doc1 = applyPatch(doc0, {
      op: "addTransition",
      workflow: "wf",
      fromState: "start",
      transition: { name: "go", next: "end", manual: false, disabled: false },
    });
    roundTrip(doc1, {
      op: "moveTransitionSource",
      workflow: "wf",
      fromState: "start",
      toState: "end",
      transitionName: "go",
    });
  });

  test("setNodePosition has exact inverse (removeNodePosition when no prior)", () => {
    const doc = makeDoc();
    const next = applyPatch(doc, {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "start",
      x: 100,
      y: 200,
    });
    const inverse = invertPatch(doc, {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "start",
      x: 100,
      y: 200,
    });
    const reverted = applyPatch(next, inverse);
    expect(reverted.meta.workflowUi["wf"]?.layout?.nodes?.["start"]).toBeUndefined();
  });

  test("setNodePosition over existing position restores prior", () => {
    const doc0 = makeDoc();
    const doc1 = applyPatch(doc0, {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "start",
      x: 10,
      y: 20,
    });
    const patch2 = { op: "setNodePosition" as const, workflow: "wf", stateCode: "start", x: 99, y: 88 };
    const inverse = invertPatch(doc1, patch2);
    const doc2 = applyPatch(doc1, patch2);
    const reverted = applyPatch(doc2, inverse);
    expect(reverted.meta.workflowUi["wf"]?.layout?.nodes?.["start"]).toEqual({ x: 10, y: 20, pinned: true });
  });

  test("addComment / removeComment are exact inverses of each other", () => {
    const doc = makeDoc();
    const comment = { id: "c1", text: "hello", x: 50, y: 60 };
    const doc1 = applyPatch(doc, { op: "addComment", workflow: "wf", comment });
    expect(doc1.meta.workflowUi["wf"]?.comments?.["c1"]).toEqual(comment);
    const doc2 = applyPatch(doc1, { op: "removeComment", workflow: "wf", commentId: "c1" });
    expect(doc2.meta.workflowUi["wf"]?.comments?.["c1"]).toBeUndefined();
    // Inverse of addComment is removeComment
    const inv = invertPatch(doc, { op: "addComment", workflow: "wf", comment });
    expect(inv).toEqual({ op: "removeComment", workflow: "wf", commentId: "c1" });
  });

  test("updateComment has exact inverse", () => {
    const doc0 = makeDoc();
    const doc1 = applyPatch(doc0, {
      op: "addComment",
      workflow: "wf",
      comment: { id: "c1", text: "original", x: 0, y: 0 },
    });
    const patch = { op: "updateComment" as const, workflow: "wf", commentId: "c1", updates: { text: "changed" } };
    const inverse = invertPatch(doc1, patch);
    const doc2 = applyPatch(doc1, patch);
    const reverted = applyPatch(doc2, inverse);
    expect(reverted.meta.workflowUi["wf"]?.comments?.["c1"]?.text).toBe("original");
  });

  test("addTransition inverse via dispatchTransaction round-trip (simulated)", () => {
    // Simulate what the store's dispatchTransaction does: find the new UUID after apply.
    const doc0 = makeDoc();
    const patch = {
      op: "addTransition" as const,
      workflow: "wf",
      fromState: "start",
      transition: { name: "go", next: "end", manual: false, disabled: false },
    };
    const doc1 = applyPatch(doc0, patch);
    const priorUUIDs = new Set(Object.keys(doc0.meta.ids.transitions));
    const newUUID = Object.keys(doc1.meta.ids.transitions).find((u) => !priorUUIDs.has(u))!;
    expect(newUUID).toBeTruthy();
    const inverse = { op: "removeTransition" as const, transitionUuid: newUUID };
    const reverted = applyPatch(doc1, inverse);
    expect(reverted.session).toEqual(doc0.session);
  });

  test("applyPatches in sequence matches manual round-trip", () => {
    const doc = makeDoc();
    const patches = [
      { op: "addState" as const, workflow: "wf", stateCode: "middle" },
      { op: "renameState" as const, workflow: "wf", from: "middle", to: "renamed" },
    ];
    const result = applyPatches(doc, patches);
    expect(result.session.workflows[0]?.states["renamed"]).toBeDefined();
    expect(result.session.workflows[0]?.states["middle"]).toBeUndefined();
  });
});
