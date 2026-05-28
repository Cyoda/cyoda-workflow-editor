import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseImportPayload, type WorkflowEditorDocument } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";
import type { CanvasProps } from "../src/components/Canvas.js";

let latestCanvasProps: CanvasProps | undefined;
let currentDoc: WorkflowEditorDocument | undefined;

vi.mock("../src/components/Canvas.js", () => ({
  Canvas: (props: CanvasProps) => {
    latestCanvasProps = props;
    return (
      <div data-testid="mock-canvas">
        <button
          type="button"
          data-testid="select-transition"
          onClick={() =>
            latestCanvasProps?.onSelectionChange({
              kind: "transition",
              transitionUuid: transitionId(),
            })
          }
        >
          select transition
        </button>
        {props.onUndo && (
          <button
            type="button"
            data-testid="canvas-undo"
            disabled={!props.canUndo}
            onClick={() => props.onUndo?.()}
          >
            Undo
          </button>
        )}
      </div>
    );
  },
}));

function transitionId(): string {
  if (!currentDoc) throw new Error("missing document");
  return Object.keys(currentDoc.meta.ids.transitions)[0]!;
}

function documentWithProcessors(): WorkflowEditorDocument {
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
              transitions: [
                {
                  name: "go",
                  next: "done",
                  manual: false,
                  disabled: false,
                  processors: [
                    {
                      type: "externalized",
                      name: "notify",
                      executionMode: "SYNC",
                      config: { calculationNodesTags: "alpha" },
                    },
                  ],
                },
              ],
            },
            done: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture failed");
  return result.document;
}

afterEach(() => {
  latestCanvasProps = undefined;
  currentDoc = undefined;
  cleanup();
});

describe("processor undo", () => {
  it("undo reverts an added processor", () => {
    currentDoc = documentWithProcessors();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-transition"));
    fireEvent.click(screen.getByTestId("inspector-add-processor"));
    fireEvent.change(screen.getByTestId("processor-name-input"), {
      target: { value: "schedule-finish" },
    });
    fireEvent.change(screen.getByTestId("processor-type-select"), {
      target: { value: "scheduled" },
    });
    fireEvent.change(screen.getByTestId("processor-scheduled-delay-amount"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByTestId("processor-scheduled-transition"), {
      target: { value: "go" },
    });
    fireEvent.click(screen.getByTestId("processor-modal-apply"));

    expect(screen.getByText("schedule-finish")).toBeTruthy();

    fireEvent.click(screen.getByTestId("canvas-undo"));
    expect(screen.queryByText("schedule-finish")).toBeNull();
  });

  it("undo reverts an edited processor", () => {
    currentDoc = documentWithProcessors();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-transition"));
    fireEvent.click(screen.getByTestId("processor-edit-0"));
    fireEvent.change(screen.getByTestId("processor-name-input"), {
      target: { value: "notify-updated" },
    });
    fireEvent.click(screen.getByTestId("processor-modal-apply"));

    expect(screen.getByText("notify-updated")).toBeTruthy();

    fireEvent.click(screen.getByTestId("canvas-undo"));
    expect(screen.queryByText("notify-updated")).toBeNull();
    expect(screen.getByText("notify")).toBeTruthy();
  });
});
