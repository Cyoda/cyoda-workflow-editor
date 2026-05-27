import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseImportPayload } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";
import { ModalFrame } from "../src/modals/DeleteStateModal.js";

function fixtureDoc() {
  const r = parseImportPayload(
    JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: { a: { transitions: [] } },
        },
      ],
    }),
  );
  if (!r.document) throw new Error("parse failed");
  return r.document;
}

afterEach(() => cleanup());

describe("accessibility", () => {
  it("ModalFrame has role=dialog + aria-modal + restores focus", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const onCancel = vi.fn();
    const { unmount } = render(
      <ModalFrame onCancel={onCancel}>
        <button>inner</button>
      </ModalFrame>,
    );

    const frame = screen.getByTestId("modal-frame");
    expect(frame.getAttribute("role")).toBe("dialog");
    expect(frame.getAttribute("aria-modal")).toBe("true");

    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it("ModalFrame cancels on Escape", () => {
    const onCancel = vi.fn();
    render(
      <ModalFrame onCancel={onCancel}>
        <input data-testid="inner" />
      </ModalFrame>,
    );
    fireEvent.keyDown(screen.getByTestId("modal-backdrop"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("validation pills announce count via role=status", () => {
    render(<WorkflowEditor document={fixtureDoc()} />);
    const errs = screen.getByTestId("toolbar-errors");
    // The pill is now a <button> wrapped in a role=status region so a screen
    // reader announces count changes while the badge remains keyboard-clickable.
    const region = errs.closest("[role='status']");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(errs.tagName).toBe("BUTTON");
  });

  it("Cmd/Ctrl+S invokes onSave when valid + not read-only", () => {
    const onSave = vi.fn();
    render(<WorkflowEditor document={fixtureDoc()} onSave={onSave} />);
    const shell = screen.getByTestId("workflow-editor");
    fireEvent.keyDown(shell, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("Cmd/Ctrl+Z is no-op when undo stack empty", () => {
    render(<WorkflowEditor document={fixtureDoc()} />);
    const shell = screen.getByTestId("workflow-editor");
    // should not throw
    fireEvent.keyDown(shell, { key: "z", ctrlKey: true });
    const undo = screen.getByTestId("canvas-undo") as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
  });
});
