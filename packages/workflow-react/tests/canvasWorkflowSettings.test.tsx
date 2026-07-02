import { test, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkflowEditor } from "../src/index.js";
import { parseImportPayload } from "@cyoda/workflow-core";

afterEach(cleanup);

const doc = parseImportPayload(
  JSON.stringify({
    importMode: "MERGE",
    workflows: [{ version: "1.0", name: "wf", initialState: "NEW", active: true, states: { NEW: { transitions: [] } } }],
  }),
).document!;

test("workflow-settings button selects the workflow and shows the workflow form", () => {
  render(<WorkflowEditor document={doc} mode="editor" />);
  fireEvent.click(screen.getByTestId("canvas-workflow-settings"));
  expect(screen.getByTestId("inspector-workflow-name")).toBeTruthy();
});
