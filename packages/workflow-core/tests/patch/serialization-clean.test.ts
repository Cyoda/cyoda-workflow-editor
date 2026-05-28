/**
 * Proves that layout positions, comments, and other editor metadata
 * are excluded from the serialized Cyoda workflow JSON.
 */
import { describe, expect, test } from "vitest";
import {
  applyPatch,
  parseImportPayload,
  serializeImportPayload,
} from "../../src/index.js";

function baseDoc() {
  const result = parseImportPayload(
    JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "start",
          active: true,
          states: {
            start: {
              transitions: [{ name: "go", next: "end", manual: false, disabled: false }],
            },
            end: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture failed");
  return result.document;
}

describe("serialization excludes editor metadata", () => {
  test("node positions do not appear in exported JSON", () => {
    const doc = applyPatch(baseDoc(), {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "start",
      x: 100,
      y: 200,
    });
    const serialized = serializeImportPayload(doc);
    expect(serialized).not.toContain("nodePositions");
    expect(serialized).not.toContain("layout");
    expect(serialized).not.toContain('"x"');
    expect(serialized).not.toContain('"y"');
  });

  test("comments do not appear in exported JSON", () => {
    const doc = applyPatch(baseDoc(), {
      op: "addComment",
      workflow: "wf",
      comment: { id: "c1", text: "hello", x: 50, y: 60 },
    });
    const serialized = serializeImportPayload(doc);
    expect(serialized).not.toContain("comments");
    expect(serialized).not.toContain("hello");
    expect(serialized).not.toContain("c1");
  });

  test("edge anchors do not appear in exported JSON", () => {
    const doc = baseDoc();
    const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const docWithAnchors = applyPatch(doc, {
      op: "setEdgeAnchors",
      transitionUuid,
      anchors: { source: "right", target: "left" },
    });
    const serialized = serializeImportPayload(docWithAnchors);
    expect(serialized).not.toContain("edgeAnchors");
    expect(serialized).not.toContain("workflowUi");
  });

  test("viewports do not appear in exported JSON", () => {
    const doc = baseDoc();
    doc.meta.workflowUi.wf = {
      viewports: {
        vertical: { x: 10, y: 20, zoom: 0.75 },
      },
    };
    const serialized = serializeImportPayload(doc);
    expect(serialized).not.toContain("viewports");
    expect(serialized).not.toContain('"zoom"');
    expect(serialized).not.toContain("workflowUi");
  });

  test("serialized JSON round-trips to same output after layout changes", () => {
    const doc = baseDoc();
    const docWithLayout = applyPatch(doc, {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "start",
      x: 999,
      y: 888,
    });
    const before = serializeImportPayload(doc);
    const after = serializeImportPayload(docWithLayout);
    expect(before).toBe(after);
  });

  test("workflow JSON only contains canonical fields after full edit cycle", () => {
    let doc = baseDoc();
    doc = applyPatch(doc, { op: "addState", workflow: "wf", stateCode: "middle" });
    doc = applyPatch(doc, {
      op: "setNodePosition",
      workflow: "wf",
      stateCode: "middle",
      x: 42,
      y: 42,
    });
    doc = applyPatch(doc, {
      op: "addComment",
      workflow: "wf",
      comment: { id: "cx", text: "note", x: 10, y: 10 },
    });
    const serialized = serializeImportPayload(doc);
    const parsed = JSON.parse(serialized);
    // Only canonical fields should be present at the top level
    expect(Object.keys(parsed)).toEqual(["importMode", "workflows"]);
    // State should exist
    const states = parsed.workflows[0].states;
    expect(states.middle).toBeDefined();
    // No layout or comment data anywhere in the output
    const str = JSON.stringify(parsed);
    expect(str).not.toContain("workflowUi");
    expect(str).not.toContain("layout");
    expect(str).not.toContain("comments");
    expect(str).not.toContain("pinned");
  });
});
