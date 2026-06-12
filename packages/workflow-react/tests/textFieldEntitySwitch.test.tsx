import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
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
          data-testid="select-transition-start"
          onClick={() => latestCanvasProps?.onSelectionChange({
            kind: "transition",
            transitionUuid: transitionId("start"),
          })}
        >
          select transition start
        </button>
        <button
          type="button"
          data-testid="select-transition-middle"
          onClick={() => latestCanvasProps?.onSelectionChange({
            kind: "transition",
            transitionUuid: transitionId("middle"),
          })}
        >
          select transition middle
        </button>
      </div>
    );
  },
}));

function fixtureDoc(): WorkflowEditorDocument {
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
              transitions: [{ name: "advance", next: "middle", manual: false, disabled: false }],
            },
            middle: {
              transitions: [{ name: "advance", next: "end", manual: false, disabled: false }],
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

function transitionId(stateCode: string): string {
  if (!currentDoc) throw new Error("No current document");
  const entry = Object.entries(currentDoc.meta.ids.transitions).find(
    ([, ptr]) => ptr.workflow === "wf" && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`Missing transition id for ${stateCode}`);
  return entry[0];
}

afterEach(() => {
  latestCanvasProps = undefined;
  currentDoc = undefined;
  cleanup();
});

describe("TextField stale draft on entity switch", () => {
  it("discards an uncommitted draft when switching to a different transition with the same name", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-transition-start"));
    const nameInput = screen.getByTestId("inspector-transition-name") as HTMLInputElement;
    expect(nameInput.value).toBe("advance");

    // Type a new name but do not blur/commit it.
    fireEvent.change(nameInput, { target: { value: "renamed" } });

    // Switch selection to the other transition, which happens to have the same name.
    fireEvent.click(screen.getByTestId("select-transition-middle"));

    const nameInputAfter = screen.getByTestId("inspector-transition-name") as HTMLInputElement;
    expect(nameInputAfter.value).toBe("advance");

    // Blurring now must not commit the stale "renamed" draft to the newly selected transition.
    fireEvent.blur(nameInputAfter);
    expect((screen.getByTestId("inspector-transition-name") as HTMLInputElement).value).toBe("advance");

    // The originally edited transition must also remain unchanged.
    fireEvent.click(screen.getByTestId("select-transition-start"));
    expect((screen.getByTestId("inspector-transition-name") as HTMLInputElement).value).toBe("advance");
  });
});
