import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(cat.textContent).toContain("PROCESSING");
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

  it("keeps decorative anchor dots on the outer border while aligning live handles to that edge", () => {
    render(
      withRf(
        <RfStateNode
          id="aligned"
          type="stateNode"
          data={nodeData("normal", "aligned")}
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable
          xPos={0}
          yPos={0}
        />,
      ),
    );
    const node = screen.getByTestId("rf-state-aligned");
    fireEvent.mouseEnter(node);
    const topDot = Array.from(node.querySelectorAll("div")).find(
      (el) =>
        el.style.width === "8px" &&
        el.style.height === "8px" &&
        el.style.borderRadius === "50%" &&
        el.style.top === "-4px",
    );
    const topHandle = Array.from(node.querySelectorAll(".react-flow__handle-top")).find(
      (el) =>
        (el as HTMLDivElement).style.top === "-8px" &&
        (el as HTMLDivElement).style.left === "50%",
    ) as HTMLDivElement | undefined;
    expect(topDot).toBeTruthy();
    expect(topHandle?.style.top).toBe("-8px");
  });

  it("uses the same outer-edge geometry for split dots and split handles", () => {
    render(
      withRf(
        <RfStateNode
          id="dense"
          type="stateNode"
          data={{ ...nodeData("normal", "dense"), denseAnchors: true }}
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable
          xPos={0}
          yPos={0}
        />,
      ),
    );
    const node = screen.getByTestId("rf-state-dense");
    fireEvent.mouseEnter(node);
    const splitTopDot = Array.from(node.querySelectorAll("div")).find(
      (el) =>
        el.style.width === "8px" &&
        el.style.height === "8px" &&
        el.style.top === "-4px" &&
        el.style.left === "calc(28% - 4px)",
    );
    const splitTopHandle = Array.from(node.querySelectorAll(".react-flow__handle-top")).find(
      (el) =>
        (el as HTMLDivElement).style.top === "-8px" &&
        (el as HTMLDivElement).style.width === "18px",
    ) as HTMLDivElement | undefined;
    expect(splitTopDot).toBeTruthy();
    expect(splitTopHandle).toBeTruthy();
  });

  it("keeps the cardinal center point visible on dense nodes when routing can still use it", () => {
    render(
      withRf(
        <RfStateNode
          id="dense-center"
          type="stateNode"
          data={{ ...nodeData("normal", "dense-center"), denseAnchors: true }}
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable
          xPos={0}
          yPos={0}
        />,
      ),
    );
    const node = screen.getByTestId("rf-state-dense-center");
    fireEvent.mouseEnter(node);
    const centerRightDot = Array.from(node.querySelectorAll("div")).find(
      (el) =>
        el.style.width === "8px" &&
        el.style.height === "8px" &&
        el.style.right === "-4px" &&
        el.style.top === "calc(50% - 4px)",
    );
    expect(centerRightDot).toBeTruthy();
  });

  it("hides visible anchor dots and handles until the node is hovered", () => {
    render(
      withRf(
        <RfStateNode
          id="hovered"
          type="stateNode"
          data={nodeData("normal", "hovered")}
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable
          xPos={0}
          yPos={0}
        />,
      ),
    );
    const node = screen.getByTestId("rf-state-hovered");
    const topHandle = Array.from(node.querySelectorAll(".react-flow__handle-top")).find(
      (el) => (el as HTMLDivElement).style.top === "-8px",
    ) as HTMLDivElement | undefined;
    const topDot = Array.from(node.querySelectorAll("div")).find(
      (el) => el.style.width === "8px" && el.style.height === "8px" && el.style.top === "-4px",
    ) as HTMLDivElement | undefined;

    expect(topHandle?.style.opacity).toBe("0");
    expect(topHandle?.style.pointerEvents).toBe("none");
    expect(topDot?.style.opacity).toBe("0");

    fireEvent.mouseEnter(node);

    expect(topHandle?.style.opacity).toBe("1");
    expect(topHandle?.style.pointerEvents).toBe("auto");
    expect(topDot?.style.opacity).toBe("1");
  });
});
