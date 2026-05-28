import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { applyPatch, type WorkflowEditorDocument } from "@cyoda/workflow-core";
import { LocalFileEditorPage } from "../src/pages/LocalFileEditorPage.js";
import type { LocalWorkflowFileHandle } from "../src/lib/localWorkflowFiles.js";

const mockFileApi = vi.hoisted(() => ({
  supportsFileSystemAccess: vi.fn(),
  openWorkflowFile: vi.fn(),
  pickSaveWorkflowFile: vi.fn(),
  readWorkflowFileHandle: vi.fn(),
  saveWorkflowFile: vi.fn(),
  downloadWorkflowJson: vi.fn(),
}));

const editorState = vi.hoisted(() => ({
  mutate: null as null | (() => void),
}));

vi.mock("@cyoda/workflow-react", () => ({
  WorkflowEditor: ({
    document,
    onChange,
    toolbarStart,
    toolbarCenter,
    toolbarEnd,
  }: {
    document: WorkflowEditorDocument;
    onChange?: (doc: WorkflowEditorDocument) => void;
    toolbarStart?: ReactNode;
    toolbarCenter?: ReactNode;
    toolbarEnd?: ReactNode;
  }) => {
    editorState.mutate = () => {
      const workflow = document.session.workflows[0];
      const renamed = applyPatch(document, {
        op: "renameWorkflow",
        from: workflow.name,
        to: `${workflow.name}-edited`,
      });
      onChange?.(
        applyPatch(renamed, {
          op: "setNodePosition",
          workflow: `${workflow.name}-edited`,
          stateCode: workflow.initialState,
          x: 240,
          y: 180,
          pinned: true,
        }),
      );
    };

    return (
      <div data-testid="mock-workflow-editor">
        <div data-testid="mock-editor-toolbar">
          {toolbarStart}
          <button type="button" data-testid="mock-editor-add-state">Add State</button>
          {toolbarCenter}
          {toolbarEnd}
        </div>
        <p data-testid="mock-workflow-name">{document.session.workflows[0]?.name}</p>
        <button type="button" data-testid="mock-editor-mutate" onClick={() => editorState.mutate?.()}>
          mutate
        </button>
      </div>
    );
  },
}));

vi.mock("../src/lib/monacoRuntime.js", () => ({
  getMonacoRuntime: () => ({ editor: true }),
}));

vi.mock("../src/lib/localWorkflowFiles.js", () => mockFileApi);

function makeWorkflowText(name = "Local workflow"): string {
  return JSON.stringify(
    {
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name,
          initialState: "start",
          active: true,
          states: {
            start: {
              transitions: [{ name: "go", next: "end", manual: false, disabled: false }],
            },
            end: {
              transitions: [],
            },
          },
        },
      ],
    },
    null,
    2,
  );
}

function makeWorkflowTextWithImplicitTerminalStates(name = "Local workflow"): string {
  return JSON.stringify(
    {
      importMode: "REPLACE",
      workflows: [
        {
          version: "1.0",
          name,
          initialState: "start",
          active: true,
          states: {
            start: {
              transitions: [{ name: "finish", next: "done", manual: false, disabled: false }],
            },
            done: {},
          },
        },
      ],
    },
    null,
    2,
  );
}

function makeHandle(name = "workflow.json"): LocalWorkflowFileHandle {
  return {
    kind: "file",
    name,
    async getFile() {
      return new File([makeWorkflowText()], name, { type: "application/json" });
    },
    async createWritable() {
      throw new Error("not implemented in test handle");
    },
  };
}

describe("LocalFileEditorPage", () => {
  beforeEach(() => {
    mockFileApi.supportsFileSystemAccess.mockReturnValue(true);
    mockFileApi.openWorkflowFile.mockResolvedValue(null);
    mockFileApi.pickSaveWorkflowFile.mockResolvedValue(null);
    mockFileApi.readWorkflowFileHandle.mockResolvedValue(null);
    mockFileApi.saveWorkflowFile.mockResolvedValue(undefined);
    mockFileApi.downloadWorkflowJson.mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    editorState.mutate = null;
  });

  it("renders the empty state before a file is opened", () => {
    render(<LocalFileEditorPage />);

    expect(screen.getByText("Open a workflow JSON file")).toBeTruthy();
    expect(
      screen.getByText("Choose a Cyoda workflow import JSON file from your local drive."),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Open workflow file" })).toHaveLength(2);
  });

  it("loads a parsed workflow file into the editor", async () => {
    mockFileApi.openWorkflowFile.mockResolvedValue({
      name: "alpha.json",
      text: makeWorkflowText("Alpha"),
      handle: makeHandle("alpha.json"),
    });

    render(<LocalFileEditorPage />);
    fireEvent.click(screen.getByTestId("local-file-editor-open-toolbar"));

    await waitFor(() => expect(screen.getByTestId("mock-workflow-editor")).toBeTruthy());
    expect(screen.getByText("alpha.json")).toBeTruthy();
    expect(screen.getByTestId("mock-editor-add-state")).toBeTruthy();
    expect(screen.getByTestId("local-file-editor-save")).toBeTruthy();
    expect(screen.getByTestId("mock-workflow-name").textContent).toBe("Alpha");
  });

  it("loads workflow files whose terminal states omit transitions arrays", async () => {
    mockFileApi.openWorkflowFile.mockResolvedValue({
      name: "implicit-terminals.json",
      text: makeWorkflowTextWithImplicitTerminalStates("ImplicitTerminals"),
      handle: makeHandle("implicit-terminals.json"),
    });

    render(<LocalFileEditorPage />);
    fireEvent.click(screen.getByTestId("local-file-editor-open-toolbar"));

    await waitFor(() => expect(screen.getByTestId("mock-workflow-editor")).toBeTruthy());
    expect(screen.getByTestId("mock-workflow-name").textContent).toBe("ImplicitTerminals");
  });

  it("shows a parse error and keeps the previous valid document loaded", async () => {
    mockFileApi.openWorkflowFile
      .mockResolvedValueOnce({
        name: "alpha.json",
        text: makeWorkflowText("Alpha"),
        handle: makeHandle("alpha.json"),
      })
      .mockResolvedValueOnce({
        name: "broken.json",
        text: "{ bad json",
        handle: makeHandle("broken.json"),
      });

    render(<LocalFileEditorPage />);
    fireEvent.click(screen.getByTestId("local-file-editor-open-toolbar"));
    await waitFor(() => expect(screen.getByTestId("mock-workflow-name").textContent).toBe("Alpha"));

    fireEvent.click(screen.getByTestId("local-file-editor-open-toolbar"));

    await waitFor(() =>
      expect(screen.getByText(/Unable to open workflow file/i)).toBeTruthy(),
    );
    expect(screen.getByTestId("mock-workflow-name").textContent).toBe("Alpha");
  });

  it("marks the document dirty when the editor emits a changed workflow", async () => {
    mockFileApi.openWorkflowFile.mockResolvedValue({
      name: "alpha.json",
      text: makeWorkflowText("Alpha"),
      handle: makeHandle("alpha.json"),
    });

    render(<LocalFileEditorPage />);
    fireEvent.click(screen.getByTestId("local-file-editor-open-toolbar"));
    await waitFor(() => expect(screen.getByTestId("mock-workflow-editor")).toBeTruthy());

    fireEvent.click(screen.getByTestId("mock-editor-mutate"));

    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("shows overwrite confirmation before saving and does not write when canceled", async () => {
    mockFileApi.openWorkflowFile.mockResolvedValue({
      name: "alpha.json",
      text: makeWorkflowText("Alpha"),
      handle: makeHandle("alpha.json"),
    });

    render(<LocalFileEditorPage />);
    fireEvent.click(screen.getByTestId("local-file-editor-open-toolbar"));
    await waitFor(() => expect(screen.getByTestId("mock-workflow-editor")).toBeTruthy());
    fireEvent.click(screen.getByTestId("mock-editor-mutate"));

    fireEvent.click(screen.getByTestId("local-file-editor-save"));
    

    expect(screen.getByText("Overwrite local file?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockFileApi.saveWorkflowFile).not.toHaveBeenCalled();
  });

  it("writes clean serialized JSON after overwrite confirmation", async () => {
    const handle = makeHandle("alpha.json");
    mockFileApi.openWorkflowFile.mockResolvedValue({
      name: "alpha.json",
      text: makeWorkflowText("Alpha"),
      handle,
    });

    render(<LocalFileEditorPage />);
    fireEvent.click(screen.getByTestId("local-file-editor-open-toolbar"));
    await waitFor(() => expect(screen.getByTestId("mock-workflow-editor")).toBeTruthy());
    fireEvent.click(screen.getByTestId("mock-editor-mutate"));
    fireEvent.click(screen.getByTestId("local-file-editor-save"));
    fireEvent.click(screen.getByRole("button", { name: "Overwrite file" }));

    await waitFor(() => expect(mockFileApi.saveWorkflowFile).toHaveBeenCalledTimes(1));
    const [savedHandle, contents] = mockFileApi.saveWorkflowFile.mock.calls[0] as [
      LocalWorkflowFileHandle,
      string,
    ];

    expect(savedHandle).toBe(handle);
    expect(contents).toContain("\"Alpha-edited\"");
    expect(contents).not.toContain("workflowUi");
    expect(screen.getByText("Saved to alpha.json")).toBeTruthy();
  });

  it("shows fallback download mode when File System Access API is unavailable", async () => {
    mockFileApi.supportsFileSystemAccess.mockReturnValue(false);
    mockFileApi.openWorkflowFile.mockResolvedValue({
      name: "fallback.json",
      text: makeWorkflowText("Fallback"),
      handle: null,
    });

    render(<LocalFileEditorPage />);

    expect(
      screen.getByText(
        "Direct save back to disk is only available in browsers that support the File System Access API. In this browser, use Download instead.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("local-file-editor-open-toolbar"));
    await waitFor(() => expect(screen.getByTestId("mock-workflow-editor")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
  });
});
