/**
 * Tests for comment and layout metadata patches:
 * addComment, updateComment, removeComment, setNodePosition,
 * removeNodePosition, resetLayout, and the cleanupWorkflowUi
 * behaviour that fires after replaceSession.
 */
import { describe, expect, test } from "vitest";
import {
  applyPatch,
  invertPatch,
  parseImportPayload,
} from "../../src/index.js";
import type { WorkflowEditorDocument } from "../../src/index.js";

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

describe("addComment / updateComment / removeComment", () => {
  test("addComment stores comment in workflowUi", () => {
    const doc = applyPatch(baseDoc(), {
      op: "addComment",
      workflow: "wf",
      comment: { id: "c1", text: "hello", x: 10, y: 20 },
    });
    expect(doc.meta.workflowUi["wf"]?.comments?.["c1"]).toEqual({
      id: "c1",
      text: "hello",
      x: 10,
      y: 20,
    });
  });

  test("updateComment changes specified fields only", () => {
    let doc = applyPatch(baseDoc(), {
      op: "addComment",
      workflow: "wf",
      comment: { id: "c1", text: "original", x: 10, y: 20 },
    });
    doc = applyPatch(doc, {
      op: "updateComment",
      workflow: "wf",
      commentId: "c1",
      updates: { text: "updated", x: 99 },
    });
    const c = doc.meta.workflowUi["wf"]?.comments?.["c1"];
    expect(c?.text).toBe("updated");
    expect(c?.x).toBe(99);
    expect(c?.y).toBe(20); // unchanged
  });

  test("removeComment deletes the entry", () => {
    let doc = applyPatch(baseDoc(), {
      op: "addComment",
      workflow: "wf",
      comment: { id: "c1", text: "hello", x: 10, y: 20 },
    });
    doc = applyPatch(doc, { op: "removeComment", workflow: "wf", commentId: "c1" });
    expect(doc.meta.workflowUi["wf"]?.comments?.["c1"]).toBeUndefined();
  });

  test("addComment inverse is removeComment", () => {
    const doc = baseDoc();
    const inv = invertPatch(doc, {
      op: "addComment",
      workflow: "wf",
      comment: { id: "c1", text: "hi", x: 0, y: 0 },
    });
    expect(inv.op).toBe("removeComment");
  });

  test("removeComment inverse is addComment", () => {
    const doc = applyPatch(baseDoc(), {
      op: "addComment",
      workflow: "wf",
      comment: { id: "c1", text: "bye", x: 5, y: 5 },
    });
    const inv = invertPatch(doc, { op: "removeComment", workflow: "wf", commentId: "c1" });
    expect(inv.op).toBe("addComment");
    if (inv.op === "addComment") {
      expect(inv.comment.text).toBe("bye");
    }
  });
});

describe("setNodePosition / removeNodePosition / resetLayout", () => {
  test("setNodePosition stores x/y/pinned in layout.nodes", () => {
    const doc = applyPatch(baseDoc(), {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "a",
      x: 100,
      y: 200,
      pinned: true,
    });
    expect(doc.meta.workflowUi["wf"]?.layout?.nodes?.["a"]).toEqual({
      x: 100,
      y: 200,
      pinned: true,
    });
  });

  test("removeNodePosition deletes a single entry", () => {
    let doc = applyPatch(baseDoc(), {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "a",
      x: 1,
      y: 2,
    });
    doc = applyPatch(doc, { op: "removeNodePosition", workflow: "wf", stateCode: "a" });
    expect(doc.meta.workflowUi["wf"]?.layout?.nodes?.["a"]).toBeUndefined();
  });

  test("resetLayout clears all layout.nodes", () => {
    let doc = applyPatch(baseDoc(), {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "a",
      x: 1,
      y: 2,
    });
    doc = applyPatch(doc, {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "b",
      x: 3,
      y: 4,
    });
    doc = applyPatch(doc, { op: "resetLayout", workflow: "wf" });
    expect(doc.meta.workflowUi["wf"]?.layout).toBeUndefined();
  });

  test("setNodePosition inverse restores prior absent state", () => {
    const doc = baseDoc();
    const patch = {
      op: "setNodePosition" as const,
      workflow: "wf",
      stateCode: "a",
      x: 10,
      y: 20,
    };
    const inv = invertPatch(doc, patch);
    expect(inv.op).toBe("removeNodePosition");
  });

  test("setNodePosition inverse restores prior value", () => {
    const doc1 = applyPatch(baseDoc(), {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "a",
      x: 5,
      y: 6,
    });
    const patch2 = {
      op: "setNodePosition" as const,
      workflow: "wf",
      stateCode: "a",
      x: 99,
      y: 88,
    };
    const inv = invertPatch(doc1, patch2);
    expect(inv.op).toBe("setNodePosition");
    if (inv.op === "setNodePosition") {
      expect(inv.x).toBe(5);
      expect(inv.y).toBe(6);
    }
  });
});

describe("cleanupWorkflowUi on replaceSession", () => {
  test("stale layout entries for deleted states are removed", () => {
    // Set up: state 'a' has a position, then remove it via replaceSession.
    let doc = applyPatch(baseDoc(), {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "a",
      x: 1,
      y: 2,
    });
    // Simulate a JSON edit that removes state 'a'
    const sessionWithoutA = {
      ...doc.session,
      workflows: doc.session.workflows.map((wf) => ({
        ...wf,
        states: Object.fromEntries(
          Object.entries(wf.states).filter(([k]) => k !== "a"),
        ),
        initialState: "b",
      })),
    };
    doc = applyPatch(doc, { op: "replaceSession", session: sessionWithoutA });
    // Layout entry for 'a' should be cleaned up
    expect(doc.meta.workflowUi["wf"]?.layout?.nodes?.["a"]).toBeUndefined();
  });

  test("comment attached to deleted state is detached (not deleted)", () => {
    let doc = applyPatch(baseDoc(), {
      op: "addComment",
      workflow: "wf",
      comment: { id: "c1", text: "note", x: 0, y: 0, attachedTo: { kind: "state", stateCode: "a" } },
    });
    // Remove state 'a' via replaceSession
    const sessionWithoutA = {
      ...doc.session,
      workflows: doc.session.workflows.map((wf) => ({
        ...wf,
        states: Object.fromEntries(
          Object.entries(wf.states).filter(([k]) => k !== "a"),
        ),
        initialState: "b",
      })),
    };
    doc = applyPatch(doc, { op: "replaceSession", session: sessionWithoutA });
    // Comment should still exist but be detached
    const comment = doc.meta.workflowUi["wf"]?.comments?.["c1"];
    expect(comment).toBeDefined();
    expect(comment?.attachedTo?.kind).toBe("free");
  });
});
