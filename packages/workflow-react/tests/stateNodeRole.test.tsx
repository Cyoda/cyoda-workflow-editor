import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "reactflow";
import type { ReactNode } from "react";
import type { StateNode } from "@cyoda/workflow-graph";
import { RfStateNode } from "../src/components/RfStateNode.js";

function withRf(node: ReactNode) {
  return <ReactFlowProvider>{node}</ReactFlowProvider>;
}

afterEach(() => cleanup());

function nodeData(role: StateNode["role"], stateCode: string, category?: StateNode["category"]) {
  const node: StateNode = {
    kind: "state",
    id: stateCode,
    workflow: "wf",
    stateCode,
    role,
    category,
  };
  return {
    node,
    hasError: false,
    hasWarning: false,
    size: { width: 160, height: 60 },
  } as const;
}

describe("state node role icons", () => {
  it("exposes an aria-label including the role category for initial states", () => {
    render(
      withRf(
        <RfStateNode
          id="start"
          type="stateNode"
          data={nodeData("initial", "start")}
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable
          xPos={0}
          yPos={0}
        />,
      ),
    );
    const initialNode = screen.getByTestId("rf-state-start");
    expect(initialNode.getAttribute("aria-label")).toContain("INITIAL");
    expect(initialNode.getAttribute("aria-label")).toContain("start");
  });

  it("renders an icon glyph alongside the category label", () => {
    render(
      withRf(
        <RfStateNode
          id="processing"
          type="stateNode"
          data={nodeData("normal", "processing", "PROCESSING_STATE")}
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable
          xPos={0}
          yPos={0}
        />,
      ),
    );
    const cat = screen.getByTestId("rf-state-processing-category");
    expect(cat.querySelector("svg")).not.toBeNull();
    expect(cat.textContent).toContain("PROCESSING STATE");
  });

  it("uses the TERMINAL label for terminal states", () => {
    render(
      withRf(
        <RfStateNode
          id="stop"
          type="stateNode"
          data={nodeData("terminal", "stop")}
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable
          xPos={0}
          yPos={0}
        />,
      ),
    );
    const terminalNode = screen.getByTestId("rf-state-stop");
    expect(terminalNode.getAttribute("aria-label")).toContain("TERMINAL");
  });
});
