import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  parseImportPayload,
  type DomainPatch,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";
import { TransitionForm } from "../src/inspector/TransitionForm.js";
import { WorkflowEditor } from "../src/index.js";
import type { CanvasProps } from "../src/components/Canvas.js";

let latestCanvasProps: CanvasProps | undefined;
let currentDoc: WorkflowEditorDocument | undefined;

vi.mock("../src/components/Canvas.js", () => ({
  Canvas: (props: CanvasProps) => {
    latestCanvasProps = props;
    return (
      <div data-testid="mock-canvas">
        <button
          type="button"
          data-testid="select-auto-transition"
          onClick={() =>
            latestCanvasProps?.onSelectionChange({
              kind: "transition",
              transitionUuid: transitionId("wf", "start", "auto"),
            })
          }
        >
          select auto
        </button>
        <button
          type="button"
          data-testid="select-guarded-transition"
          onClick={() =>
            latestCanvasProps?.onSelectionChange({
              kind: "transition",
              transitionUuid: transitionId("wf", "start", "guarded"),
            })
          }
        >
          select guarded
        </button>
        {props.onUndo && (
          <button
            type="button"
            data-testid="canvas-undo"
            disabled={!props.canUndo}
            onClick={() => props.onUndo?.()}
          >
            Undo
          </button>
        )}
      </div>
    );
  },
}));

function fixtureDoc(): WorkflowEditorDocument {
  const result = parseImportPayload(
    JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "start",
          active: true,
          states: {
            start: {
              transitions: [
                { name: "auto", next: "done", manual: false, disabled: false },
                {
                  name: "guarded",
                  next: "done",
                  manual: false,
                  disabled: false,
                  criterion: {
                    type: "simple",
                    jsonPath: "$.status",
                    operation: "EQUALS",
                    value: "READY",
                  },
                },
              ],
            },
            done: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture failed");
  return result.document;
}

function transitionId(workflow: string, state: string, transitionName: string): string {
  if (!currentDoc) throw new Error("No current document");
  const wf = currentDoc.session.workflows.find((candidate) => candidate.name === workflow);
  const index = wf?.states[state]?.transitions.findIndex((t) => t.name === transitionName) ?? -1;
  if (index < 0) throw new Error(`Missing transition ${transitionName}`);
  const ids = Object.entries(currentDoc.meta.ids.transitions).filter(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === state,
  );
  return ids[index]![0];
}

function renderTransitionForm({
  manual,
  criterion,
}: {
  manual: boolean;
  criterion?: NonNullable<
    WorkflowEditorDocument["session"]["workflows"][number]["states"][string]["transitions"][number]["criterion"]
  >;
}) {
  const doc = fixtureDoc();
  const workflow = doc.session.workflows[0]!;
  const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;
  const transition = {
    name: "auto",
    next: "done",
    manual,
    disabled: false,
    ...(criterion ? { criterion } : {}),
  };
  const onDispatch = vi.fn<(patch: DomainPatch) => void>();
  return {
    ...render(
      <I18nContext.Provider value={defaultMessages}>
        <TransitionForm
          workflow={workflow}
          stateCode="start"
          transition={transition}
          transitionUuid={transitionUuid}
          transitionIndex={0}
          processorUuids={[]}
          anchors={undefined}
          disabled={false}
          onDispatch={onDispatch}
        />
      </I18nContext.Provider>,
    ),
    onDispatch,
  };
}

afterEach(() => {
  latestCanvasProps = undefined;
  currentDoc = undefined;
  cleanup();
});

describe("criterion modal UX", () => {
  it("shows compact no-criterion copy and automated warning", () => {
    const view = renderTransitionForm({ manual: false });
    expect(view.getByText(defaultMessages.criterion.noneAutomated)).toBeTruthy();
    expect(view.getByTestId("criterion-automated-warning").textContent).toBe(
      defaultMessages.criterion.noneAutomatedWarning,
    );
    expect(view.getByTestId("inspector-criterion-add").textContent).toBe(
      defaultMessages.criterion.add,
    );
  });

  it("shows compact no-criterion copy for manual transitions", () => {
    const view = renderTransitionForm({ manual: true });
    expect(view.getByText(defaultMessages.criterion.noneManual)).toBeTruthy();
    expect(view.queryByTestId("criterion-automated-warning")).toBeNull();
  });

  it("shows existing criterion summary with clear edit/remove actions", () => {
    const view = renderTransitionForm({
      manual: false,
      criterion: {
        type: "lifecycle",
        field: "previousTransition",
        operation: "EQUALS",
        value: "CLEARED_AT_LCH",
      },
    });
    expect(view.getByText("lifecycle")).toBeTruthy();
    expect(view.getByText("previousTransition is CLEARED_AT_LCH")).toBeTruthy();
    expect(view.getByTestId("inspector-criterion-edit").textContent).toBe(
      defaultMessages.criterion.edit,
    );
    expect(view.getByTestId("inspector-criterion-remove").textContent).toBe(
      defaultMessages.criterion.remove,
    );
    expect(view.queryByTestId("criterion-type-select")).toBeNull();
    expect(view.queryByTestId("criterion-modal-apply")).toBeNull();
    expect(view.queryByTestId("criterion-lifecycle-field")).toBeNull();
    expect(view.queryByTestId("criterion-lifecycle-op")).toBeNull();
  });

  it("opens the full editor in a modal and returns to the compact card on Cancel", () => {
    const view = renderTransitionForm({
      manual: false,
      criterion: {
        type: "simple",
        jsonPath: "$.status",
        operation: "EQUALS",
        value: "READY",
      },
    });

    expect(view.queryByTestId("criterion-type-select")).toBeNull();
    expect(view.queryByTestId("criterion-simple-op")).toBeNull();
    expect(view.queryByTestId("criterion-modal-apply")).toBeNull();

    fireEvent.click(view.getByTestId("inspector-criterion-edit"));
    expect(view.getByTestId("criterion-editor-modal")).toBeTruthy();
    expect(view.queryByTestId("criterion-type-select")).toBeNull();
    expect(view.getByTestId("criterion-builder")).toBeTruthy();
    expect(view.getByTestId("criterion-simple-op")).toBeTruthy();
    expect(view.getByTestId("criterion-modal-apply")).toBeTruthy();

    fireEvent.click(view.getByTestId("criterion-modal-cancel"));
    expect(view.queryByTestId("criterion-editor-modal")).toBeNull();
    expect(view.getByTestId("criterion-summary-card")).toBeTruthy();
    expect(view.queryByTestId("criterion-type-select")).toBeNull();
    expect(view.queryByTestId("criterion-modal-apply")).toBeNull();
  });

  it("shows the group composer with AND/OR match controls and child condition actions", () => {
    const view = renderTransitionForm({
      manual: false,
      criterion: {
        type: "group",
        operator: "AND",
        conditions: [
          { type: "simple", jsonPath: "$.status", operation: "EQUALS", value: "READY" },
          {
            type: "function",
            function: { name: "AreAllRateFixingsObserved" },
          },
        ],
      },
    });

    fireEvent.click(view.getByTestId("inspector-criterion-edit"));

    expect(view.getByText("Group criterion")).toBeTruthy();
    expect(view.getByText("Match")).toBeTruthy();
    expect(view.getByTestId("criterion-group-and").textContent).toBe("All conditions (AND)");
    expect(view.getByTestId("criterion-group-or").textContent).toBe("Any condition (OR)");
    expect(view.getByTestId("criterion-group-add-condition").textContent).toBe(
      "+ Add condition",
    );
    expect(view.getByTestId("criterion-group-add-group").textContent).toBe("+ Add group");
    expect(view.getByText("1")).toBeTruthy();
    expect(view.getByText("$.status is READY")).toBeTruthy();
    expect(view.queryByTestId("criterion-group-editor-0")).toBeNull();
    expect(view.getByTestId("criterion-group-edit-0").textContent).toBe("Edit");
    expect(view.getByTestId("criterion-group-duplicate-0").textContent).toBe("Duplicate");
    expect(view.getByTestId("criterion-group-remove-0").textContent).toBe("Remove");
    fireEvent.click(view.getByTestId("criterion-group-edit-0"));
    expect(view.getByTestId("criterion-group-editor-0")).toBeTruthy();
    expect(view.getByTestId("criterion-group-edit-0").textContent).toBe("Editing");
  });

  it("keeps raw JSON invalid drafts local and disables modal Apply", () => {
    const view = renderTransitionForm({ manual: false });
    fireEvent.click(view.getByTestId("inspector-criterion-add"));
    expect(view.queryByTestId("criterion-edit-json")).toBeNull();
    const advancedToggle = view.getByTestId("criterion-advanced-toggle");
    expect(advancedToggle.textContent?.trim()).toBe(defaultMessages.criterion.advanced);
    expect(advancedToggle.querySelector("svg")?.style.transform).toBe("rotate(-90deg)");
    fireEvent.click(advancedToggle);
    expect(advancedToggle.textContent?.trim()).toBe(defaultMessages.criterion.advanced);
    expect(advancedToggle.querySelector("svg")?.style.transform).toBe("rotate(0deg)");
    fireEvent.click(view.getByTestId("criterion-edit-json"));
    fireEvent.change(view.getByTestId("criterion-json-editor"), {
      target: { value: "{not-json" },
    });
    expect(view.getByTestId("criterion-json-error").textContent).toBe(
      defaultMessages.criterion.invalidJson,
    );
    expect((view.getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(true);
    expect(view.onDispatch).not.toHaveBeenCalled();
  });

  it("applies one criterion patch, updates the graph badge, preserves selection, and undo restores previous state", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-auto-transition"));
    expect((screen.getByTestId("inspector-transition-name") as HTMLInputElement).value).toBe("auto");

    fireEvent.click(screen.getByTestId("inspector-criterion-add"));
    fireEvent.change(screen.getByTestId("criterion-simple-path"), {
      target: { value: "$.status" },
    });
    fireEvent.change(screen.getByTestId("criterion-simple-value"), {
      target: { value: '"READY"' },
    });
    fireEvent.click(screen.getByTestId("criterion-modal-apply"));

    expect((screen.getByTestId("inspector-transition-name") as HTMLInputElement).value).toBe("auto");
    const edge = latestCanvasProps?.graph.edges.find((candidate) => candidate.id === transitionId("wf", "start", "auto"));
    expect(edge && edge.kind === "transition" ? edge.summary.criterion?.kind : undefined).toBe("simple");

    fireEvent.click(screen.getByTestId("canvas-undo"));
    const reverted = latestCanvasProps?.graph.edges.find((candidate) => candidate.id === transitionId("wf", "start", "auto"));
    expect(reverted && reverted.kind === "transition" ? reverted.summary.criterion : undefined).toBeUndefined();
  });

  it("cancels draft edits without changing graph summary or selected transition", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-guarded-transition"));
    fireEvent.click(screen.getByTestId("inspector-criterion-edit"));
    fireEvent.change(screen.getByTestId("criterion-simple-path"), {
      target: { value: "$.changed" },
    });
    fireEvent.click(screen.getByTestId("criterion-modal-cancel"));

    expect((screen.getByTestId("inspector-transition-name") as HTMLInputElement).value).toBe("guarded");
    const edge = latestCanvasProps?.graph.edges.find((candidate) => candidate.id === transitionId("wf", "start", "guarded"));
    expect(edge && edge.kind === "transition" ? edge.summary.criterion?.path : undefined).toBe("$.status");
  });

  it("Cancel after adding an invalid condition leaves canonical criterion unchanged", () => {
    currentDoc = fixtureDoc();
    render(<WorkflowEditor document={currentDoc} mode="editor" />);

    fireEvent.click(screen.getByTestId("select-guarded-transition"));
    fireEvent.click(screen.getByTestId("inspector-criterion-edit"));
    fireEvent.click(screen.getByTestId("criterion-wrap-and"));
    fireEvent.click(screen.getByTestId("criterion-modal-cancel"));

    const edge = latestCanvasProps?.graph.edges.find((candidate) => candidate.id === transitionId("wf", "start", "guarded"));
    expect(edge && edge.kind === "transition" ? edge.summary.criterion?.path : undefined).toBe("$.status");
  });

  it("remove criterion dispatches one clear patch from the compact card", () => {
    const view = renderTransitionForm({
      manual: false,
      criterion: { type: "simple", jsonPath: "$.status", operation: "EQUALS", value: "READY" },
    });
    fireEvent.click(view.getByTestId("inspector-criterion-remove"));
    expect(view.onDispatch).toHaveBeenCalledTimes(1);
    expect(view.onDispatch.mock.calls[0]![0]).toMatchObject({
      op: "setCriterion",
      criterion: undefined,
    });
  });
});
