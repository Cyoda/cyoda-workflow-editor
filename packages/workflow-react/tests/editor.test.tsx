import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";

function fixture(json: string): WorkflowEditorDocument {
  const result = parseImportPayload(json);
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

const MINIMAL = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "minimal",
      initialState: "start",
      active: true,
      states: {
        start: { transitions: [{ name: "go", next: "end", manual: false, disabled: false }] },
        end: { transitions: [] },
      },
    },
  ],
});

const MULTI = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "alpha",
      initialState: "s1",
      active: true,
      states: { s1: { transitions: [] } },
    },
    {
      version: "1.0",
      name: "beta",
      initialState: "s1",
      active: true,
      states: { s1: { transitions: [] } },
    },
  ],
});

afterEach(() => cleanup());

describe("WorkflowEditor", () => {
  it("renders toolbar + canvas in editor mode", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} />);
    expect(screen.getByTestId("workflow-editor")).toBeTruthy();
    expect(screen.getByTestId("toolbar")).toBeTruthy();
    expect(screen.getByTestId("canvas-undo")).toBeTruthy();
    expect(screen.getByTestId("canvas-redo")).toBeTruthy();
  });

  it("hides tabs for single-workflow viewer mode", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} mode="viewer" />);
    expect(screen.queryByTestId("workflow-tabs")).toBeNull();
  });

  it("shows tabs when multiple workflows present", () => {
    render(<WorkflowEditor document={fixture(MULTI)} />);
    expect(screen.getByTestId("workflow-tabs")).toBeTruthy();
    expect(screen.getByTestId("tab-alpha")).toBeTruthy();
    expect(screen.getByTestId("tab-beta")).toBeTruthy();
  });

  it("disables undo/redo initially (empty stacks)", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} />);
    const undo = screen.getByTestId("canvas-undo") as HTMLButtonElement;
    const redo = screen.getByTestId("canvas-redo") as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
  });

  it("renders save button when onSave provided", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} onSave={() => {}} />);
    expect(screen.getByTestId("toolbar-save")).toBeTruthy();
  });

  it("does not render save button without onSave", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} />);
    expect(screen.queryByTestId("toolbar-save")).toBeNull();
  });

  it("surface dev-console keeps standard editor controls", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} surface="dev-console" layout="fullWidth" />);
    const editor = screen.getByTestId("workflow-editor");
    expect(editor.getAttribute("data-surface")).toBe("dev-console");
    expect(editor.getAttribute("data-layout")).toBe("fullWidth");
    expect(screen.getByTestId("toolbar")).toBeTruthy();
    expect(screen.getByTestId("canvas-undo")).toBeTruthy();
    expect(screen.getByTestId("canvas-redo")).toBeTruthy();
    expect(screen.getByTestId("canvas-add-state")).toBeTruthy();
  });

  it("renders toolbar slots without hiding editor controls", () => {
    render(
      <WorkflowEditor
        document={fixture(MINIMAL)}
        onSave={() => {}}
        toolbarStart={<button type="button">Open workflow file</button>}
        toolbarCenter={<span>workflow.json</span>}
        toolbarEnd={<button type="button">Reload from disk</button>}
      />,
    );

    expect(screen.getByText("Open workflow file")).toBeTruthy();
    expect(screen.getByText("workflow.json")).toBeTruthy();
    expect(screen.getByText("Reload from disk")).toBeTruthy();
    expect(screen.getByTestId("toolbar-save")).toBeTruthy();
    expect(screen.getByTestId("toolbar-errors")).toBeTruthy();
    expect(screen.getByTestId("canvas-add-state")).toBeTruthy();
  });
});

describe("WorkflowEditor chrome suppression", () => {
  it("hides toolbar when chrome.toolbar is false", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} chrome={{ toolbar: false }} />);
    expect(screen.queryByTestId("toolbar")).toBeNull();
  });

  it("hides inspector when chrome.inspector is false", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} chrome={{ inspector: false }} />);
    expect(screen.queryByTestId("inspector")).toBeNull();
  });

  it("hides tabs when chrome.tabs is false", () => {
    render(<WorkflowEditor document={fixture(MULTI)} chrome={{ tabs: false }} />);
    expect(screen.queryByTestId("workflow-tabs")).toBeNull();
  });

  it("shows default toolbar chrome and canvas add-state button", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} />);
    expect(screen.getByTestId("toolbar")).toBeTruthy();
    expect(screen.queryByTestId("inspector")).toBeNull();
    expect(screen.getByTestId("canvas-add-state")).toBeTruthy();
  });
});
