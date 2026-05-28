import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import type { Connection, Edge } from "reactflow";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";
import type { CanvasProps } from "../src/components/Canvas.js";

// Capture the onConnect callback the WorkflowEditor passes to Canvas so tests
// can invoke it directly, without needing a real React Flow drag interaction.
let capturedOnConnect: ((c: Connection) => void) | undefined;
let capturedOnReconnect: ((edge: Edge, c: Connection) => void) | undefined;

vi.mock("../src/components/Canvas.js", () => ({
  Canvas: ({ onConnect, onReconnect }: CanvasProps) => {
    capturedOnConnect = onConnect;
    capturedOnReconnect = onReconnect as typeof capturedOnReconnect;
    return <div data-testid="mock-canvas" />;
  },
}));

function fixture(json: string): WorkflowEditorDocument {
  const result = parseImportPayload(json);
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

function stateId(doc: WorkflowEditorDocument, workflow: string, state: string): string {
  const entry = Object.entries(doc.meta.ids.states).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === state,
  );
  if (!entry) throw new Error(`No state id for ${workflow}:${state}`);
  return entry[0];
}

function transitionId(doc: WorkflowEditorDocument, workflow: string, state: string): string {
  const entry = Object.entries(doc.meta.ids.transitions).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === state,
  );
  if (!entry) throw new Error(`No transition id for ${workflow}:${state}`);
  return entry[0];
}

const TWO_STATE = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: { transitions: [] },
        end: { transitions: [] },
      },
    },
  ],
});

const TWO_WF = JSON.stringify({
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
      initialState: "s2",
      active: true,
      states: { s2: { transitions: [] } },
    },
  ],
});

const RECONNECTABLE = JSON.stringify({
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
              next: "mid",
              manual: true,
              disabled: false,
              processors: [
                { type: "externalized", name: "notify", executionMode: "ASYNC_NEW_TX", config: {} },
              ],
            },
          ],
        },
        alt: { transitions: [] },
        mid: { transitions: [] },
        end: { transitions: [] },
      },
    },
  ],
});

const DUPLICATE_SOURCE = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: { transitions: [{ name: "go", next: "mid", manual: false, disabled: false }] },
        alt: { transitions: [{ name: "go", next: "end", manual: false, disabled: false }] },
        mid: { transitions: [] },
        end: { transitions: [] },
      },
    },
  ],
});

const SAME_NAME_DIFFERENT_SOURCE = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: { transitions: [{ name: "go", next: "end", manual: false, disabled: false }] },
        alt: { transitions: [] },
        end: { transitions: [] },
      },
    },
  ],
});

beforeEach(() => {
  capturedOnConnect = undefined;
  capturedOnReconnect = undefined;
});

afterEach(() => cleanup());

describe("WorkflowEditor drag-connect flow", () => {
  it("opens DragConnectModal when a valid same-workflow connection is triggered", () => {
    const doc = fixture(TWO_STATE);
    const srcId = stateId(doc, "wf", "start");
    const tgtId = stateId(doc, "wf", "end");

    render(<WorkflowEditor document={doc} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(screen.getByTestId("dragconnect-name")).toBeTruthy();
  });

  it("entering a valid name and confirming calls onChange with the new transition", () => {
    const doc = fixture(TWO_STATE);
    const srcId = stateId(doc, "wf", "start");
    const tgtId = stateId(doc, "wf", "end");

    let lastDoc: WorkflowEditorDocument | undefined;
    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: "bottom",
        targetHandle: "top",
      });
    });

    const input = screen.getByTestId("dragconnect-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "go" } });
    fireEvent.click(screen.getByTestId("dragconnect-create"));

    // Modal should close
    expect(screen.queryByTestId("dragconnect-name")).toBeNull();

    // The onChange document should contain the new transition
    const wf = lastDoc?.session.workflows.find((w) => w.name === "wf");
    const transitions = wf?.states["start"]?.transitions ?? [];
    expect(transitions.some((t) => t.name === "go" && t.next === "end")).toBe(true);
  });

  it("allows the same transition name from a different source state", () => {
    const doc = fixture(SAME_NAME_DIFFERENT_SOURCE);
    const srcId = stateId(doc, "wf", "alt");
    const tgtId = stateId(doc, "wf", "end");

    let lastDoc: WorkflowEditorDocument | undefined;
    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: "bottom",
        targetHandle: "top",
      });
    });

    const input = screen.getByTestId("dragconnect-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "go" } });
    fireEvent.click(screen.getByTestId("dragconnect-create"));

    const wf = lastDoc?.session.workflows.find((w) => w.name === "wf");
    expect(wf?.states.start?.transitions).toEqual([
      { name: "go", next: "end", manual: false, disabled: false },
    ]);
    expect(wf?.states.alt?.transitions).toEqual([
      { name: "go", next: "end", manual: false, disabled: false },
    ]);
  });

  it("cancel closes the modal without creating a transition", () => {
    const doc = fixture(TWO_STATE);
    const srcId = stateId(doc, "wf", "start");
    const tgtId = stateId(doc, "wf", "end");

    let lastDoc: WorkflowEditorDocument | undefined;
    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    fireEvent.click(screen.getByTestId("dragconnect-cancel"));

    expect(screen.queryByTestId("dragconnect-name")).toBeNull();

    const wf = lastDoc?.session.workflows.find((w) => w.name === "wf");
    const transitions = wf?.states["start"]?.transitions ?? [];
    expect(transitions).toHaveLength(0);
  });

  it("does not open the modal for a cross-workflow connection", () => {
    const doc = fixture(TWO_WF);
    const srcId = stateId(doc, "alpha", "s1");
    const tgtId = stateId(doc, "beta", "s2");

    render(<WorkflowEditor document={doc} />);

    act(() => {
      capturedOnConnect?.({
        source: srcId,
        target: tgtId,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(screen.queryByTestId("dragconnect-name")).toBeNull();
  });

  it("does not open the modal when source is null", () => {
    const doc = fixture(TWO_STATE);
    const tgtId = stateId(doc, "wf", "end");

    render(<WorkflowEditor document={doc} />);

    act(() => {
      capturedOnConnect?.({
        source: null,
        target: tgtId,
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(screen.queryByTestId("dragconnect-name")).toBeNull();
  });

  it("reconnecting the target endpoint updates transition next and target anchor", async () => {
    const doc = fixture(RECONNECTABLE);
    const startId = stateId(doc, "wf", "start");
    const midId = stateId(doc, "wf", "mid");
    const endId = stateId(doc, "wf", "end");
    const edgeId = transitionId(doc, "wf", "start");
    let lastDoc: WorkflowEditorDocument | undefined;

    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnReconnect?.(
        { id: edgeId, source: startId, target: midId, sourceHandle: "bottom", targetHandle: "top" },
        { source: startId, target: endId, sourceHandle: "bottom", targetHandle: "right" },
      );
    });

    await waitFor(() => {
      const transition = lastDoc?.session.workflows[0]?.states.start?.transitions[0];
      expect(transition?.next).toBe("end");
      expect(transition?.processors?.[0]?.name).toBe("notify");
      expect(lastDoc?.meta.workflowUi.wf?.edgeAnchors?.[edgeId]).toEqual({
        source: "bottom",
        target: "right",
      });
    });
  });

  it("reconnecting the source endpoint moves the transition to the new source state", async () => {
    const doc = fixture(RECONNECTABLE);
    const startId = stateId(doc, "wf", "start");
    const altId = stateId(doc, "wf", "alt");
    const midId = stateId(doc, "wf", "mid");
    const edgeId = transitionId(doc, "wf", "start");
    let lastDoc: WorkflowEditorDocument | undefined;

    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnReconnect?.(
        { id: edgeId, source: startId, target: midId, sourceHandle: "bottom", targetHandle: "top" },
        { source: altId, target: midId, sourceHandle: "left", targetHandle: "top" },
      );
    });

    await waitFor(() => {
      const wf = lastDoc?.session.workflows[0];
      expect(wf?.states.start?.transitions).toHaveLength(0);
      expect(wf?.states.alt?.transitions[0]).toMatchObject({
        name: "go",
        next: "mid",
        manual: true,
        disabled: false,
      });
      expect(wf?.states.alt?.transitions[0]?.processors?.[0]?.name).toBe("notify");

      const movedEdgeId = transitionId(lastDoc!, "wf", "alt");
      expect(lastDoc?.meta.workflowUi.wf?.edgeAnchors?.[movedEdgeId]).toEqual({
        source: "left",
        target: "top",
      });
    });
  });

  it("rejects source reconnect when the destination state already has the transition name", async () => {
    const doc = fixture(DUPLICATE_SOURCE);
    const startId = stateId(doc, "wf", "start");
    const altId = stateId(doc, "wf", "alt");
    const midId = stateId(doc, "wf", "mid");
    const edgeId = transitionId(doc, "wf", "start");
    let lastDoc: WorkflowEditorDocument | undefined;

    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnReconnect?.(
        { id: edgeId, source: startId, target: midId, sourceHandle: "bottom", targetHandle: "top" },
        { source: altId, target: midId, sourceHandle: "left", targetHandle: "top" },
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("reconnect-error").textContent).toContain(
        'Transition "go" already exists in state "alt".',
      );
      expect(lastDoc?.session.workflows[0]?.states.start?.transitions).toHaveLength(1);
      expect(lastDoc?.session.workflows[0]?.states.alt?.transitions).toHaveLength(1);
    });
  });

  it("ignores invalid reconnects without mutating the document", async () => {
    const doc = fixture(RECONNECTABLE);
    const startId = stateId(doc, "wf", "start");
    const midId = stateId(doc, "wf", "mid");
    const edgeId = transitionId(doc, "wf", "start");
    let lastDoc: WorkflowEditorDocument | undefined;

    render(<WorkflowEditor document={doc} onChange={(d) => { lastDoc = d; }} />);

    act(() => {
      capturedOnReconnect?.(
        { id: edgeId, source: startId, target: midId, sourceHandle: "bottom", targetHandle: "top" },
        { source: null, target: midId, sourceHandle: null, targetHandle: "top" },
      );
    });

    await waitFor(() => {
      expect(lastDoc?.session).toEqual(doc.session);
      expect(screen.queryByTestId("reconnect-error")).toBeNull();
    });
  });
});
