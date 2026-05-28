import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmbedViewerPage } from "../src/pages/EmbedViewerPage.js";

afterEach(() => cleanup());

describe("EmbedViewerPage", () => {
  it("renders the initial state without a standalone start-marker circle", () => {
    const { container } = render(<EmbedViewerPage />);

    expect(screen.getByText("Alert triage workflow")).toBeTruthy();
    expect(screen.getByTestId("state-node-raised")).toBeTruthy();
    expect(container.querySelector("[data-testid='workflow-viewer']")).toBeTruthy();
    expect(container.querySelector("[data-testid='start-marker']")).toBeNull();
    expect(container.querySelector("circle")).toBeNull();
  });
});
