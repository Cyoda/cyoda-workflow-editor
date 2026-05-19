import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseImportPayload, type WorkflowEditorDocument } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";
import type { CanvasProps } from "../src/components/Canvas.js";

let latestCanvasProps: CanvasProps | undefined;

vi.mock("../src/components/Canvas.js", () => ({
  Canvas: (props: CanvasProps) => {
    latestCanvasProps = props;
    return (
      <div data-testid="mock-canvas">
        <button
          type="button"
          data-testid="select-start"
          onClick={() => {
            const entry = Object.entries(props.graph.nodes).find(
              ([, n]) => n.kind === "state" && n.stateCode === "start",
            );
            if (entry) {
              const node = entry[1];
              if (node.kind === "state") {
                latestCanvasProps?.onSelectionChange({
                  kind: "state",
                  workflow: node.workflow,
                  stateCode: node.stateCode,
                  nodeId: node.id,
                });
              }
            }
          }}
        >
          select start
        </button>
      </div>
    );
  },
}));

function fixture(): WorkflowEditorDocument {
  const result = parseImportPayload(
    JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "minimal",
          initialState: "start",
          active: true,
          states: {
            start: {
              transitions: [
                { name: "go", next: "end", manual: false, disabled: false },
              ],
            },
            end: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

afterEach(() => cleanup());

describe("developerMode prop", () => {
  it("hides the inspector JSON tab by default", () => {
    render(<WorkflowEditor document={fixture()} />);
    fireEvent.click(screen.getByTestId("select-start"));
    expect(screen.getByTestId("inspector")).toBeTruthy();
    expect(screen.queryByTestId("inspector-tab-json")).toBeNull();
    expect(screen.queryByTestId("inspector-tab-properties")).toBeNull();
  });

  it("shows the inspector JSON tab when developerMode is true", () => {
    render(<WorkflowEditor document={fixture()} developerMode />);
    fireEvent.click(screen.getByTestId("select-start"));
    expect(screen.getByTestId("inspector-tab-properties")).toBeTruthy();
    expect(screen.getByTestId("inspector-tab-json")).toBeTruthy();
  });

  it("switches to JSON view when JSON tab is clicked in developerMode", () => {
    render(<WorkflowEditor document={fixture()} developerMode />);
    fireEvent.click(screen.getByTestId("select-start"));
    fireEvent.click(screen.getByTestId("inspector-tab-json"));
    expect(screen.getByTestId("inspector-json")).toBeTruthy();
  });
});
