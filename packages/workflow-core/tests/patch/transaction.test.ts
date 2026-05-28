import { describe, expect, test } from "vitest";
import { applyTransaction, invertTransaction } from "../../src/index.js";
import type { PatchTransaction } from "../../src/index.js";
import { makeDoc } from "./helpers.js";

describe("PatchTransaction", () => {
  test("applyTransaction applies all patches in order", () => {
    const doc = makeDoc();
    const tx: PatchTransaction = {
      summary: "Add state and position it",
      patches: [
        { op: "addState", workflow: "wf", stateCode: "new" },
        { op: "setNodePosition", workflow: "wf", stateCode: "new", x: 50, y: 100 },
      ],
      inverses: [
        { op: "removeNodePosition", workflow: "wf", stateCode: "new" },
        { op: "removeState", workflow: "wf", stateCode: "new" },
      ],
    };
    const result = applyTransaction(doc, tx);
    expect(result.session.workflows[0]?.states["new"]).toBeDefined();
    expect(result.meta.workflowUi["wf"]?.layout?.nodes?.["new"]).toEqual({
      x: 50,
      y: 100,
      pinned: true,
    });
  });

  test("invertTransaction produces a transaction that undoes the original", () => {
    const doc = makeDoc();
    // inverses must be in undo-application order: undo the LAST patch first.
    // patches[1] = renameState("temp"→"final") → its inverse comes first
    // patches[0] = addState("temp")             → its inverse comes second
    const tx: PatchTransaction = {
      summary: "Add and rename state",
      patches: [
        { op: "addState", workflow: "wf", stateCode: "temp" },
        { op: "renameState", workflow: "wf", from: "temp", to: "final" },
      ],
      inverses: [
        { op: "renameState", workflow: "wf", from: "final", to: "temp" },
        { op: "removeState", workflow: "wf", stateCode: "temp" },
      ],
    };
    const applied = applyTransaction(doc, tx);
    expect(applied.session.workflows[0]?.states["final"]).toBeDefined();

    const undoTx = invertTransaction(doc, tx);
    const reverted = applyTransaction(applied, undoTx);
    expect(reverted.session.workflows[0]?.states["final"]).toBeUndefined();
    expect(reverted.session.workflows[0]?.states["temp"]).toBeUndefined();
    // Session should be back to original
    expect(reverted.session).toEqual(doc.session);
  });

  test("invertTransaction with empty inverses falls back to computing from doc", () => {
    const doc = makeDoc();
    const tx: PatchTransaction = {
      summary: "Add state",
      patches: [{ op: "addState", workflow: "wf", stateCode: "computed" }],
      inverses: [],
    };
    const applied = applyTransaction(doc, tx);
    expect(applied.session.workflows[0]?.states["computed"]).toBeDefined();

    const undoTx = invertTransaction(doc, tx);
    const reverted = applyTransaction(applied, undoTx);
    // addState inverse (computed) is removeState
    expect(reverted.session.workflows[0]?.states["computed"]).toBeUndefined();
  });

  test("addState + setNodePosition transaction is one atomic undo step", () => {
    const doc = makeDoc();
    // inverses in undo-application order: undo setNodePosition (last patch) first,
    // then undo addState.
    const stateTx: PatchTransaction = {
      summary: `Add state "placed"`,
      patches: [
        { op: "addState", workflow: "wf", stateCode: "placed" },
        { op: "setNodePosition", workflow: "wf", stateCode: "placed", x: 10, y: 20 },
      ],
      inverses: [
        { op: "removeNodePosition", workflow: "wf", stateCode: "placed" },
        { op: "removeState", workflow: "wf", stateCode: "placed" },
      ],
    };
    const applied = applyTransaction(doc, stateTx);
    const undoTx = invertTransaction(doc, stateTx);
    const reverted = applyTransaction(applied, undoTx);

    expect(reverted.session).toEqual(doc.session);
    expect(reverted.meta.workflowUi["wf"]?.layout?.nodes?.["placed"]).toBeUndefined();
  });
});
