import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { parseImportPayload, type WorkflowEditorDocument } from "@cyoda/workflow-core";
import { useEditorStore } from "../src/state/store.js";

function makeDoc(json: string): WorkflowEditorDocument {
  const result = parseImportPayload(json);
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

function stateId(doc: WorkflowEditorDocument, workflow: string, state: string): string {
  const entry = Object.entries(doc.meta.ids.states).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === state,
  );
  if (!entry) throw new Error(`No state id for ${workflow}:${state}`);
  return entry[0];
}

const TWO_STATE = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "A",
      active: true,
      states: {
        A: { transitions: [] },
        B: { transitions: [] },
      },
    },
  ],
});

describe("useEditorStore dispatchTransaction", () => {
  it("preserves the current selection when the transaction omits selectionAfter", () => {
    const doc = makeDoc(TWO_STATE);
    const idA = stateId(doc, "wf", "A");

    const { result } = renderHook(() => useEditorStore(doc));

    act(() => {
      result.current[1].setSelection({ kind: "state", workflow: "wf", stateCode: "A", nodeId: idA });
    });

    act(() => {
      result.current[1].dispatchTransaction({
        patches: [{ op: "setNodePosition", workflow: "wf", stateCode: "A", x: 100, y: 200 }],
        inverses: [{ op: "removeNodePosition", workflow: "wf", stateCode: "A" }],
        summary: "Move state",
      });
    });

    expect(result.current[0].selection).toEqual({
      kind: "state",
      workflow: "wf",
      stateCode: "A",
      nodeId: idA,
    });
  });
});

const TRANSITION_WITH_TWO_PROCESSORS = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: {
          transitions: [
            {
              name: "go",
              next: "done",
              manual: false,
              disabled: false,
              processors: [
                { type: "externalized", name: "first", executionMode: "SYNC" },
                { type: "externalized", name: "second", executionMode: "SYNC" },
              ],
            },
          ],
        },
        done: { transitions: [] },
      },
    },
  ],
});

describe("useEditorStore dispatch/undo for addProcessor", () => {
  it("undo removes the newly inserted processor, not a sibling, when inserted at index 0", () => {
    const doc = makeDoc(TRANSITION_WITH_TWO_PROCESSORS);
    const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;

    const { result } = renderHook(() => useEditorStore(doc));

    act(() => {
      result.current[1].dispatch({
        op: "addProcessor",
        transitionUuid,
        index: 0,
        processor: { type: "externalized", name: "new", executionMode: "SYNC" },
      });
    });

    act(() => {
      result.current[1].undo();
    });

    const transition = result.current[0].document.session.workflows[0]!.states.start!.transitions[0]!;
    expect(transition.processors?.map((p) => p.name)).toEqual(["first", "second"]);
  });
});
