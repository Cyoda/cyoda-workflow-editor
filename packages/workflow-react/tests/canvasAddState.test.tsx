import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseImportPayload, type WorkflowEditorDocument } from "@cyoda/workflow-core";
import { estimateNodeSize } from "@cyoda/workflow-layout";
import { WorkflowEditor } from "../src/index.js";
import type { CanvasProps } from "../src/components/Canvas.js";

let latestCanvasProps: CanvasProps | undefined;

vi.mock("../src/components/Canvas.js", () => ({
  Canvas: (props: CanvasProps) => {
    latestCanvasProps = props;
    return (
      <button
        type="button"
        data-testid="mock-canvas-double-click"
        onClick={() => props.onPaneDoubleClick?.(240, 160)}
      >
        canvas double click
      </button>
    );
  },
}));

function doc(states: string[], initialState = states[0]!): WorkflowEditorDocument {
  const stateMap: Record<string, { transitions: unknown[] }> = {};
  for (const s of states) stateMap[s] = { transitions: [] };
  const result = parseImportPayload(
    JSON.stringify({
      importMode: "MERGE",
      workflows: [{ version: "1.0", name: "wf", initialState, active: true, states: stateMap }],
    }),
  );
  if (!result.document) throw new Error("fixture failed");
  return result.document;
}

afterEach(() => {
  latestCanvasProps = undefined;
  cleanup();
});

describe("canvas add-state flow", () => {
  it("creates a new pinned state from a canvas double-click location", () => {
    let latestDoc: WorkflowEditorDocument | undefined;
    render(
      <WorkflowEditor
        document={doc(["start", "end"])}
        mode="editor"
        localStorageKey={null}
        onChange={(next) => {
          latestDoc = next;
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("mock-canvas-double-click"));

    const input = screen.getByTestId("add-state-name-input") as HTMLInputElement;
    expect(input.value).toBe("state1");

    fireEvent.click(screen.getByTestId("add-state-confirm"));

    expect(latestDoc?.session.workflows[0]?.states.state1).toEqual({ transitions: [] });
    const size = estimateNodeSize("state1");
    expect(latestDoc?.meta.workflowUi.wf?.layout?.nodes?.state1).toEqual({
      x: Math.round((240 - size.width / 2) / 16) * 16,
      y: Math.round((160 - size.height / 2) / 16) * 16,
      pinned: true,
    });
  });
});