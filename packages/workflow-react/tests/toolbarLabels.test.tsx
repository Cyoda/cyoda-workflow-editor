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

describe("toolbar copy", () => {
  it("renames Auto Layout to Auto-arrange", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} />);
    const btn = screen.getByTestId("toolbar-auto-layout");
    expect(btn.textContent).toBe("Auto-arrange");
  });

  it("renames Reset Layout to Reset positions", () => {
    render(<WorkflowEditor document={fixture(MINIMAL)} />);
    const btn = screen.getByTestId("toolbar-reset-layout");
    expect(btn.textContent).toBe("Reset positions");
  });
});
