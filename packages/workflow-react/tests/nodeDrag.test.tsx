/**
 * Regression tests for the node-drag / edge-routing bug.
 *
 * Root cause: the interactive React Flow edge renderer was still allowed to
 * render from stale ELK route points/label positions instead of the live
 * sourceX/Y and targetX/Y props React Flow recalculates as nodes move.
 *
 * Fix: Canvas keeps local controlled React Flow node state with
 * `onNodesChange`/`applyNodeChanges` plus `onNodeDrag`, and RfTransitionEdge
 * renders its SVG path from the live controlled node endpoints rather than
 * layout route points.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
import type { LayoutResult } from "@cyoda/workflow-layout";

// ── Shared mutable state (hoisted so vi.mock factories can reference it) ────

const { rfCallbacks } = vi.hoisted(() => ({
  rfCallbacks: {
    onNodeDragStart: undefined as undefined | ((e: unknown, node: unknown) => void),
    onNodeDrag: undefined as undefined | ((e: unknown, node: unknown) => void),
    onNodeDragStop:  undefined as undefined | ((e: unknown, node: unknown) => void),
    onNodesChange: undefined as undefined | ((changes: unknown[]) => void),
    latestNodes: undefined as undefined | {
      id: string;
      position: { x: number; y: number };
      data?: { denseAnchors?: boolean; node?: { stateCode?: string } };
    }[],
    latestEdges: undefined as undefined | {
      id: string;
      sourceHandle?: string;
      targetHandle?: string;
      data?: { routePoints?: unknown; labelX?: unknown; labelY?: unknown };
    }[],
  },
}));

const fitView = vi.fn().mockReturnValue(true);
const setViewport = vi.fn();

// ── React Flow mock ──────────────────────────────────────────────────────────

vi.mock("reactflow", () => {
  const Position = { Top: "top", Right: "right", Bottom: "bottom", Left: "left" } as const;
  type MockNode = {
    id: string;
    position: { x: number; y: number };
    width?: number;
    height?: number;
    style?: { width?: number; height?: number };
  };
  type MockEdge = {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type?: string;
    data?: unknown;
    selected?: boolean;
  };
  type MockEdgeComponentProps = {
    id: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: (typeof Position)[keyof typeof Position];
    targetPosition: (typeof Position)[keyof typeof Position];
    data?: unknown;
    selected?: boolean;
  };

  const sizeOf = (node: MockNode) => ({
    width: node.width ?? node.style?.width ?? 160,
    height: node.height ?? node.style?.height ?? 60,
  });
  const handleInset = (handle: string | undefined) => {
    switch (handle) {
      case "top-left":
      case "right-top":
      case "bottom-left":
      case "left-top":
        return 0.28;
      case "top-right":
      case "right-bottom":
      case "bottom-right":
      case "left-bottom":
        return 0.72;
      default:
        return 0.5;
    }
  };
  const handlePoint = (
    node: MockNode,
    handle: string | undefined,
    role: "source" | "target",
  ) => {
    const resolved = handle ?? (role === "source" ? "bottom" : "top");
    const { width, height } = sizeOf(node);
    const inset = handleInset(resolved);
    if (resolved.startsWith("top")) return { x: node.position.x + width * inset, y: node.position.y };
    if (resolved.startsWith("right")) return { x: node.position.x + width, y: node.position.y + height * inset };
    if (resolved.startsWith("left")) return { x: node.position.x, y: node.position.y + height * inset };
    return { x: node.position.x + width * inset, y: node.position.y + height };
  };
  const handlePosition = (handle: string | undefined, role: "source" | "target") => {
    const resolved = handle ?? (role === "source" ? "bottom" : "top");
    if (resolved.startsWith("top")) return Position.Top;
    if (resolved.startsWith("right")) return Position.Right;
    if (resolved.startsWith("left")) return Position.Left;
    return Position.Bottom;
  };

  const ReactFlow = ({
    nodes,
    edges,
    edgeTypes,
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onEdgeClick,
  }: {
    nodes?: MockNode[];
    edges?: MockEdge[];
    edgeTypes?: Record<string, React.ComponentType<MockEdgeComponentProps>>;
    onNodesChange?: (changes: unknown[]) => void;
    onNodeDragStart?: (e: unknown, node: unknown) => void;
    onNodeDrag?: (e: unknown, node: unknown) => void;
    onNodeDragStop?:  (e: unknown, node: unknown) => void;
    onEdgeClick?: (e: unknown, edge: MockEdge) => void;
  }) => {
    rfCallbacks.onNodesChange = onNodesChange;
    rfCallbacks.onNodeDragStart = onNodeDragStart;
    rfCallbacks.onNodeDrag = onNodeDrag;
    rfCallbacks.onNodeDragStop  = onNodeDragStop;
    rfCallbacks.latestNodes     = nodes;
    rfCallbacks.latestEdges     = edges as typeof rfCallbacks.latestEdges;
    const byId = new Map((nodes ?? []).map((node) => [node.id, node]));
    return (
      <div data-testid="mock-react-flow">
        <svg data-testid="mock-react-flow-svg">
          {(edges ?? []).map((edge) => {
            const EdgeComponent = edgeTypes?.[edge.type ?? "default"];
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            if (!EdgeComponent || !source || !target) return null;
            const sourcePoint = handlePoint(source, edge.sourceHandle, "source");
            const targetPoint = handlePoint(target, edge.targetHandle, "target");
            return (
              <g
                key={edge.id}
                data-testid={`rf-edge-hit-${edge.id}`}
                onClick={(event) => onEdgeClick?.(event, edge)}
              >
                <EdgeComponent
                  id={edge.id}
                  sourceX={sourcePoint.x}
                  sourceY={sourcePoint.y}
                  targetX={targetPoint.x}
                  targetY={targetPoint.y}
                  sourcePosition={handlePosition(edge.sourceHandle, "source")}
                  targetPosition={handlePosition(edge.targetHandle, "target")}
                  data={edge.data}
                  selected={edge.selected}
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };
  return {
    applyNodeChanges: (changes: Array<{ id: string; type: string; position?: { x: number; y: number }; dragging?: boolean; selected?: boolean }>, nodes: Array<{ id: string; position: { x: number; y: number } }>) =>
      nodes.map((node) => {
        const change = changes.find((candidate) => candidate.id === node.id);
        if (!change) return node;
        if (change.type === "position" && change.position) {
          return { ...node, position: change.position };
        }
        if (change.type === "select" && "selected" in change) {
          return { ...node, selected: change.selected };
        }
        return node;
      }),
    ReactFlow,
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    BaseEdge: ({ id, path, style, markerEnd }: { id: string; path: string; style?: React.CSSProperties; markerEnd?: string }) => (
      <path data-testid={`rf-edge-path-${id}`} d={path} style={style} markerEnd={markerEnd} />
    ),
    EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Handle: () => null,
    ConnectionMode: { Loose: "loose" },
    Position,
    useReactFlow: () => ({ fitView, setViewport }),
    useUpdateNodeInternals: () => vi.fn(),
  };
});

// ── Layout mock ──────────────────────────────────────────────────────────────

vi.mock("@cyoda/workflow-layout", () => ({
  layoutGraph: vi.fn(),
  estimateNodeSize: () => ({ width: 160, height: 60 }),
}));

// ── Imports that resolve after mocks are hoisted ─────────────────────────────

import { layoutGraph } from "@cyoda/workflow-layout";
import { WorkflowEditor } from "../src/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fixture(json: string): WorkflowEditorDocument {
  const result = parseImportPayload(json);
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

function stateUuid(
  doc: WorkflowEditorDocument,
  workflow: string,
  stateCode: string,
): string {
  const entry = Object.entries(doc.meta.ids.states).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`UUID not found for ${workflow}:${stateCode}`);
  return entry[0];
}

function transitionUuid(
  doc: WorkflowEditorDocument,
  workflow: string,
  stateCode: string,
): string {
  const entry = Object.entries(doc.meta.ids.transitions).find(
    ([, ptr]) =>
      ptr.workflow === workflow &&
      ptr.state === stateCode,
  );
  if (!entry) {
    throw new Error(`Transition UUID not found for ${workflow}:${stateCode}`);
  }
  return entry[0];
}

function buildLayout(doc: WorkflowEditorDocument): LayoutResult {
  const startId = stateUuid(doc, "wf", "start");
  const endId   = stateUuid(doc, "wf", "end");
  const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;
  return {
    positions: new Map([
      [startId, { id: startId, x: 100, y: 100, width: 160, height: 60 }],
      [endId,   { id: endId,   x: 100, y: 300, width: 160, height: 60 }],
    ]),
    edges: new Map([
      [transitionUuid, {
        id: transitionUuid,
        points: [{ x: 180, y: 160 }, { x: 180, y: 300 }],
        labelX: 180,
        labelY: 230,
        labelWidth: 60,
        labelHeight: 20,
      }],
    ]),
    width: 500,
    height: 500,
    preset: "configuratorReadable",
  };
}

const TWO_STATE_CONNECTED = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: { transitions: [{ name: "go", next: "end", manual: false, disabled: false }] },
        end:   { transitions: [] },
      },
    },
  ],
});

const BIDIRECTIONAL_VERTICAL = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "top",
      active: true,
      states: {
        top: {
          transitions: [{ name: "to_bottom", next: "bottom", manual: false, disabled: false }],
        },
        bottom: {
          transitions: [{ name: "to_top", next: "top", manual: false, disabled: false }],
        },
      },
    },
  ],
});

const DENSE_TRANSITIONS = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: {
          transitions: [{ name: "to_busy", next: "busy", manual: false, disabled: false }],
        },
        left: {
          transitions: [{ name: "to_busy_left", next: "busy", manual: false, disabled: false }],
        },
        busy: {
          transitions: [{ name: "to_end", next: "end", manual: false, disabled: false }],
        },
        end: { transitions: [] },
      },
    },
  ],
});

const SELF_LOOP = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "approved",
      active: true,
      states: {
        approved: {
          transitions: [{ name: "retry_here", next: "approved", manual: true, disabled: false }],
        },
      },
    },
  ],
});

const DENSE_SELF_LOOP_RETARGET = JSON.stringify({
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
});

// ── Setup / teardown ─────────────────────────────────────────────────────────

// Provide a complete in-memory localStorage so WorkflowEditor's persistence
// code works in the jsdom test environment (the default jsdom stub is partial).
const lsData: Record<string, string> = {};
const localStorageMock = {
  getItem:    (k: string) => lsData[k] ?? null,
  setItem:    (k: string, v: string) => { lsData[k] = v; },
  removeItem: (k: string) => { delete lsData[k]; },
  clear:      () => { for (const k of Object.keys(lsData)) delete lsData[k]; },
  get length() { return Object.keys(lsData).length; },
  key:        (i: number) => Object.keys(lsData)[i] ?? null,
};

beforeEach(() => {
  // Reset localStorage store.
  for (const k of Object.keys(lsData)) delete lsData[k];
  vi.stubGlobal("localStorage", localStorageMock);

  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  rfCallbacks.onNodeDragStart = undefined;
  rfCallbacks.onNodeDrag = undefined;
  rfCallbacks.onNodeDragStop  = undefined;
  rfCallbacks.onNodesChange = undefined;
  rfCallbacks.latestNodes = undefined;
  rfCallbacks.latestEdges     = undefined;
  fitView.mockClear();
  setViewport.mockClear();
  vi.mocked(layoutGraph).mockResolvedValue({ positions: new Map(), edges: new Map(), width: 0, height: 0, preset: "configuratorReadable" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── Tests: edge routing during drag ─────────────────────────────────────────

describe("edge routing during drag", () => {
  it("updates the rendered edge path as node position changes without a click", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const startId = stateUuid(doc, "wf", "start");
    const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;

    // Resolve layout with ELK routePoints present.
    vi.mocked(layoutGraph).mockResolvedValue(buildLayout(doc));

    render(<WorkflowEditor document={doc} />);

    // Wait for the ELK layout to propagate to the ReactFlow mock.
    await waitFor(() => {
      const node = rfCallbacks.latestNodes?.find((n) => n.id === startId);
      expect(node?.position).toEqual({ x: 100, y: 100 });
      expect(screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d")).toBeTruthy();
    });
    const initialPath = screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d");

    // Start dragging the "start" node. Real React Flow updates its internal
    // transform during drag and reports the live position through onNodeDrag;
    // the controlled onNodesChange path is also applied when emitted.
    await act(async () => {
      rfCallbacks.onNodeDragStart?.(null, {
        id: startId,
        position: { x: 100, y: 100 },
        data: {},
      });
      rfCallbacks.onNodesChange?.([
        {
          id: startId,
          type: "position",
          position: { x: 250, y: 150 },
          dragging: true,
        },
      ]);
      rfCallbacks.onNodeDrag?.(null, {
        id: startId,
        position: { x: 250, y: 150 },
        data: {},
      });
    });

    const nodeDuring = rfCallbacks.latestNodes?.find((n) => n.id === startId);
    expect(nodeDuring?.position).toEqual({ x: 250, y: 150 });

    // This assertion targets the actual SVG path used in the browser, not just
    // internal edge data. No click/selection update is involved here.
    const pathDuring = screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d");
    expect(pathDuring).toBeTruthy();
    expect(pathDuring).not.toEqual(initialPath);
  });

  it("keeps the rendered edge path changed after drag stop while layout is still stale", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const startId = stateUuid(doc, "wf", "start");
    const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;

    vi.mocked(layoutGraph).mockResolvedValue(buildLayout(doc));

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => {
      expect(screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d")).toBeTruthy();
    });
    const initialPath = screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d");

    await act(async () => {
      rfCallbacks.onNodeDragStart?.(null, { id: startId, position: { x: 100, y: 100 }, data: {} });
      rfCallbacks.onNodesChange?.([
        {
          id: startId,
          type: "position",
          position: { x: 250, y: 150 },
          dragging: true,
        },
      ]);
      rfCallbacks.onNodeDrag?.(null, {
        id: startId,
        position: { x: 250, y: 150 },
        data: {},
      });
      rfCallbacks.onNodeDragStop?.(null, {
        id: startId,
        position: { x: 250, y: 150 },
        data: {},
      });
    });

    const nodeAfterStop = rfCallbacks.latestNodes?.find((n) => n.id === startId);
    expect(nodeAfterStop?.position).toEqual({ x: 250, y: 150 });

    const pathAfterStop = screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d");
    expect(pathAfterStop).toBeTruthy();
    expect(pathAfterStop).not.toEqual(initialPath);
  });
});

// ── Tests: anchor dropdowns update rendered geometry ────────────────────────

describe("transition anchor dropdowns", () => {
  it("updates sourceHandle and rendered edge path when source anchor changes", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;

    vi.mocked(layoutGraph).mockResolvedValue(buildLayout(doc));

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => {
      expect(screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d")).toBeTruthy();
    });
    const initialPath = screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d");

    fireEvent.click(screen.getByTestId(`rf-edge-hit-${transitionUuid}`));
    const sourceAnchor = await screen.findByTestId("inspector-transition-source-anchor");
    fireEvent.change(sourceAnchor, { target: { value: "right" } });

    await waitFor(() => {
      const edge = rfCallbacks.latestEdges?.find((candidate) => candidate.id === transitionUuid);
      expect(edge?.sourceHandle).toBe("right");
      expect(screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d")).not.toEqual(initialPath);
    });
  });

  it("updates targetHandle and rendered edge path when target anchor changes", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;

    vi.mocked(layoutGraph).mockResolvedValue(buildLayout(doc));

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => {
      expect(screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d")).toBeTruthy();
    });
    const initialPath = screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d");

    fireEvent.click(screen.getByTestId(`rf-edge-hit-${transitionUuid}`));
    const targetAnchor = await screen.findByTestId("inspector-transition-target-anchor");
    fireEvent.change(targetAnchor, { target: { value: "left" } });

    await waitFor(() => {
      const edge = rfCallbacks.latestEdges?.find((candidate) => candidate.id === transitionUuid);
      expect(edge?.targetHandle).toBe("left");
      expect(screen.getByTestId(`rf-edge-path-${transitionUuid}`).getAttribute("d")).not.toEqual(initialPath);
    });
  });
});

describe("auto handle routing", () => {
  it("fans a busy state out across split handles once it has three incident transitions", async () => {
    const doc = fixture(DENSE_TRANSITIONS);
    const startId = stateUuid(doc, "wf", "start");
    const leftId = stateUuid(doc, "wf", "left");
    const busyId = stateUuid(doc, "wf", "busy");
    const endId = stateUuid(doc, "wf", "end");
    const toBusy = transitionUuid(doc, "wf", "start");
    const toBusyLeft = transitionUuid(doc, "wf", "left");
    const toEnd = transitionUuid(doc, "wf", "busy");

    vi.mocked(layoutGraph).mockResolvedValue({
      positions: new Map([
        [startId, { id: startId, x: 80, y: 80, width: 160, height: 60 }],
        [leftId, { id: leftId, x: 300, y: 80, width: 160, height: 60 }],
        [busyId, { id: busyId, x: 190, y: 260, width: 160, height: 60 }],
        [endId, { id: endId, x: 190, y: 440, width: 160, height: 60 }],
      ]),
      edges: new Map(),
      width: 640,
      height: 620,
      preset: "configuratorReadable",
    });

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => expect(rfCallbacks.latestEdges).toBeDefined());

    const busyNode = rfCallbacks.latestNodes?.find((node) => node.id === busyId);
    expect(busyNode?.data?.denseAnchors).toBe(true);

    const incomingHandles = [
      rfCallbacks.latestEdges?.find((edge) => edge.id === toBusy)?.targetHandle,
      rfCallbacks.latestEdges?.find((edge) => edge.id === toBusyLeft)?.targetHandle,
    ];
    expect(new Set(incomingHandles)).toEqual(new Set(["top-left", "top-right"]));
    expect(rfCallbacks.latestEdges?.find((edge) => edge.id === toEnd)?.sourceHandle).toBe("bottom");
  });

  it("routes the reverse leg of a bidirectional pair on a different corridor", async () => {
    const doc = fixture(BIDIRECTIONAL_VERTICAL);
    const topId = stateUuid(doc, "wf", "top");
    const bottomId = stateUuid(doc, "wf", "bottom");
    const toBottom = transitionUuid(doc, "wf", "top");
    const toTop = transitionUuid(doc, "wf", "bottom");

    vi.mocked(layoutGraph).mockResolvedValue({
      positions: new Map([
        [topId, { id: topId, x: 120, y: 80, width: 160, height: 60 }],
        [bottomId, { id: bottomId, x: 120, y: 280, width: 160, height: 60 }],
      ]),
      edges: new Map(),
      width: 480,
      height: 480,
      preset: "configuratorReadable",
    });

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => {
      expect(screen.getByTestId(`rf-edge-path-${toBottom}`).getAttribute("d")).toBeTruthy();
      expect(screen.getByTestId(`rf-edge-path-${toTop}`).getAttribute("d")).toBeTruthy();
    });

    const forwardEdge = rfCallbacks.latestEdges?.find((edge) => edge.id === toBottom);
    const reverseEdge = rfCallbacks.latestEdges?.find((edge) => edge.id === toTop);
    expect(forwardEdge?.sourceHandle).toBe("bottom");
    expect(forwardEdge?.targetHandle).toBe("top");
    expect(reverseEdge?.sourceHandle?.startsWith("right")).toBe(true);
    expect(reverseEdge?.targetHandle?.startsWith("right")).toBe(true);

    const forwardPath = screen.getByTestId(`rf-edge-path-${toBottom}`).getAttribute("d");
    const reversePath = screen.getByTestId(`rf-edge-path-${toTop}`).getAttribute("d");
    expect(reversePath).not.toEqual(forwardPath);
    expect(reversePath).toMatch(/L/);
  });

  it("renders a visible self-loop path for same-state transitions", async () => {
    const doc = fixture(SELF_LOOP);
    const approvedId = stateUuid(doc, "wf", "approved");
    const loopId = transitionUuid(doc, "wf", "approved");

    vi.mocked(layoutGraph).mockResolvedValue({
      positions: new Map([
        [approvedId, { id: approvedId, x: 120, y: 220, width: 160, height: 60 }],
      ]),
      edges: new Map(),
      width: 440,
      height: 420,
      preset: "configuratorReadable",
    });

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => {
      expect(screen.getByTestId(`rf-edge-path-${loopId}`).getAttribute("d")).toBeTruthy();
    });

    const loopEdge = rfCallbacks.latestEdges?.find((edge) => edge.id === loopId);
    expect(loopEdge?.sourceHandle).toBe("bottom");
    expect(loopEdge?.targetHandle).toBe("top");

    const loopPath = screen.getByTestId(`rf-edge-path-${loopId}`).getAttribute("d");
    expect(loopPath).toBe("M 200 280 L 200 308 L 308 308 L 308 192 L 200 192 L 200 220");
  });

  it("updates a normal transition into a visible self-loop when retargeted to its own state", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const startId = stateUuid(doc, "wf", "start");
    const endId = stateUuid(doc, "wf", "end");
    const loopId = transitionUuid(doc, "wf", "start");

    vi.mocked(layoutGraph).mockResolvedValue({
      positions: new Map([
        [startId, { id: startId, x: 100, y: 100, width: 160, height: 60 }],
        [endId, { id: endId, x: 100, y: 300, width: 160, height: 60 }],
      ]),
      edges: new Map(),
      width: 480,
      height: 480,
      preset: "configuratorReadable",
    });

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => {
      expect(screen.getByTestId(`rf-edge-path-${loopId}`).getAttribute("d")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId(`rf-edge-label-${loopId}`));
    fireEvent.change(screen.getByTestId("inspector-transition-next"), {
      target: { value: "start" },
    });

    await waitFor(() => {
      expect(screen.getByTestId(`rf-edge-path-${loopId}`).getAttribute("d")).toBe(
        "M 180 160 L 180 188 L 288 188 L 288 72 L 180 72 L 180 100",
      );
    });
  });

  it("keeps a retargeted self-loop visible on a dense state", async () => {
    const doc = fixture(DENSE_SELF_LOOP_RETARGET);
    const newId = stateUuid(doc, "wf", "new");
    const activeId = stateUuid(doc, "wf", "active");
    const approvedId = stateUuid(doc, "wf", "approved");
    const archivedId = stateUuid(doc, "wf", "archived");
    const loopId = transitionUuid(doc, "wf", "approved");

    vi.mocked(layoutGraph).mockResolvedValue({
      positions: new Map([
        [newId, { id: newId, x: 120, y: 20, width: 160, height: 60 }],
        [activeId, { id: activeId, x: 120, y: 120, width: 160, height: 60 }],
        [approvedId, { id: approvedId, x: 120, y: 220, width: 160, height: 60 }],
        [archivedId, { id: archivedId, x: 120, y: 360, width: 160, height: 60 }],
      ]),
      edges: new Map(),
      width: 480,
      height: 520,
      preset: "configuratorReadable",
    });

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => {
      expect(screen.getByTestId(`rf-edge-path-${loopId}`).getAttribute("d")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId(`rf-edge-label-${loopId}`));
    fireEvent.change(screen.getByTestId("inspector-transition-next"), {
      target: { value: "approved" },
    });

    await waitFor(() => {
      const loopEdge = rfCallbacks.latestEdges?.find((edge) => edge.id === loopId);
      expect(loopEdge?.sourceHandle).toBe("bottom");
      expect(loopEdge?.targetHandle).toBe("top");
      expect(screen.getByTestId(`rf-edge-path-${loopId}`).getAttribute("d")).toBe(
        "M 200 280 L 200 308 L 308 308 L 308 192 L 200 192 L 200 220",
      );
    });
  });
});

// ── Tests: position persistence ──────────────────────────────────────────────

describe("node drag — position persistence", () => {
  it("dispatches setNodePosition on drag stop and reflects in onChange doc", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const startId = stateUuid(doc, "wf", "start");
    let latestDoc: WorkflowEditorDocument | undefined;

    vi.mocked(layoutGraph).mockResolvedValue(buildLayout(doc));

    render(
      <WorkflowEditor
        document={doc}
        onChange={(d) => { latestDoc = d; }}
      />,
    );

    await waitFor(() => expect(rfCallbacks.onNodeDragStop).toBeDefined());

    await act(async () => {
      rfCallbacks.onNodeDragStop?.(null, {
        id: startId,
        position: { x: 250, y: 150 },
        data: {},
      });
    });

    expect(latestDoc?.meta.workflowUi.wf?.layout?.nodes?.start).toEqual({
      x: 250,
      y: 150,
      pinned: true,
    });
    await waitFor(() => {
      expect(vi.mocked(layoutGraph)).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          pinned: [expect.objectContaining({ id: startId, x: 250, y: 150 })],
        }),
      );
    });
  });

  it("persists position to localStorage after drag stop", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const startId = stateUuid(doc, "wf", "start");

    vi.mocked(layoutGraph).mockResolvedValue(buildLayout(doc));

    render(<WorkflowEditor document={doc} localStorageKey="test-drag-layout" />);

    await waitFor(() => expect(rfCallbacks.onNodeDragStop).toBeDefined());

    await act(async () => {
      rfCallbacks.onNodeDragStop?.(null, {
        id: startId,
        position: { x: 250, y: 150 },
        data: {},
      });
    });

    const stored = JSON.parse(localStorage.getItem("test-drag-layout") ?? "{}");
    expect(stored.wf?.layout?.nodes?.start).toEqual({ x: 250, y: 150, pinned: true });
  });

  it("remount loads persisted position from localStorage into document metadata", () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    localStorage.setItem(
      "test-drag-layout",
      JSON.stringify({ wf: { layout: { nodes: { start: { x: 300, y: 200, pinned: true } } } } }),
    );

    let latestDoc: WorkflowEditorDocument | undefined;
    render(
      <WorkflowEditor
        document={doc}
        localStorageKey="test-drag-layout"
        onChange={(d) => { latestDoc = d; }}
      />,
    );

    // On mount, onChange fires synchronously with the merged document.
    expect(latestDoc?.meta.workflowUi.wf?.layout?.nodes?.start).toEqual({
      x: 300,
      y: 200,
      pinned: true,
    });
    expect(vi.mocked(layoutGraph)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pinned: [expect.objectContaining({ x: 300, y: 200 })],
      }),
    );
  });

  it("round-trips edge anchors through localStorage persistence", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const edgeId = transitionUuid(doc, "wf", "start");
    doc.meta.workflowUi.wf = {
      edgeAnchors: {
        [edgeId]: { source: "right", target: "left" },
      },
    };

    render(<WorkflowEditor document={doc} localStorageKey="test-edge-anchors" />);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("test-edge-anchors") ?? "{}");
      expect(stored.wf?.edgeAnchors?.[edgeId]).toEqual({ source: "right", target: "left" });
    });

    cleanup();

    let latestDoc: WorkflowEditorDocument | undefined;
    render(
      <WorkflowEditor
        document={fixture(TWO_STATE_CONNECTED)}
        localStorageKey="test-edge-anchors"
        onChange={(d) => { latestDoc = d; }}
      />,
    );

    expect(latestDoc?.meta.workflowUi.wf?.edgeAnchors?.[edgeId]).toEqual({
      source: "right",
      target: "left",
    });
  });

  it("round-trips viewports through localStorage persistence", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    doc.meta.workflowUi.wf = {
      viewports: {
        vertical: { x: 12.35, y: -9.88, zoom: 0.765 },
      },
    };

    render(<WorkflowEditor document={doc} localStorageKey="test-viewports" />);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("test-viewports") ?? "{}");
      expect(stored.wf?.viewports?.vertical).toEqual({ x: 12.35, y: -9.88, zoom: 0.765 });
    });

    cleanup();

    let latestDoc: WorkflowEditorDocument | undefined;
    render(
      <WorkflowEditor
        document={fixture(TWO_STATE_CONNECTED)}
        localStorageKey="test-viewports"
        onChange={(d) => { latestDoc = d; }}
      />,
    );

    expect(latestDoc?.meta.workflowUi.wf?.viewports?.vertical).toEqual({
      x: 12.35,
      y: -9.88,
      zoom: 0.765,
    });
  });
});

// ── Tests: reset layout ──────────────────────────────────────────────────────

describe("reset layout", () => {
  it("clears all manual positions when Reset Layout is clicked", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const startId = stateUuid(doc, "wf", "start");
    let latestDoc: WorkflowEditorDocument | undefined;

    vi.mocked(layoutGraph).mockResolvedValue(buildLayout(doc));

    render(
      <WorkflowEditor
        document={doc}
        onChange={(d) => { latestDoc = d; }}
      />,
    );

    await waitFor(() => expect(rfCallbacks.onNodeDragStop).toBeDefined());

    // First, establish a manual position via drag.
    await act(async () => {
      rfCallbacks.onNodeDragStop?.(null, {
        id: startId,
        position: { x: 250, y: 150 },
        data: {},
      });
    });

    expect(latestDoc?.meta.workflowUi.wf?.layout?.nodes?.start).toBeDefined();

    // Click Reset Layout — should clear all manual positions.
    fireEvent.click(screen.getByTestId("toolbar-reset-layout"));

    expect(latestDoc?.meta.workflowUi.wf?.layout).toBeUndefined();
  });

  it("drag stop after reset layout re-establishes a position", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const startId = stateUuid(doc, "wf", "start");
    let latestDoc: WorkflowEditorDocument | undefined;

    vi.mocked(layoutGraph).mockResolvedValue(buildLayout(doc));

    render(
      <WorkflowEditor
        document={doc}
        onChange={(d) => { latestDoc = d; }}
      />,
    );

    await waitFor(() => expect(rfCallbacks.onNodeDragStop).toBeDefined());

    // Drag to position A.
    await act(async () => {
      rfCallbacks.onNodeDragStop?.(null, { id: startId, position: { x: 250, y: 150 }, data: {} });
    });
    // Reset.
    fireEvent.click(screen.getByTestId("toolbar-reset-layout"));
    expect(latestDoc?.meta.workflowUi.wf?.layout).toBeUndefined();

    // Drag to position B.
    await act(async () => {
      rfCallbacks.onNodeDragStop?.(null, { id: startId, position: { x: 400, y: 50 }, data: {} });
    });
    expect(latestDoc?.meta.workflowUi.wf?.layout?.nodes?.start).toEqual({
      x: 400,
      y: 50,
      pinned: true,
    });
  });
});

// ── Tests: drag does not affect read-only viewer ─────────────────────────────

describe("viewer mode", () => {
  it("does not wire drag handlers in viewer mode", async () => {
    const doc = fixture(TWO_STATE_CONNECTED);

    render(<WorkflowEditor document={doc} mode="viewer" />);

    await waitFor(() => expect(rfCallbacks.latestEdges).toBeDefined());

    // In viewer mode, onNodeDragStart and onNodeDragStop should not be wired.
    expect(rfCallbacks.onNodeDragStart).toBeUndefined();
    expect(rfCallbacks.onNodeDragStop).toBeUndefined();
  });
});
