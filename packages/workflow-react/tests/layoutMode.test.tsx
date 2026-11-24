/**
 * `mode="layout"` (issue #42): the workflow definition is locked exactly as in
 * `viewer`, but nodes can be repositioned and the layout controls stay on, and
 * position changes persist through `onLayoutMetadataChange`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  parseImportPayload,
  type WorkflowEditorDocument,
  type WorkflowUiMeta,
} from "@cyoda/workflow-core";
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
            props.onSelectionChange({
              kind: "transition",
              transitionUuid: transitionId(currentDoc, "wf", "start"),
            });
          }}
        >
          select transition
        </button>
        <button
          type="button"
          data-testid="select-state"
          onClick={() => {
            if (!currentDoc) throw new Error("No current document");
            props.onSelectionChange({
              kind: "state",
              workflow: "wf",
              stateCode: "start",
              nodeId: stateId(currentDoc, "wf", "start"),
            });
          }}
        >
          select state
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
          version: "1.3",
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

function stateId(doc: WorkflowEditorDocument, workflow: string, stateCode: string): string {
  const entry = Object.entries(doc.meta.ids.states).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`Missing state id for ${workflow}:${stateCode}`);
  return entry[0];
}

function transitionId(doc: WorkflowEditorDocument, workflow: string, stateCode: string): string {
  const entry = Object.entries(doc.meta.ids.transitions).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`Missing transition id for ${workflow}:${stateCode}`);
  return entry[0];
}

function canvas(): CanvasProps {
  if (!latestCanvasProps) throw new Error("Canvas not rendered");
  return latestCanvasProps;
}

const lsData: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(lsData)) delete lsData[k];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => lsData[k] ?? null,
    setItem: (k: string, v: string) => { lsData[k] = v; },
    removeItem: (k: string) => { delete lsData[k]; },
    clear: () => { for (const k of Object.keys(lsData)) delete lsData[k]; },
    get length() { return Object.keys(lsData).length; },
    key: (i: number) => Object.keys(lsData)[i] ?? null,
  });
});

afterEach(() => {
  latestCanvasProps = undefined;
  currentDoc = undefined;
  cleanup();
  vi.unstubAllGlobals();
});

function renderMode(
  mode: "layout" | "viewer",
  extra: {
    onChange?: (d: WorkflowEditorDocument) => void;
    onLayoutMetadataChange?: (m: WorkflowUiMeta) => void;
    onSave?: (d: WorkflowEditorDocument) => void;
  } = {},
) {
  const document = fixtureDoc();
  currentDoc = document;
  render(<WorkflowEditor document={document} mode={mode} {...extra} />);
  return document;
}

describe('mode="layout": canvas wiring', () => {
  it("locks the definition but keeps the position and layout controls", () => {
    renderMode("layout");
    const p = canvas();
    expect(p.readOnly).toBe(true);
    expect(p.layoutEditable).toBe(true);
    expect(p.onNodeDragStop).toBeTypeOf("function");
    expect(p.onTransitionLabelDragEnd).toBeTypeOf("function");
    expect(p.onAutoLayout).toBeTypeOf("function");
    expect(p.onSetLayoutOrientation).toBeTypeOf("function");
    expect(p.onSetLayoutDensity).toBeTypeOf("function");
    expect(p.onUndo).toBeUndefined();
    expect(p.onRedo).toBeUndefined();
  });

  it("viewer stays fully locked", () => {
    renderMode("viewer");
    const p = canvas();
    expect(p.readOnly).toBe(true);
    expect(p.layoutEditable).toBe(false);
    expect(p.onNodeDragStop).toBeUndefined();
    expect(p.onAutoLayout).toBeUndefined();
    expect(p.onSetLayoutOrientation).toBeUndefined();
    expect(p.onSetLayoutDensity).toBeUndefined();
    expect(p.onUndo).toBeUndefined();
    expect(p.onRedo).toBeUndefined();
  });
});

describe('mode="layout": position persistence', () => {
  it("persists a node drag through onLayoutMetadataChange and onChange", () => {
    const onLayoutMetadataChange = vi.fn();
    let latest: WorkflowEditorDocument | undefined;
    const doc = renderMode("layout", {
      onLayoutMetadataChange,
      onChange: (d) => { latest = d; },
    });
    const startId = stateId(doc, "wf", "start");
    const activeId = stateId(doc, "wf", "active");

    act(() => {
      canvas().onNodeDragStop!(startId, 250, 150, [
        { id: startId, x: 250, y: 150 },
        { id: activeId, x: 100, y: 300 },
      ]);
    });

    expect(latest?.meta.workflowUi.wf?.layout?.nodes?.start).toEqual({ x: 250, y: 150, pinned: true });
    const lastMeta = onLayoutMetadataChange.mock.calls.at(-1)?.[0] as WorkflowUiMeta;
    expect(lastMeta.layout?.nodes?.start).toEqual({ x: 250, y: 150, pinned: true });
    // The definition itself is untouched.
    expect(latest?.session).toEqual(doc.session);
  });

  it("persists a transition label drag", () => {
    let latest: WorkflowEditorDocument | undefined;
    const doc = renderMode("layout", { onChange: (d) => { latest = d; } });
    const tId = transitionId(doc, "wf", "start");

    act(() => {
      canvas().onTransitionLabelDragEnd!(tId, 40, 60);
    });

    expect(latest?.meta.workflowUi.wf?.transitionPositions?.[tId]).toEqual({ x: 40, y: 60 });
  });

  it("viewer still ignores a transition label drag", () => {
    let latest: WorkflowEditorDocument | undefined;
    const doc = renderMode("viewer", { onChange: (d) => { latest = d; } });
    const tId = transitionId(doc, "wf", "start");

    act(() => {
      canvas().onTransitionLabelDragEnd?.(tId, 40, 60);
    });

    expect(latest?.meta.workflowUi.wf?.transitionPositions?.[tId]).toBeUndefined();
  });

  it("does not record position changes on the undo stack", () => {
    let latest: WorkflowEditorDocument | undefined;
    const doc = renderMode("layout", { onChange: (d) => { latest = d; } });
    const startId = stateId(doc, "wf", "start");

    act(() => {
      canvas().onNodeDragStop!(startId, 250, 150, [{ id: startId, x: 250, y: 150 }]);
    });
    expect(canvas().canUndo).toBe(false);

    fireEvent.keyDown(screen.getByTestId("workflow-editor"), { key: "z", ctrlKey: true });
    expect(latest?.meta.workflowUi.wf?.layout?.nodes?.start).toEqual({ x: 250, y: 150, pinned: true });
  });
});

describe('mode="layout": keyboard shortcuts', () => {
  it("'l' re-runs auto-layout", () => {
    renderMode("layout");
    const before = canvas().layoutKey;
    fireEvent.keyDown(screen.getByTestId("workflow-editor"), { key: "l", code: "KeyL" });
    expect(canvas().layoutKey).toBe((before ?? 0) + 1);
  });

  it("'l' does nothing in viewer", () => {
    renderMode("viewer");
    const before = canvas().layoutKey;
    fireEvent.keyDown(screen.getByTestId("workflow-editor"), { key: "l", code: "KeyL" });
    expect(canvas().layoutKey).toBe(before);
  });

  it("'a' does not open Add State", () => {
    renderMode("layout");
    fireEvent.keyDown(screen.getByTestId("workflow-editor"), { key: "a", code: "KeyA" });
    expect(screen.queryByTestId("add-state-name-input")).toBeNull();
  });

  it("Delete on a selected transition does not remove it", () => {
    let latest: WorkflowEditorDocument | undefined;
    const doc = renderMode("layout", { onChange: (d) => { latest = d; } });
    fireEvent.click(screen.getByTestId("select-transition"));
    fireEvent.keyDown(screen.getByTestId("workflow-editor"), { key: "Delete", code: "Delete" });
    expect(latest?.session).toEqual(doc.session);
  });
});

describe('mode="layout": editing chrome', () => {
  it("hides Add State and disables save", () => {
    renderMode("layout", { onSave: vi.fn() });
    expect(screen.queryByTestId("canvas-add-state")).toBeNull();
    const save = screen.queryByTestId("toolbar-save") as HTMLButtonElement | null;
    if (save) expect(save.disabled).toBe(true);
  });

  it("hides the tab strip for a single workflow, like viewer", () => {
    renderMode("layout");
    expect(screen.queryByTestId("workflow-tabs")).toBeNull();
  });

  it("shows a readable inspector with disabled inputs for a transition", () => {
    renderMode("layout");
    fireEvent.click(screen.getByTestId("select-transition"));
    expect(screen.getByTestId("inspector")).toBeTruthy();
    const name = screen.getByTestId("inspector-transition-name") as HTMLInputElement;
    expect(name.value).toBe("to_active");
    expect(name.disabled).toBe(true);
  });

  it("shows a readable inspector with disabled inputs for a state", () => {
    renderMode("layout");
    fireEvent.click(screen.getByTestId("select-state"));
    const inspector = screen.getByTestId("inspector");
    const inputs = Array.from(inspector.querySelectorAll("input, textarea, select")) as HTMLInputElement[];
    const editable = inputs.filter((el) => !el.disabled && !el.readOnly);
    expect(inputs.length).toBeGreaterThan(0);
    expect(editable).toEqual([]);
  });
});
