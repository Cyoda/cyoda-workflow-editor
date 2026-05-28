import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  applyPatch,
  invertPatch,
  parseImportPayload,
  serializeImportPayload,
  type DomainPatch,
} from "../../src/index.js";

function loadMinimalDoc() {
  const json = readFileSync(
    resolve(__dirname, "../golden/fixtures/minimal.json"),
    "utf8",
  );
  const { document } = parseImportPayload(json);
  if (!document) throw new Error("fixture failed to parse");
  return document;
}

describe("setEdgeAnchors patch (UI-only)", () => {
  test("apply writes anchors into meta.workflowUi without touching session", () => {
    const doc = loadMinimalDoc();
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const wf = doc.meta.ids.transitions[uuid]!.workflow;
    const before = serializeImportPayload(doc);

    const patched = applyPatch(doc, {
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: { source: "right", target: "left" },
    });

    expect(patched.meta.workflowUi[wf]?.edgeAnchors?.[uuid]).toEqual({
      source: "right",
      target: "left",
    });
    // Session is unchanged — exported JSON is byte-identical.
    expect(serializeImportPayload(patched)).toBe(before);
    // Revision still bumped for undo-stack uniformity.
    expect(patched.meta.revision).toBe(doc.meta.revision + 1);
  });

  test("null anchors clears a previously-set override", () => {
    const doc = loadMinimalDoc();
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const wf = doc.meta.ids.transitions[uuid]!.workflow;

    const set = applyPatch(doc, {
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: { source: "right" },
    });
    const cleared = applyPatch(set, {
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: null,
    });

    expect(cleared.meta.workflowUi[wf]?.edgeAnchors).toBeUndefined();
  });

  test("apply then inverse restores prior state (no prior override)", () => {
    const doc = loadMinimalDoc();
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const patch: DomainPatch = {
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: { source: "top", target: "bottom" },
    };

    const inverse = invertPatch(doc, patch);
    const after = applyPatch(doc, patch);
    const restored = applyPatch(after, inverse);

    const wf = doc.meta.ids.transitions[uuid]!.workflow;
    expect(restored.meta.workflowUi[wf]?.edgeAnchors).toBeUndefined();
    expect(serializeImportPayload(restored)).toBe(serializeImportPayload(doc));
  });

  test("apply then inverse restores prior override exactly", () => {
    const doc = loadMinimalDoc();
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const wf = doc.meta.ids.transitions[uuid]!.workflow;

    const seeded = applyPatch(doc, {
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: { source: "left" },
    });
    const patch: DomainPatch = {
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: { source: "right", target: "top" },
    };
    const inverse = invertPatch(seeded, patch);
    const after = applyPatch(seeded, patch);
    const restored = applyPatch(after, inverse);

    expect(restored.meta.workflowUi[wf]?.edgeAnchors?.[uuid]).toEqual({
      source: "left",
    });
  });

  test("unknown transition UUID is a no-op except for revision", () => {
    const doc = loadMinimalDoc();
    const before = serializeImportPayload(doc);
    const patched = applyPatch(doc, {
      op: "setEdgeAnchors",
      transitionUuid: "does-not-exist",
      anchors: { source: "top" },
    });
    expect(serializeImportPayload(patched)).toBe(before);
    expect(patched.meta.workflowUi).toEqual(doc.meta.workflowUi);
  });

  test("source moves preserve the moved transition UUID and anchor metadata", () => {
    const doc = loadMinimalDoc();
    const oldUuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const withAnchors = applyPatch(doc, {
      op: "setEdgeAnchors",
      transitionUuid: oldUuid,
      anchors: { source: "right", target: "left" },
    });

    const moved = applyPatch(withAnchors, {
      op: "moveTransitionSource",
      workflow: "minimal",
      fromState: "start",
      toState: "end",
      transitionName: "go",
    });

    expect(moved.meta.ids.transitions[oldUuid]).toMatchObject({
      workflow: "minimal",
      state: "end",
    });
    expect(moved.meta.workflowUi.minimal?.edgeAnchors?.[oldUuid]).toEqual({
      source: "right",
      target: "left",
    });
  });

  test("removing a transition drops stale anchor metadata", () => {
    const doc = loadMinimalDoc();
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const withAnchors = applyPatch(doc, {
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: { source: "right", target: "left" },
    });

    const removed = applyPatch(withAnchors, {
      op: "removeTransition",
      transitionUuid: uuid,
    });

    expect(removed.meta.ids.transitions[uuid]).toBeUndefined();
    expect(removed.meta.workflowUi.minimal?.edgeAnchors?.[uuid]).toBeUndefined();
  });
});
