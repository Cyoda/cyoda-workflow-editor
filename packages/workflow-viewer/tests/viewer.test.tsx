import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseImportPayload } from "@cyoda/workflow-core";
import { projectToGraph } from "@cyoda/workflow-graph";
import { WorkflowViewer } from "../src/index.js";
import { computeEdgeGeometry } from "../src/components/EdgePath.js";
import { nudgeLabels } from "../src/layout.js";
import { laneDashArray } from "../src/theme/lane.js";

afterEach(() => cleanup());

function projectFixture(json: unknown) {
  const parsed = parseImportPayload(JSON.stringify(json));
  if (!parsed.document) throw new Error("parse failed: " + JSON.stringify(parsed.issues));
  return projectToGraph(parsed.document);
}

function documentFixture(json: unknown) {
  const parsed = parseImportPayload(JSON.stringify(json));
  if (!parsed.document) throw new Error("parse failed: " + JSON.stringify(parsed.issues));
  return parsed.document;
}

describe("WorkflowViewer", () => {
  test("renders state nodes and edge chips for a minimal workflow", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "draft",
          active: true,
          states: {
            draft: {
              transitions: [
                {
                  name: "submit",
                  next: "review",
                  manual: false,
                  disabled: false,
                },
              ],
            },
            review: { transitions: [] },
          },
        },
      ],
    });

    const { container } = render(<WorkflowViewer graph={graph} />);
    expect(screen.getByTestId("workflow-viewer")).toBeTruthy();
    expect(screen.getByTestId("state-node-draft")).toBeTruthy();
    expect(screen.getByTestId("state-node-review")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid^='edge-']")).toHaveLength(1);
  });

  test("accepts a workflow document and applies website surface defaults", () => {
    const document = documentFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "draft",
          active: true,
          states: {
            draft: { transitions: [] },
          },
        },
      ],
    });

    const { container } = render(<WorkflowViewer document={document} />);

    const viewer = screen.getByTestId("workflow-viewer");
    expect(viewer.getAttribute("data-surface")).toBe("website");
    expect(viewer.getAttribute("data-layout")).toBe("embedded");
    expect(viewer.getAttribute("data-interaction")).toBe("hover-highlight");
    expect(screen.queryByTestId("start-marker")).toBeNull();
    expect(container.querySelector(".react-flow__handle")).toBeNull();
    expect(screen.queryByTestId("canvas-add-state")).toBeNull();
    expect(screen.queryByTestId("toolbar-save")).toBeNull();
  });

  test("ops-console surface renders read-only full-width viewer attributes", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "draft",
          active: true,
          states: {
            draft: { transitions: [] },
          },
        },
      ],
    });

    render(<WorkflowViewer graph={graph} surface="ops-console" layout="fullWidth" />);

    const viewer = screen.getByTestId("workflow-viewer");
    expect(viewer.getAttribute("data-surface")).toBe("ops-console");
    expect(viewer.getAttribute("data-layout")).toBe("fullWidth");
    expect(screen.queryByTestId("start-marker")).toBeNull();
    expect(screen.queryByTestId("canvas-add-state")).toBeNull();
    expect(screen.queryByTestId("toolbar-save")).toBeNull();
  });

  test("keeps initial-state styling when standalone start marker is hidden", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "draft",
          active: true,
          states: {
            draft: { transitions: [] },
          },
        },
      ],
    });

    render(<WorkflowViewer graph={graph} />);

    const node = screen.getByTestId("state-node-draft");
    const rects = node.querySelectorAll("rect");
    expect(rects).toHaveLength(3);
    expect(rects[0]?.getAttribute("stroke")).toBe("#FDA4AF");
    expect(rects[2]?.getAttribute("stroke")).toBe("#059669");
    expect(rects[2]?.getAttribute("stroke-dasharray")).toBe("3 3");
  });

  test("can explicitly render a start marker when enabled", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "draft",
          active: true,
          states: {
            draft: { transitions: [] },
          },
        },
      ],
    });

    const { container } = render(<WorkflowViewer graph={graph} showStartMarker />);

    expect(screen.getByTestId("start-marker")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='start-marker']")).toHaveLength(1);
  });

  test("hover-path inspects adjacent transitions for a hovered state", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "draft",
          active: true,
          states: {
            draft: {
              transitions: [{ name: "submit", next: "review", manual: false, disabled: false }],
            },
            review: {
              transitions: [{ name: "approve", next: "done", manual: false, disabled: false }],
            },
            done: { transitions: [] },
          },
        },
      ],
    });
    const onInspect = vi.fn();

    render(<WorkflowViewer graph={graph} interaction="hover-path" onInspect={onInspect} />);
    fireEvent.mouseEnter(screen.getByTestId("state-node-review"));

    expect(onInspect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "state",
        workflow: "wf",
        stateCode: "review",
        adjacentTransitions: expect.arrayContaining([
          expect.objectContaining({ name: "submit", direction: "incoming", sourceState: "draft", targetState: "review" }),
          expect.objectContaining({ name: "approve", direction: "outgoing", sourceState: "review", targetState: "done" }),
        ]),
        neighbouringStates: expect.arrayContaining([
          expect.objectContaining({ stateCode: "draft" }),
          expect.objectContaining({ stateCode: "done" }),
        ]),
      }),
    );
  });

  test("hover-path inspects source and target for a hovered transition", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "draft",
          active: true,
          states: {
            draft: {
              transitions: [{ name: "submit", next: "review", manual: false, disabled: false }],
            },
            review: { transitions: [] },
          },
        },
      ],
    });
    const onInspect = vi.fn();

    const { container } = render(<WorkflowViewer graph={graph} interaction="hover-path" onInspect={onInspect} />);
    const edge = container.querySelector("[data-testid^='edge-']");
    if (!edge) throw new Error("fixture missing edge");
    fireEvent.mouseEnter(edge);

    expect(onInspect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "transition",
        workflow: "wf",
        transitionName: "submit",
        neighbouringStates: expect.arrayContaining([
          expect.objectContaining({ stateCode: "draft" }),
          expect.objectContaining({ stateCode: "review" }),
        ]),
        adjacentTransitions: [
          expect.objectContaining({ name: "submit", direction: "outgoing", sourceState: "draft", targetState: "review" }),
        ],
      }),
    );
  });

  test("renders a badge row for manual transitions with processors", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: {
            a: {
              transitions: [
                {
                  name: "process",
                  next: "b",
                  manual: true,
                  disabled: false,
                  processors: [
                    {
                      type: "externalized",
                      name: "enrich",
                      executionMode: "SYNC",
                      config: {
                        attachEntity: false,
                        responseTimeoutMs: 5000,
                      },
                    },
                  ],
                },
              ],
            },
            b: { transitions: [] },
          },
        },
      ],
    });

    const { container } = render(<WorkflowViewer graph={graph} />);
    const texts = Array.from(container.querySelectorAll("text")).map((n) => n.textContent);
    expect(texts).toContain("process");
    expect(texts).toContain("enrich");
  });

  test("accepts an external selection and surfaces changes", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "x",
          active: true,
          states: {
            x: {
              transitions: [{ name: "go", next: "y", manual: false, disabled: false }],
            },
            y: { transitions: [] },
          },
        },
      ],
    });
    const xNode = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "x");
    if (!xNode) throw new Error("fixture missing x");

    render(<WorkflowViewer graph={graph} selectedId={xNode.id} />);
    expect(screen.getByTestId("state-node-x")).toBeTruthy();
  });

  test("renders state node dimensions from supplied layout positions", () => {
    const graph = projectFixture({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "wide",
          active: true,
          states: {
            wide: { transitions: [] },
          },
        },
      ],
    });
    const node = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "wide");
    if (!node) throw new Error("fixture missing wide");

    render(
      <WorkflowViewer
        graph={graph}
        layout={{
          positions: new Map([
            [node.id, { id: node.id, x: 10, y: 20, width: 220, height: 96 }],
          ]),
          width: 260,
          height: 140,
        }}
      />,
    );

    const rect = screen.getByTestId("state-node-wide").querySelector("rect");
    expect(rect?.getAttribute("width")).toBe("220");
    expect(rect?.getAttribute("height")).toBe("96");
  });

  test("renders manual transitions dotted and automatic transitions solid", () => {
    const manualEdge = {
      manual: true,
      disabled: false,
      isLoopback: false,
    } as Parameters<typeof laneDashArray>[0];
    const automaticEdge = {
      manual: false,
      disabled: false,
      isLoopback: false,
    } as Parameters<typeof laneDashArray>[0];

    expect(laneDashArray(manualEdge)).toBe("2 4");
    expect(laneDashArray(automaticEdge)).toBeUndefined();
  });
});

describe("computeEdgeGeometry fallback routing", () => {
  const source = { id: "a", x: 50, y: 10, width: 144, height: 72 };
  const target = { id: "b", x: 50, y: 200, width: 144, height: 72 };

  // Build a minimal edge shape for a simple forward transition.
  const edge = {
    kind: "transition" as const,
    id: "e1",
    workflow: "wf",
    sourceId: "a",
    targetId: "b",
    label: "go",
    manual: false,
    disabled: false,
    isSelf: false,
    isLoopback: false,
    parallelIndex: 0,
    parallelGroupSize: 1,
    summary: {
      display: "go",
      processor: null,
      criterion: false,
      execution: null,
    },
  } as Parameters<typeof computeEdgeGeometry>[0];

  test("path starts at source bottom-centre", () => {
    const { d } = computeEdgeGeometry(edge, source, target);
    const expectedSx = source.x + source.width / 2;        // 122
    const expectedSy = source.y + source.height;            // 82 (bottom edge)
    expect(d).toMatch(new RegExp(`^M ${expectedSx} ${expectedSy}\\b`));
  });

  test("arrowhead endpoint is at target top edge, outside node rect", () => {
    const { d } = computeEdgeGeometry(edge, source, target);
    const expectedTy = target.y;                             // 200 (top edge)
    // Last coordinate pair in the path should end at target top (ty = 200).
    const coords = [...d.matchAll(/[-\d.]+/g)].map(Number);
    const lastY = coords[coords.length - 1];
    expect(lastY).toBe(expectedTy);
    // Arrowhead y must be strictly less than target bottom.
    expect(lastY).toBeLessThan(target.y + target.height);
  });
});

describe("nudgeLabels collision avoidance", () => {
  test("separates overlapping labels vertically", () => {
    const PILL_W = 80;
    const PILL_H = 24;
    // Two labels at almost the same position.
    const items = [
      { id: "e1", midX: 100, midY: 150, pillW: PILL_W, pillH: PILL_H },
      { id: "e2", midX: 110, midY: 152, pillW: PILL_W, pillH: PILL_H },
    ];
    const result = nudgeLabels(items);
    const p1 = result.get("e1")!;
    const p2 = result.get("e2")!;
    // After nudging, the vertical distance must be at least pillH + 4.
    const vertDist = Math.abs(p2.midY - p1.midY);
    expect(vertDist).toBeGreaterThanOrEqual(PILL_H + 4);
  });

  test("does not move labels that are already separated", () => {
    const PILL_W = 60;
    const PILL_H = 24;
    const items = [
      { id: "e1", midX: 50,  midY: 100, pillW: PILL_W, pillH: PILL_H },
      { id: "e2", midX: 300, midY: 100, pillW: PILL_W, pillH: PILL_H },
    ];
    const result = nudgeLabels(items);
    // Horizontally far apart — no vertical nudge needed.
    expect(result.get("e1")!.midY).toBe(100);
    expect(result.get("e2")!.midY).toBe(100);
  });
});
