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
          data-testid="select-state-new"
          onClick={() => latestCanvasProps?.onSelectionChange(stateSelection("wf", "new"))}
        >
          select state new
        </button>
        <button
          type="button"
          data-testid="select-state-active"
          onClick={() => latestCanvasProps?.onSelectionChange(stateSelection("wf", "active"))}
        >
          select state active
        </button>
        <button
          type="button"
          data-testid="select-transition-new"
          onClick={() => latestCanvasProps?.onSelectionChange({
            kind: "transition",
            transitionUuid: transitionId("wf", "new"),
          })}
        >
          select transition new
        </button>
        <button
          type="button"
          data-testid="select-transition-active"
          onClick={() => latestCanvasProps?.onSelectionChange({
            kind: "transition",
            transitionUuid: transitionId("wf", "active"),
          })}
        >
          select transition active
        </button>
        <button
          type="button"
          data-testid="clear-selection"
          onClick={() => latestCanvasProps?.onSelectionChange(null)}
        >
          clear selection
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
          initialState: "new",
          active: true,
          states: {
            new: {
              transitions: [{ name: "to_active", next: "active", manual: false, disabled: false }],
            },
            active: {
              transitions: [{ name: "to_approved", next: "approved", manual: true, disabled: false }],
            },
            approved: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture failed");
  return result.document;
}

function stateSelection(workflow: string, stateCode: string) {
  if (!currentDoc) throw new Error("No current document");
  const entry = Object.entries(currentDoc.meta.ids.states).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`Missing state id for ${workflow}:${stateCode}`);
  return {
    kind: "state" as const,
    workflow,
    stateCode,
    nodeId: entry[0],
  };
}

function transitionId(workflow: string, stateCode: string): string {
  if (!currentDoc) throw new Error("No current document");
  const entry = Object.entries(currentDoc.meta.ids.transitions).find(
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

describe("inspector selection sync", () => {
  it("starts with the inspector hidden and shows the canvas hint", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    expect(screen.queryByTestId("inspector")).toBeNull();
    expect(screen.getByTestId("workflow-canvas-selection-hint").textContent).toContain(
      "Select a state or transition to edit it.",
    );
  });

  it("updates the state name field when switching between states", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-state-new"));
    expect((screen.getByTestId("inspector-state-name") as HTMLInputElement).value).toBe("new");

    fireEvent.click(screen.getByTestId("select-state-active"));
    expect((screen.getByTestId("inspector-state-name") as HTMLInputElement).value).toBe("active");
  });

  it("updates the transition name field when switching between transitions", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-transition-new"));
    expect((screen.getByTestId("inspector-transition-name") as HTMLInputElement).value).toBe("to_active");

    fireEvent.click(screen.getByTestId("select-transition-active"));
    expect((screen.getByTestId("inspector-transition-name") as HTMLInputElement).value).toBe("to_approved");
  });

  it("hides the inspector again when selection is cleared", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-state-new"));
    expect(screen.getByTestId("inspector-state-name")).toBeTruthy();

    fireEvent.click(screen.getByTestId("clear-selection"));
    expect(screen.queryByTestId("inspector")).toBeNull();
    expect(screen.getByTestId("workflow-canvas-selection-hint")).toBeTruthy();
  });

  it("clears selection when the inspector close button is clicked", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-transition-new"));
    expect(screen.getByTestId("inspector-transition-name")).toBeTruthy();

    fireEvent.click(screen.getByTestId("inspector-close"));
    expect(screen.queryByTestId("inspector")).toBeNull();
    expect(screen.getByTestId("workflow-canvas-selection-hint")).toBeTruthy();
  });

  it("keeps the canvas mounted while toggling the inspector", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);
    const canvas = screen.getByTestId("mock-canvas");

    fireEvent.click(screen.getByTestId("select-state-new"));
    expect(screen.getByTestId("mock-canvas")).toBe(canvas);

    fireEvent.click(screen.getByTestId("clear-selection"));
    expect(screen.getByTestId("mock-canvas")).toBe(canvas);
  });

  it("keeps the transition inspector open when opening the add processor modal", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-transition-new"));
    fireEvent.click(screen.getByTestId("inspector-add-processor"));

    expect((screen.getByTestId("inspector-transition-name") as HTMLInputElement).value).toBe(
      "to_active",
    );
    expect(screen.getByTestId("processor-editor-modal")).toBeTruthy();
    expect((screen.getByTestId("processor-name-input") as HTMLInputElement).value).toBe("");
  });
});
