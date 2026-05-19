import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";

function fixture(json: string): WorkflowEditorDocument {
  const result = parseImportPayload(json);
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

// Workflow with an automated terminal-bound transition produces an
// "automated-no-criterion" info-level issue with a transition targetId.
const WITH_INFO = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "infoWf",
      initialState: "a",
      active: true,
      states: {
        a: {
          transitions: [
            { name: "go", next: "b", manual: false, disabled: false },
          ],
        },
        b: { transitions: [] },
      },
    },
  ],
});

afterEach(() => cleanup());

describe("issue badges", () => {
  it("issue badges render as buttons with aria-haspopup when count > 0", () => {
    render(<WorkflowEditor document={fixture(WITH_INFO)} />);
    const infos = screen.getByTestId("toolbar-infos") as HTMLButtonElement;
    expect(infos.tagName).toBe("BUTTON");
    expect(infos.getAttribute("aria-haspopup")).toBe("dialog");
    expect(infos.disabled).toBe(false);
  });

  it("opens the issues drawer when an issue badge is clicked", () => {
    render(<WorkflowEditor document={fixture(WITH_INFO)} />);
    const infos = screen.getByTestId("toolbar-infos");
    fireEvent.click(infos);
    expect(screen.getByTestId("issues-drawer")).toBeTruthy();
    expect(infos.getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles closed when the same badge is clicked twice", () => {
    render(<WorkflowEditor document={fixture(WITH_INFO)} />);
    const infos = screen.getByTestId("toolbar-infos");
    fireEvent.click(infos);
    fireEvent.click(infos);
    expect(screen.queryByTestId("issues-drawer")).toBeNull();
  });

  it("disables badges with a count of zero", () => {
    render(<WorkflowEditor document={fixture(WITH_INFO)} />);
    const errors = screen.getByTestId("toolbar-errors") as HTMLButtonElement;
    expect(errors.disabled).toBe(true);
  });
});
