import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
            latestCanvasProps?.onSelectionChange({
              kind: "transition",
              transitionUuid: transitionId(currentDoc, "wf", "start"),
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
              transitions: [{ name: "to_end", next: "end", manual: false, disabled: false }],
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

function createMonacoHarness() {
  const markerState = new Map<string, unknown[]>();
  let lastModel: FakeModel | null = null;
  let lastEditor: FakeEditor | null = null;

  class FakeModel {
    uri: { toString(): string };
    private value: string;
    private listeners = new Set<() => void>();

    constructor(value: string, uri: { toString(): string }) {
      this.value = value;
      this.uri = uri;
    }

    getValue() {
      return this.value;
    }

    setValue(value: string) {
      this.value = value;
      this.listeners.forEach((listener) => listener());
    }

    getPositionAt(offset: number) {
      const clamped = Math.max(0, Math.min(offset, this.value.length));
      const lines = this.value.slice(0, clamped).split("\n");
      return {
        lineNumber: lines.length,
        column: (lines[lines.length - 1]?.length ?? 0) + 1,
      };
    }

    getOffsetAt(position: { lineNumber: number; column: number }) {
      const lines = this.value.split("\n");
      let offset = 0;
      for (let i = 0; i < position.lineNumber - 1; i += 1) {
        offset += (lines[i]?.length ?? 0) + 1;
      }
      return offset + Math.max(0, position.column - 1);
    }

    onDidChangeContent(listener: () => void) {
      this.listeners.add(listener);
      return {
        dispose: () => {
          this.listeners.delete(listener);
        },
      };
    }

    dispose() {
      this.listeners.clear();
    }
  }

  class FakeEditor {
    model: FakeModel | null;
    selectionCalls: Array<{
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    }> = [];
    private cursorListeners = new Set<
      (event: { position: { lineNumber: number; column: number } }) => void
    >();

    constructor(model: FakeModel | null) {
      this.model = model;
    }

    getModel() {
      return this.model;
    }

    setModel(model: FakeModel | null) {
      this.model = model;
    }

    setSelection(range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    }) {
      this.selectionCalls.push(range);
    }

    revealRangeInCenterIfOutsideViewport() {}

    onDidChangeCursorPosition(
      listener: (event: { position: { lineNumber: number; column: number } }) => void,
    ) {
      this.cursorListeners.add(listener);
      return {
        dispose: () => {
          this.cursorListeners.delete(listener);
        },
      };
    }

    layout() {}

    updateOptions() {}

    dispose() {
      this.cursorListeners.clear();
    }
  }

  const runtime = {
    Uri: {
      parse(value: string) {
        return { toString: () => value };
      },
    },
    editor: {
      createModel(value: string, _language?: string, uri?: { toString(): string }) {
        lastModel = new FakeModel(value, uri ?? { toString: () => "cyoda://workflow/test.json" });
        return lastModel;
      },
      create(_element: HTMLElement, options: Record<string, unknown>) {
        lastEditor = new FakeEditor((options.model as FakeModel | null | undefined) ?? null);
        return lastEditor;
      },
      setModelMarkers(model: { uri: { toString(): string } }, owner: string, markers: unknown[]) {
        markerState.set(`${owner}:${model.uri.toString()}`, markers);
      },
    },
    languages: {
      json: {
        jsonDefaults: {
          diagnosticsOptions: {},
          setDiagnosticsOptions(opts: Record<string, unknown>) {
            this.diagnosticsOptions = opts;
          },
        },
      },
    },
    MarkerSeverity: {
      Error: 8,
      Warning: 4,
      Info: 2,
      Hint: 1,
    },
  };

  return {
    runtime,
    getLastModel: () => lastModel,
    getLastEditor: () => lastEditor,
    getMarkers: () => markerState,
  };
}

afterEach(() => {
  latestCanvasProps = undefined;
  currentDoc = undefined;
  cleanup();
});

describe("WorkflowEditor JSON integration", () => {
  it("applies valid JSON edits back into the canonical document", async () => {
    const harness = createMonacoHarness();
    const document = fixtureDoc();
    currentDoc = document;
    let latestDoc = document;

    render(
      <WorkflowEditor
        document={document}
        enableJsonEditor
        jsonEditorPlacement="tab"
        jsonEditor={{ monaco: harness.runtime, debounceMs: 0 }}
        onChange={(next) => {
          latestDoc = next;
          currentDoc = next;
        }}
        localStorageKey={null}
      />,
    );

    const model = harness.getLastModel();
    if (!model) throw new Error("Missing Monaco model");

    const nextJson = model
      .getValue()
      .replace('"next": "end"', '"next": "done"')
      .replace('"end": {', '"done": {');

    model.setValue(nextJson);

    await waitFor(() => {
      expect(latestDoc.session.workflows[0]?.states.done).toBeTruthy();
      expect(latestDoc.session.workflows[0]?.states.end).toBeUndefined();
      expect(latestDoc.session.workflows[0]?.states.start.transitions[0]?.next).toBe("done");
    });
  });

  it("keeps the last valid graph and blocks save while JSON is invalid", async () => {
    const harness = createMonacoHarness();
    const document = fixtureDoc();
    currentDoc = document;
    let latestDoc = document;

    render(
      <WorkflowEditor
        document={document}
        enableJsonEditor
        jsonEditorPlacement="tab"
        jsonEditor={{ monaco: harness.runtime, debounceMs: 0 }}
        onChange={(next) => {
          latestDoc = next;
          currentDoc = next;
        }}
        onSave={() => {}}
        localStorageKey={null}
      />,
    );

    fireEvent.click(
      within(screen.getByTestId("workflow-editor-surface-tabs")).getByRole("button", {
        name: "JSON",
      }),
    );

    const model = harness.getLastModel();
    if (!model) throw new Error("Missing Monaco model");
    model.setValue("{");

    await waitFor(() => {
      expect(screen.getByTestId("workflow-json-status").textContent).toContain(
        "JSON syntax is invalid",
      );
      expect((screen.getByTestId("toolbar-save") as HTMLButtonElement).disabled).toBe(true);
    });

    expect(latestDoc.session.workflows[0]?.states.end).toBeTruthy();
    expect(latestDoc.session.workflows[0]?.states.done).toBeUndefined();
  });

  it("syncs visual edits back into the Monaco model", async () => {
    const harness = createMonacoHarness();
    const document = fixtureDoc();
    currentDoc = document;

    render(
      <WorkflowEditor
        document={document}
        enableJsonEditor
        jsonEditorPlacement="tab"
        jsonEditor={{ monaco: harness.runtime, debounceMs: 0 }}
        onChange={(next) => {
          currentDoc = next;
        }}
        localStorageKey={null}
      />,
    );

    fireEvent.click(screen.getByTestId("select-transition"));
    const nameInput = screen.getByTestId("inspector-transition-name");
    fireEvent.change(nameInput, {
      target: { value: "to_done" },
    });
    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(harness.getLastModel()?.getValue()).toContain('"name": "to_done"');
    });
  });

  it("keeps the same Monaco editor instance across JSON-driven document patches", async () => {
    const harness = createMonacoHarness();
    const document = fixtureDoc();
    currentDoc = document;
    let latestDoc = document;

    render(
      <WorkflowEditor
        document={document}
        enableJsonEditor
        jsonEditorPlacement="tab"
        jsonEditor={{ monaco: harness.runtime, debounceMs: 0 }}
        onChange={(next) => {
          latestDoc = next;
          currentDoc = next;
        }}
        localStorageKey={null}
      />,
    );

    const initialEditor = harness.getLastEditor();
    const model = harness.getLastModel();
    if (!initialEditor || !model) throw new Error("Missing Monaco harness objects");

    const nextJson = model
      .getValue()
      .replace('"next": "end"', '"next": "done"')
      .replace('"end": {', '"done": {');

    model.setValue(nextJson);

    await waitFor(() => {
      expect(latestDoc.session.workflows[0]?.states.done).toBeTruthy();
      expect(harness.getLastModel()?.getValue()).toContain('"done": {');
    });

    expect(harness.getLastEditor()).toBe(initialEditor);
  });

  it("does not show an empty inspector on the JSON surface", () => {
    const harness = createMonacoHarness();
    const document = fixtureDoc();
    currentDoc = document;

    render(
      <WorkflowEditor
        document={document}
        enableJsonEditor
        jsonEditorPlacement="tab"
        jsonEditor={{ monaco: harness.runtime, debounceMs: 0 }}
        localStorageKey={null}
      />,
    );

    expect(screen.queryByTestId("inspector")).toBeNull();

    fireEvent.click(
      within(screen.getByTestId("workflow-editor-surface-tabs")).getByRole("button", {
        name: "JSON",
      }),
    );

    expect(screen.queryByTestId("inspector")).toBeNull();
  });

  it("hides the contextual inspector when switching to the JSON surface", () => {
    const harness = createMonacoHarness();
    const document = fixtureDoc();
    currentDoc = document;

    render(
      <WorkflowEditor
        document={document}
        enableJsonEditor
        jsonEditorPlacement="tab"
        jsonEditor={{ monaco: harness.runtime, debounceMs: 0 }}
        localStorageKey={null}
      />,
    );

    fireEvent.click(screen.getByTestId("select-transition"));
    expect(screen.getByTestId("inspector-transition-name")).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId("workflow-editor-surface-tabs")).getByRole("button", {
        name: "JSON",
      }),
    );

    expect(screen.queryByTestId("inspector")).toBeNull();
  });

  it("reveals the matching JSON range when a graph element is selected", async () => {
    const harness = createMonacoHarness();
    const document = fixtureDoc();
    currentDoc = document;

    render(
      <WorkflowEditor
        document={document}
        enableJsonEditor
        jsonEditorPlacement="tab"
        jsonEditor={{ monaco: harness.runtime, debounceMs: 0 }}
        onChange={(next) => {
          currentDoc = next;
        }}
        localStorageKey={null}
      />,
    );

    fireEvent.click(screen.getByTestId("select-transition"));
    fireEvent.click(
      within(screen.getByTestId("workflow-editor-surface-tabs")).getByRole("button", {
        name: "JSON",
      }),
    );

    await waitFor(() => {
      expect(harness.getLastEditor()?.selectionCalls.length).toBeGreaterThan(0);
    });
  });
});
