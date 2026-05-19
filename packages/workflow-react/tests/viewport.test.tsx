import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";

const { fitView, latestOnMoveEnd, setViewport } = vi.hoisted(() => ({
  fitView: vi.fn().mockReturnValue(true),
  latestOnMoveEnd: {
    current: undefined as
      | undefined
      | ((event: unknown, viewport: { x: number; y: number; zoom: number }) => void),
  },
  setViewport: vi.fn(),
}));

vi.mock("reactflow", () => {
  const ReactFlow = ({ children, onMoveEnd }: { children?: React.ReactNode; onMoveEnd?: (event: unknown, viewport: { x: number; y: number; zoom: number }) => void }) => {
    latestOnMoveEnd.current = onMoveEnd;
    return <div data-testid="mock-react-flow">{children}</div>;
  };
  return {
    ReactFlow,
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Handle: () => null,
    ConnectionMode: { Loose: "loose" },
    Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
    useReactFlow: () => ({ fitView, setViewport }),
    useUpdateNodeInternals: () => vi.fn(),
  };
});

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

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  fitView.mockClear();
  latestOnMoveEnd.current = undefined;
  setViewport.mockClear();
  vi.unstubAllGlobals();
});

describe("WorkflowEditor viewport behavior", () => {
  test("performs one post-layout initial fit with a small-graph zoom cap", async () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} />);

    await waitFor(() => {
      expect(fitView).toHaveBeenCalledWith({ padding: 0.2, maxZoom: 1 });
    });
    expect(setViewport).not.toHaveBeenCalled();
  });

  test("saved workflow/orientation viewport wins over initial fit", async () => {
    const doc = fixture(MINIMAL);
    doc.meta.workflowUi.minimal = {
      viewports: {
        vertical: { x: 40, y: -20, zoom: 0.5 },
      },
    };

    render(<WorkflowEditor document={doc} />);

    await waitFor(() => {
      expect(setViewport).toHaveBeenCalledWith(
        { x: 40, y: -20, zoom: 0.5 },
        { duration: 0 },
      );
    });
    expect(fitView).not.toHaveBeenCalled();
  });

  test("orientation switch performs one fit for the new orientation", async () => {
    const doc = fixture(MINIMAL);
    const { rerender } = render(
      <WorkflowEditor document={doc} layoutOptions={{ orientation: "vertical" }} />,
    );

    await waitFor(() => {
      expect(fitView).toHaveBeenCalledTimes(1);
    });

    rerender(
      <WorkflowEditor document={doc} layoutOptions={{ orientation: "horizontal" }} />,
    );

    await waitFor(() => {
      expect(fitView).toHaveBeenCalledTimes(2);
    });
    expect(setViewport).not.toHaveBeenCalled();
  });

  test("persists viewport changes into workflowUi by workflow and orientation", async () => {
    let latest: WorkflowEditorDocument | undefined;
    render(<WorkflowEditor document={fixture(MINIMAL)} onChange={(doc) => { latest = doc; }} />);

    await waitFor(() => {
      expect(fitView).toHaveBeenCalled();
    });
    await act(async () => {
      latestOnMoveEnd.current?.(null, { x: 12.3456, y: -9.8765, zoom: 0.76543 });
    });

    await waitFor(() => {
      expect(latest?.meta.workflowUi.minimal?.viewports?.vertical).toEqual({
        x: 12.35,
        y: -9.88,
        zoom: 0.765,
      });
    });
  });
});
