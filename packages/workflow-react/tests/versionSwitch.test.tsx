import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkflowTabs } from "../src/toolbar/WorkflowTabs.js";

afterEach(cleanup);

const sampleWorkflows = [
  {
    version: "1.0",
    name: "wf",
    initialState: "s",
    active: true,
    states: { s: { transitions: [] } },
  },
];

describe("WorkflowTabs version badge", () => {
  it("shows the version badge when dialectVersion is provided", () => {
    render(
      <WorkflowTabs
        workflows={sampleWorkflows}
        activeWorkflow="wf"
        readOnly={false}
        onSelect={() => {}}
        dialectVersion="v0.8"
        supportedVersions={["0.7", "0.8"]}
        onVersionChange={() => {}}
      />,
    );
    expect(screen.getByTestId("version-badge").textContent).toContain("v0.8");
  });

  it("does not show version badge when dialectVersion is not provided", () => {
    render(
      <WorkflowTabs
        workflows={sampleWorkflows}
        activeWorkflow="wf"
        readOnly={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByTestId("version-badge")).toBeNull();
  });

  it("badge is non-interactive in readOnly mode", () => {
    render(
      <WorkflowTabs
        workflows={sampleWorkflows}
        activeWorkflow="wf"
        readOnly
        onSelect={() => {}}
        dialectVersion="v0.7"
        supportedVersions={["0.7", "0.8"]}
      />,
    );
    const badge = screen.getByTestId("version-badge");
    expect(badge.tagName).toBe("DIV");
    fireEvent.click(badge);
    expect(screen.queryByTestId("version-dropdown")).toBeNull();
  });

  it("calls onVersionChange when a version is selected from dropdown", () => {
    const onVersionChange = vi.fn();
    render(
      <WorkflowTabs
        workflows={sampleWorkflows}
        activeWorkflow="wf"
        readOnly={false}
        onSelect={() => {}}
        dialectVersion="v0.8"
        supportedVersions={["0.7", "0.8"]}
        onVersionChange={onVersionChange}
      />,
    );
    fireEvent.click(screen.getByTestId("version-badge"));
    fireEvent.click(screen.getByTestId("version-option-0.7"));
    expect(onVersionChange).toHaveBeenCalledWith("0.7");
  });
});
