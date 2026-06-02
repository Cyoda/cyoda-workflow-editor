import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "../src/App.js";

vi.mock("@cyoda/workflow-viewer", () => ({
  WorkflowViewer: (props: { surface?: string; layout?: string }) => (
    <div
      data-testid="mock-workflow-viewer"
      data-surface={props.surface ?? "website"}
      data-layout={props.layout ?? "embedded"}
    />
  ),
}));

vi.mock("@cyoda/workflow-react", () => ({
  WorkflowEditor: () => <div data-testid="mock-workflow-editor" />,
}));

vi.mock("../src/lib/monacoRuntime.js", () => ({
  getMonacoRuntime: () => ({ editor: true }),
}));

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("demo routes", () => {
  it("ops viewer route renders a read-only ops viewer and no editor", () => {
    window.history.pushState({}, "", "/ops-viewer");

    render(<App />);

    expect(screen.getByTestId("ops-viewer-page")).toBeTruthy();
    expect(screen.getByText("Environment: local-dev")).toBeTruthy();
    expect(screen.getByText(/Directly editing workflow configuration on a running system is not best practice/i)).toBeTruthy();
    expect(screen.getByTestId("mock-workflow-viewer").getAttribute("data-surface")).toBe("ops-console");
    expect(screen.getByTestId("mock-workflow-viewer").getAttribute("data-layout")).toBe("fullWidth");
    expect(screen.queryByTestId("mock-workflow-editor")).toBeNull();
  });

  it("website embed route renders viewer copy and no editor", () => {
    window.history.pushState({}, "", "/embed");

    render(<App />);

    expect(screen.getByText("Alert triage workflow")).toBeTruthy();
    expect(screen.getByTestId("mock-workflow-viewer").getAttribute("data-surface")).toBe("website");
    expect(screen.queryByTestId("mock-workflow-editor")).toBeNull();
  });
});
