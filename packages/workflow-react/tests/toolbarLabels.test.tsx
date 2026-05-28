import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
        start: { transitions: [] },
      },
    },
  ],
});

afterEach(() => cleanup());

describe("canvas controls", () => {
  it("shows undo and redo buttons in editor mode", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} />);
    expect(screen.getByTestId("canvas-undo")).toBeTruthy();
    expect(screen.getByTestId("canvas-redo")).toBeTruthy();
  });

  it("hides undo/redo buttons in viewer mode", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} mode="viewer" />);
    expect(screen.queryByTestId("canvas-undo")).toBeNull();
    expect(screen.queryByTestId("canvas-redo")).toBeNull();
  });
});
