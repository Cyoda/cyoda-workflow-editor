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
          data-testid="select-processor-uniqueA"
          onClick={() => latestCanvasProps?.onSelectionChange({
            kind: "processor",
            processorUuid: uniqueAProcessorUuid(),
          })}
        >
          select uniqueA
        </button>
      </div>
    );
  },
}));

function makeDocument(): WorkflowEditorDocument {
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
                    { type: "externalized", name: "shared", executionMode: "ASYNC_NEW_TX" },
                    { type: "externalized", name: "uniqueA", executionMode: "ASYNC_NEW_TX" },
                  ],
                },
                {
                  name: "finish",
                  next: "done",
                  manual: false,
                  disabled: false,
                  processors: [
                    { type: "externalized", name: "shared", executionMode: "ASYNC_NEW_TX" },
                    { type: "externalized", name: "onlyOnFinish", executionMode: "ASYNC_NEW_TX" },
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
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

// "start" has two transitions ("go", "finish"); ids are assigned in array
// order, so the first match for ("wf", "start") is "go".
function goTransitionUuid(): string {
  if (!currentDoc) throw new Error("No current document");
  const entry = Object.entries(currentDoc.meta.ids.transitions).find(
    ([, ptr]) => ptr.workflow === "wf" && ptr.state === "start",
  );
  if (!entry) throw new Error("Missing transition id for go");
  return entry[0];
}

// "go" has processors ["shared", "uniqueA"]; ids are assigned in array
// order, so the second match for go's transitionUuid is "uniqueA".
function uniqueAProcessorUuid(): string {
  if (!currentDoc) throw new Error("No current document");
  const goUuid = goTransitionUuid();
  const entries = Object.entries(currentDoc.meta.ids.processors).filter(
    ([, ptr]) => ptr.transitionUuid === goUuid,
  );
  if (entries.length < 2) throw new Error("Missing processor id for uniqueA");
  return entries[1]![0];
}

afterEach(() => {
  latestCanvasProps = undefined;
  currentDoc = undefined;
  cleanup();
});

describe("processor name uniqueness scope", () => {
  it("allows renaming a processor to a name only used on another transition", () => {
    currentDoc = makeDocument();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-processor-uniqueA"));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const nameInput = screen.getByTestId("processor-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("uniqueA");

    // "onlyOnFinish" exists on the sibling "finish" transition, but not on "go".
    fireEvent.change(nameInput, { target: { value: "onlyOnFinish" } });

    expect(screen.queryByTestId("processor-modal-error")).toBeNull();
    expect((screen.getByTestId("processor-modal-apply") as HTMLButtonElement).disabled).toBe(false);
  });
});
