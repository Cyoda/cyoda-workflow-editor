import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
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

afterEach(() => {
  cleanup();
});

describe("help modal", () => {
  it("opens from the canvas help button and closes again", () => {
    render(
      <WorkflowEditor document={fixture(MINIMAL)} mode="editor" localStorageKey={null} />,
    );

    expect(screen.queryByRole("dialog", { name: /workflow editor guide/i })).toBeNull();

    fireEvent.click(screen.getByTestId("canvas-help"));

    const dialog = screen.getByRole("dialog", { name: /workflow editor guide/i });
    expect(dialog).toBeTruthy();
    // Spot-check a couple of legend entries from each section.
    expect(screen.getByText(/workflow entry point/i)).toBeTruthy();
    expect(screen.getByText(/needs a manual trigger/i)).toBeTruthy();
    expect(screen.getByText(/Auto-arrange layout/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId("help-modal-close"));
    expect(screen.queryByRole("dialog", { name: /workflow editor guide/i })).toBeNull();
  });
});
