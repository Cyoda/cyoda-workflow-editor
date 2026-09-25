import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  parseEditorDocument,
  parseImportPayload,
  serializeEditorDocument,
  validateAll,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";

afterEach(cleanup);

const doc = parseImportPayload(
  JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.3",
        name: "wf",
        initialState: "NEW",
        active: true,
        states: { NEW: { transitions: [] } },
      },
    ],
  }),
).document!;

// A workflow with an unguarded automated self-loop — triggers the
// unguarded-automated-cycle warning unless allowCycles is set.
const cycleDoc = parseImportPayload(
  JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.3",
        name: "wf",
        initialState: "A",
        active: true,
        states: {
          A: {
            transitions: [
              { name: "loop", next: "A", manual: false, disabled: false },
            ],
          },
        },
      },
    ],
  }),
).document!;

test("a new workflow carries the dialect's schema tag, not a hardcoded 1.0", () => {
  let lastDoc: WorkflowEditorDocument | undefined;
  render(
    <WorkflowEditor
      document={doc}
      mode="editor"
      onChange={(next) => {
        lastDoc = next;
      }}
    />,
  );

  fireEvent.click(screen.getByTestId("tab-add"));

  const newWorkflow = lastDoc?.session.workflows.find((w) => w.name !== "wf");
  expect(newWorkflow).toBeTruthy();
  expect(newWorkflow!.version).toBe("1.4");
});

test("toggling allowCycles suppresses the cycle warning", () => {
  let lastDoc: WorkflowEditorDocument = cycleDoc;
  render(
    <WorkflowEditor
      document={cycleDoc}
      mode="editor"
      onChange={(next) => {
        lastDoc = next;
      }}
    />,
  );

  const issueCodes = () => validateAll(lastDoc).map((issue) => issue.code);

  // Positive case first: the warning actually fires while the toggle is off,
  // so the later assertion that it's gone is meaningful rather than vacuous.
  expect(issueCodes()).toContain("unguarded-automated-cycle");

  const checkbox = screen.getByTestId("toolbar-allow-cycles") as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  fireEvent.click(checkbox);

  expect(lastDoc.session.allowCycles).toBe(true);
  expect(issueCodes()).not.toContain("unguarded-automated-cycle");

  // And toggling back off brings it back — proves the checkbox drives the
  // suppression rather than the warning having been a one-shot fluke.
  fireEvent.click(checkbox);
  expect(lastDoc.session.allowCycles).toBe(false);
  expect(issueCodes()).toContain("unguarded-automated-cycle");
});

test("allowCycles survives a serialize/parse round trip", () => {
  let lastDoc: WorkflowEditorDocument = cycleDoc;
  render(
    <WorkflowEditor
      document={cycleDoc}
      mode="editor"
      onChange={(next) => {
        lastDoc = next;
      }}
    />,
  );

  fireEvent.click(screen.getByTestId("toolbar-allow-cycles"));
  expect(lastDoc.session.allowCycles).toBe(true);

  const wire = serializeEditorDocument(lastDoc);
  const reparsed = parseEditorDocument(wire);
  expect(reparsed.ok).toBe(true);
  expect(reparsed.document!.session.allowCycles).toBe(true);
});
