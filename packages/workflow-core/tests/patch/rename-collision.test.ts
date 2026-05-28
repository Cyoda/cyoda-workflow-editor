import { describe, expect, test } from "vitest";
import { applyPatch, PatchConflictError } from "../../src/index.js";
import { makeDoc } from "./helpers.js";

describe("rename-collision protection", () => {
  test("renameState to a non-existing name succeeds", () => {
    const doc = makeDoc({ extraStates: ["other"] });
    expect(() =>
      applyPatch(doc, { op: "renameState", workflow: "wf", from: "start", to: "newName" }),
    ).not.toThrow();
  });

  test("renameState to an existing state name throws PatchConflictError", () => {
    const doc = makeDoc({ extraStates: ["other"] });
    expect(() =>
      applyPatch(doc, { op: "renameState", workflow: "wf", from: "start", to: "other" }),
    ).toThrow(PatchConflictError);
  });

  test("renameState from === to is a no-op (does not throw)", () => {
    const doc = makeDoc();
    expect(() =>
      applyPatch(doc, { op: "renameState", workflow: "wf", from: "start", to: "start" }),
    ).not.toThrow();
  });

  test("addState with an already-existing state code is silently ignored", () => {
    const doc = makeDoc();
    const next = applyPatch(doc, { op: "addState", workflow: "wf", stateCode: "start" });
    // State count should remain the same
    expect(Object.keys(next.session.workflows[0]!.states)).toHaveLength(
      Object.keys(doc.session.workflows[0]!.states).length,
    );
  });

  test("moveTransitionSource throws when transition name collides in target state", () => {
    // Build doc with a transition named "go" from start→end, then add same name from end→start
    const result = makeDoc();
    const doc1 = applyPatch(result, {
      op: "addTransition",
      workflow: "wf",
      fromState: "start",
      transition: { name: "go", next: "end", manual: false, disabled: false },
    });
    const doc2 = applyPatch(doc1, {
      op: "addTransition",
      workflow: "wf",
      fromState: "end",
      transition: { name: "go", next: "start", manual: false, disabled: false },
    });
    // moving "go" from start to end would collide with end's "go"
    expect(() =>
      applyPatch(doc2, {
        op: "moveTransitionSource",
        workflow: "wf",
        fromState: "start",
        toState: "end",
        transitionName: "go",
      }),
    ).toThrow(PatchConflictError);
  });
});
