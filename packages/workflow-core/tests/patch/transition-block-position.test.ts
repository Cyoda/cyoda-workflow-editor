/**
 * Tests for setTransitionBlockPosition / removeTransitionBlockPosition patches.
 * Covers: apply, invert, resetLayout clearing transitionPositions,
 * cleanupWorkflowUi removing stale entries, and serialization exclusion.
 */
import { describe, expect, test } from "vitest";
import {
  applyPatch,
  invertPatch,
  parseImportPayload,
  serializeImportPayload,
} from "../../src/index.js";
import type { WorkflowEditorDocument } from "../../src/index.js";

/**
 * Build a base doc with one workflow "wf", two states a → b,
 * with a single transition "go" from a to b.
 */
function baseDoc(): WorkflowEditorDocument {
  const result = parseImportPayload(
    JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: {
            a: { transitions: [{ name: "go", next: "b", manual: false, disabled: false }] },
            b: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture failed");
  return result.document;
}

/** Return the UUID for the first (only) transition in the fixture. */
function goTransitionUuid(doc: WorkflowEditorDocument): string {
  const entry = Object.entries(doc.meta.ids.transitions).find(
    ([, ptr]) => ptr.workflow === "wf" && ptr.state === "a",
  );
  if (!entry) throw new Error("transition UUID not found");
  return entry[0];
}

describe("setTransitionBlockPosition", () => {
  test("stores x/y in transitionPositions keyed by transition UUID", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const next = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 42,
      y: 84,
    });
    expect(next.meta.workflowUi["wf"]?.transitionPositions?.[uuid]).toEqual({ x: 42, y: 84 });
  });

  test("increments meta.revision", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const before = doc.meta.revision;
    const next = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 1,
      y: 2,
    });
    expect(next.meta.revision).toBe(before + 1);
  });

  test("does not modify session", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const next = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 10,
      y: 20,
    });
    // Session reference should be the same object (short-circuit path)
    expect(next.session).toBe(doc.session);
  });

  test("unknown transitionId is a no-op that still bumps revision", () => {
    const doc = baseDoc();
    const before = doc.meta.revision;
    const next = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: "00000000-0000-0000-0000-000000000000",
      x: 1,
      y: 2,
    });
    expect(next.meta.revision).toBe(before + 1);
    // transitionPositions should not be created
    expect(next.meta.workflowUi["wf"]?.transitionPositions).toBeUndefined();
  });

  test("overwriting an existing position updates the value", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 10,
      y: 20,
    });
    const doc3 = applyPatch(doc2, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 99,
      y: 77,
    });
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions?.[uuid]).toEqual({ x: 99, y: 77 });
  });
});

describe("removeTransitionBlockPosition", () => {
  test("removes the transition position entry", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 10,
      y: 20,
    });
    const doc3 = applyPatch(doc2, {
      op: "removeTransitionBlockPosition",
      transitionId: uuid,
    });
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions?.[uuid]).toBeUndefined();
  });

  test("clears transitionPositions to undefined when last entry removed", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 5,
      y: 6,
    });
    const doc3 = applyPatch(doc2, {
      op: "removeTransitionBlockPosition",
      transitionId: uuid,
    });
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions).toBeUndefined();
  });

  test("increments meta.revision", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 1,
      y: 2,
    });
    const before = doc2.meta.revision;
    const doc3 = applyPatch(doc2, {
      op: "removeTransitionBlockPosition",
      transitionId: uuid,
    });
    expect(doc3.meta.revision).toBe(before + 1);
  });

  test("does not modify session", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 1,
      y: 2,
    });
    const doc3 = applyPatch(doc2, {
      op: "removeTransitionBlockPosition",
      transitionId: uuid,
    });
    expect(doc3.session).toBe(doc2.session);
  });

  test("unknown transitionId is a no-op that still bumps revision", () => {
    const doc = baseDoc();
    const before = doc.meta.revision;
    const next = applyPatch(doc, {
      op: "removeTransitionBlockPosition",
      transitionId: "00000000-0000-0000-0000-000000000000",
    });
    expect(next.meta.revision).toBe(before + 1);
  });
});

describe("invertPatch for transition block position", () => {
  test("invertPatch(setTransitionBlockPosition) with no prior position returns removeTransitionBlockPosition", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const inv = invertPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 10,
      y: 20,
    });
    expect(inv.op).toBe("removeTransitionBlockPosition");
    if (inv.op === "removeTransitionBlockPosition") {
      expect(inv.transitionId).toBe(uuid);
    }
  });

  test("invertPatch(setTransitionBlockPosition) with prior position returns prior coords", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 5,
      y: 6,
    });
    const inv = invertPatch(doc2, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 99,
      y: 88,
    });
    expect(inv.op).toBe("setTransitionBlockPosition");
    if (inv.op === "setTransitionBlockPosition") {
      expect(inv.transitionId).toBe(uuid);
      expect(inv.x).toBe(5);
      expect(inv.y).toBe(6);
    }
  });

  test("invertPatch(removeTransitionBlockPosition) with prior position returns setTransitionBlockPosition", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 7,
      y: 8,
    });
    const inv = invertPatch(doc2, {
      op: "removeTransitionBlockPosition",
      transitionId: uuid,
    });
    expect(inv.op).toBe("setTransitionBlockPosition");
    if (inv.op === "setTransitionBlockPosition") {
      expect(inv.transitionId).toBe(uuid);
      expect(inv.x).toBe(7);
      expect(inv.y).toBe(8);
    }
  });

  test("invertPatch(removeTransitionBlockPosition) with no prior position returns noop", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const inv = invertPatch(doc, {
      op: "removeTransitionBlockPosition",
      transitionId: uuid,
    });
    // noop is encoded as setImportMode per invert.ts convention
    expect(inv.op).toBe("setImportMode");
  });

  test("round-trip: apply then apply inverse returns equivalent doc", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const patch = {
      op: "setTransitionBlockPosition" as const,
      transitionId: uuid,
      x: 100,
      y: 200,
    };
    const doc2 = applyPatch(doc, patch);
    const inv = invertPatch(doc, patch);
    const doc3 = applyPatch(doc2, inv);
    // After undo the position should be gone
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions?.[uuid]).toBeUndefined();
  });
});

describe("resetLayout clears transitionPositions", () => {
  test("resetLayout sets transitionPositions to undefined", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 10,
      y: 20,
    });
    expect(doc2.meta.workflowUi["wf"]?.transitionPositions).toBeDefined();
    const doc3 = applyPatch(doc2, { op: "resetLayout", workflow: "wf" });
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions).toBeUndefined();
  });

  test("resetLayout still clears layout.nodes as before", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    let doc2 = applyPatch(doc, { op: "setNodePosition", workflow: "wf", stateCode: "a", x: 1, y: 2 });
    doc2 = applyPatch(doc2, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 5,
      y: 6,
    });
    const doc3 = applyPatch(doc2, { op: "resetLayout", workflow: "wf" });
    expect(doc3.meta.workflowUi["wf"]?.layout).toBeUndefined();
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions).toBeUndefined();
  });
});

describe("serialization excludes transitionPositions", () => {
  test("transitionPositions does not appear in serializeImportPayload output", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 42,
      y: 84,
    });
    const serialized = serializeImportPayload(doc2);
    expect(serialized).not.toContain("transitionPositions");
    expect(serialized).not.toContain("workflowUi");
  });

  test("parsed serialized output has no transitionPositions anywhere", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 42,
      y: 84,
    });
    const parsed = JSON.parse(serializeImportPayload(doc2));
    const str = JSON.stringify(parsed);
    expect(str).not.toContain("transitionPositions");
    expect(str).not.toContain("workflowUi");
  });

  test("serialized output is identical before and after setting transition block position", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const before = serializeImportPayload(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 42,
      y: 84,
    });
    const after = serializeImportPayload(doc2);
    expect(before).toBe(after);
  });
});

describe("localStorage round-trip", () => {
  test("transitionPositions survives JSON serialization of meta.workflowUi", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 42,
      y: 84,
    });
    // Simulate localStorage: JSON.stringify → JSON.parse
    const stored = JSON.stringify(doc2.meta.workflowUi);
    const restored = JSON.parse(stored) as typeof doc2.meta.workflowUi;
    expect(restored["wf"]?.transitionPositions?.[uuid]).toEqual({ x: 42, y: 84 });
  });
});

describe("cleanupWorkflowUi removes stale transitionPositions", () => {
  test("after replaceSession that removes a transition, stale position entry is cleaned up", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);

    // Set a position for the transition
    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 10,
      y: 20,
    });
    expect(doc2.meta.workflowUi["wf"]?.transitionPositions?.[uuid]).toBeDefined();

    // Remove the transition via replaceSession (simulating JSON edit that removes it)
    const sessionWithoutTransition = {
      ...doc2.session,
      workflows: doc2.session.workflows.map((wf) => ({
        ...wf,
        states: {
          ...wf.states,
          a: { transitions: [] }, // remove the "go" transition
        },
      })),
    };
    const doc3 = applyPatch(doc2, { op: "replaceSession", session: sessionWithoutTransition });

    // The stale position should be removed
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions?.[uuid]).toBeUndefined();
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions).toBeUndefined();
  });

  test("transitionPositions for surviving transitions are preserved during cleanup", () => {
    const doc = baseDoc();
    const uuid = goTransitionUuid(doc);

    const doc2 = applyPatch(doc, {
      op: "setTransitionBlockPosition",
      transitionId: uuid,
      x: 10,
      y: 20,
    });

    // Replace session keeping the same transitions intact
    const doc3 = applyPatch(doc2, { op: "replaceSession", session: doc2.session });

    // Position should still be present since the transition still exists
    expect(doc3.meta.workflowUi["wf"]?.transitionPositions?.[uuid]).toEqual({ x: 10, y: 20 });
  });
});
