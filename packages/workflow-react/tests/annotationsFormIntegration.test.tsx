import { afterEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { State, Workflow } from "@cyoda/workflow-core";
import { WorkflowForm } from "../src/inspector/WorkflowForm.js";
import { StateForm } from "../src/inspector/StateForm.js";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";

afterEach(cleanup);

const wf: Workflow = { version: "1.0", name: "wf", initialState: "NEW", active: true, states: { NEW: { transitions: [] } } };
const wrap = (ui: React.ReactNode) => render(<I18nContext.Provider value={defaultMessages}>{ui}</I18nContext.Provider>);

test("WorkflowForm: Add annotations dispatches setAnnotations for the workflow", () => {
  const onDispatch = vi.fn();
  wrap(<WorkflowForm workflow={wf} disabled={false} onDispatch={onDispatch} />);
  fireEvent.click(screen.getByTestId("inspector-annotations-add"));
  expect(onDispatch).toHaveBeenCalledWith({
    op: "setAnnotations",
    target: { kind: "workflow", workflow: "wf" },
    annotations: {},
  });
});

test("StateForm: annotations field renders above the Delete button", () => {
  const state: State = { transitions: [] };
  const onDispatch = vi.fn();
  wrap(
    <StateForm workflow={wf} stateCode="NEW" state={state} disabled={false} onDispatch={onDispatch} onRequestDelete={vi.fn()} />,
  );
  const add = screen.getByTestId("inspector-annotations-add");
  const del = screen.getByTestId("inspector-state-delete");
  // Add appears before Delete in document order.
  expect(add.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(add);
  expect(onDispatch).toHaveBeenCalledWith({
    op: "setAnnotations",
    target: { kind: "state", workflow: "wf", stateCode: "NEW" },
    annotations: {},
  });
});
