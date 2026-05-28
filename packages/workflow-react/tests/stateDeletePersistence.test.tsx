import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseImportPayload, type WorkflowEditorDocument } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";
import type { CanvasProps } from "../src/components/Canvas.js";

let latestCanvasProps: CanvasProps | undefined;
let lastDoc: WorkflowEditorDocument | undefined;

vi.mock("../src/components/Canvas.js", () => ({
  Canvas: (props: CanvasProps) => {
    latestCanvasProps = props;
    return (
      <div data-testid="mock-canvas">
        <button
          type="button"
          data-testid="select-archived"
          onClick={() => {
            const doc = currentDocument();
            latestCanvasProps?.onSelectionChange({
              kind: "state",
              workflow: "wf",
              stateCode: "archived",
              nodeId: stateId(doc, "wf", "archived"),
            });
          }}
        >
          select archived
        </button>
        <button
          type="button"
          data-testid="select-active"
          onClick={() => {
            const doc = currentDocument();
            latestCanvasProps?.onSelectionChange({
              kind: "state",
              workflow: "wf",
              stateCode: "active",
              nodeId: stateId(doc, "wf", "active"),
            });
          }}
        >
          select active
        </button>
      </div>
    );
  },
}));

function currentDocument(): WorkflowEditorDocument {
  if (!lastDoc) throw new Error("No current document");
  return lastDoc;
}

function lifecycleDoc(): WorkflowEditorDocument {
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
            approved: {
              transitions: [{ name: "to_archived", next: "archived", manual: false, disabled: false }],
            },
            archived: {
              transitions: [{ name: "reactivate", next: "active", manual: true, disabled: false }],
            },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture failed");
  return result.document;
}

function stateId(doc: WorkflowEditorDocument, workflow: string, stateCode: string): string {
  const entry = Object.entries(doc.meta.ids.states).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`Missing state id for ${workflow}:${stateCode}`);
  return entry[0];
}

afterEach(() => {
  latestCanvasProps = undefined;
  lastDoc = undefined;
  cleanup();
});

describe("state deletion persistence", () => {
  it("keeps the state deleted after another selection change", () => {
    const document = lifecycleDoc();
    lastDoc = document;

    render(
      <WorkflowEditor
        document={document}
        mode="editor"
        onChange={(doc) => {
          lastDoc = doc;
        }}
      />,
    );

    const archivedButton = screen.getByTestId("select-archived");
    fireEvent.click(archivedButton);
    fireEvent.keyDown(archivedButton, { key: "Backspace" });

    expect(screen.getByText("Delete state?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("modal-delete-confirm"));

    expect(lastDoc?.session.workflows[0]?.states.archived).toBeUndefined();
    expect(lastDoc?.session.workflows[0]?.states.approved?.transitions).toEqual([]);

    fireEvent.click(screen.getByTestId("select-active"));

    expect(screen.getByText("wf › active")).toBeTruthy();
    expect(lastDoc?.session.workflows[0]?.states.archived).toBeUndefined();
    expect(lastDoc?.session.workflows[0]?.states.approved?.transitions).toEqual([]);
  });
});
