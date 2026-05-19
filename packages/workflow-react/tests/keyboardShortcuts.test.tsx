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
          onClick={() => {
            if (!currentDoc) throw new Error("No current document");
            const transitionUuid = transitionId(currentDoc, "wf", "start");
            latestCanvasProps?.onSelectionChange({
              kind: "transition",
              transitionUuid,
            });
          }}
        >
          select transition
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
              transitions: [{ name: "to_active", next: "active", manual: false, disabled: false }],
            },
            active: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture failed");
  return result.document;
}

function transitionId(
  doc: WorkflowEditorDocument,
  workflow: string,
  stateCode: string,
): string {
  const entry = Object.entries(doc.meta.ids.transitions).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`Missing transition id for ${workflow}:${stateCode}`);
  return entry[0];
}

afterEach(() => {
  latestCanvasProps = undefined;
  currentDoc = undefined;
  cleanup();
});

describe("keyboard shortcuts", () => {
  it("does not open Add State when typing 'a' in the transition name input", () => {
    const document = fixtureDoc();
    currentDoc = document;
    render(<WorkflowEditor document={document} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-transition"));

    const nameInput = screen.getByTestId("inspector-transition-name");
    nameInput.focus();
    fireEvent.keyDown(nameInput, { key: "a", code: "KeyA" });

    expect(screen.queryByTestId("add-state-name-input")).toBeNull();
  });

  it("clears selection with Escape", () => {
    const document = fixtureDoc();
    currentDoc = document;
    render(<WorkflowEditor document={document} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-transition"));
    expect(screen.getByTestId("inspector-transition-name")).toBeTruthy();

    fireEvent.keyDown(screen.getByTestId("workflow-editor"), { key: "Escape", code: "Escape" });

    expect(screen.queryByTestId("inspector")).toBeNull();
    expect(screen.getByTestId("workflow-canvas-selection-hint")).toBeTruthy();
  });
});
