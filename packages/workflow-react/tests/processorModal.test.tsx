import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  parseImportPayload,
  type DomainPatch,
  type Processor,
  type WorkflowEditorDocument,
} from "@cyoda/workflow-core";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";
import { TransitionForm } from "../src/inspector/TransitionForm.js";

afterEach(() => cleanup());

function makeDocument(processors?: Processor[]): WorkflowEditorDocument {
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
                {
                  name: "go",
                  next: "done",
                  manual: false,
                  disabled: false,
                  ...(processors ? { processors } : {}),
                },
                {
                  name: "finish",
                  next: "done",
                  manual: false,
                  disabled: false,
                },
              ],
            },
            done: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

function renderTransitionForm(processors?: Processor[]) {
  const doc = makeDocument(processors);
  const workflow = doc.session.workflows[0]!;
  const transitionUuid = Object.entries(doc.meta.ids.transitions).find(
    ([, ptr]) => ptr.workflow === "wf" && ptr.state === "start",
  )?.[0];
  const processorUuids = Object.entries(doc.meta.ids.processors)
    .filter(([, ptr]) => ptr.transitionUuid === transitionUuid)
    .map(([uuid]) => uuid);
  const transition = workflow.states.start!.transitions[0]!;
  const onDispatch = vi.fn<(patch: DomainPatch) => void>();

  const view = render(
    <I18nContext.Provider value={defaultMessages}>
      <TransitionForm
        workflow={workflow}
        stateCode="start"
        transition={transition}
        transitionUuid={transitionUuid!}
        transitionIndex={0}
        processorUuids={processorUuids}
        anchors={undefined}
        disabled={false}
        onDispatch={onDispatch}
      />
    </I18nContext.Provider>,
  );

  return { ...view, doc, workflow, transitionUuid: transitionUuid!, processorUuids, onDispatch };
}

describe("processor modal UX", () => {
  it("shows a no-processors summary with add action", () => {
    renderTransitionForm();

    expect(screen.getByText("Processors")).toBeTruthy();
    expect(screen.getByText("No processors run on this transition.")).toBeTruthy();
    expect(screen.getByTestId("inspector-add-processor")).toBeTruthy();
  });

  it("opens the add processor modal and cancel does not mutate canonical state", () => {
    const { onDispatch, doc } = renderTransitionForm();
    const before = JSON.stringify(doc.session);

    fireEvent.click(screen.getByTestId("inspector-add-processor"));
    expect(screen.getByTestId("processor-editor-modal")).toBeTruthy();

    fireEvent.change(screen.getByTestId("processor-name-input"), {
      target: { value: "notify" },
    });
    fireEvent.click(screen.getByTestId("processor-modal-cancel"));

    expect(screen.queryByTestId("processor-editor-modal")).toBeNull();
    expect(onDispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(doc.session)).toBe(before);
  });

  it("adds an externalized processor with one patch on Apply", () => {
    const { onDispatch, transitionUuid } = renderTransitionForm();

    fireEvent.click(screen.getByTestId("inspector-add-processor"));
    fireEvent.change(screen.getByTestId("processor-name-input"), {
      target: { value: "notify" },
    });
    fireEvent.change(screen.getByTestId("processor-execution-mode"), {
      target: { value: "COMMIT_BEFORE_DISPATCH" },
    });
    // startNewTxOnDispatch checkbox removed from UI — not interactable
    fireEvent.change(screen.getByTestId("processor-tags-input"), {
      target: { value: "alpha, beta" },
    });
    // context textarea removed from UI — not interactable
    fireEvent.click(screen.getByTestId("processor-modal-apply"));

    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "addProcessor",
      transitionUuid,
      processor: {
        type: "externalized",
        name: "notify",
        executionMode: "COMMIT_BEFORE_DISPATCH",
        // startNewTxOnDispatch omitted — false by default, only included when true
        config: {
          calculationNodesTags: "alpha,beta",
          // context omitted — not set via form
        },
      },
    });
  });

  it("edits an externalized processor with one patch on Apply", () => {
    const { onDispatch, processorUuids } = renderTransitionForm([
      {
        type: "externalized",
        name: "notify",
        executionMode: "ASYNC_NEW_TX",
        config: { calculationNodesTags: "alpha", context: "ctx" },
      },
    ]);

    fireEvent.click(screen.getByTestId("processor-edit-0"));
    fireEvent.change(screen.getByTestId("processor-name-input"), {
      target: { value: "notify-updated" },
    });
    fireEvent.change(screen.getByTestId("processor-execution-mode"), {
      target: { value: "SYNC" },
    });
    fireEvent.click(screen.getByTestId("processor-modal-apply"));

    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: {
        type: "externalized",
        name: "notify-updated",
        executionMode: "SYNC",
        config: { calculationNodesTags: "alpha", context: "ctx" },
      },
    });
  });

  it("execution mode dropdown includes all four modes", () => {
    renderTransitionForm();

    fireEvent.click(screen.getByTestId("inspector-add-processor"));
    const select = screen.getByTestId("processor-execution-mode") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("COMMIT_BEFORE_DISPATCH");
    expect(values).toContain("ASYNC_NEW_TX");
    expect(values).toContain("ASYNC_SAME_TX");
    expect(values).toContain("SYNC");
    // startNewTxOnDispatch checkbox removed from UI
    expect(screen.queryByTestId("processor-start-new-tx")).toBeNull();
  });

  it("asyncResult toggles crossoverToAsyncMs availability", () => {
    renderTransitionForm();

    fireEvent.click(screen.getByTestId("inspector-add-processor"));
    const crossover = screen.getByTestId("processor-crossover-input") as HTMLInputElement;
    expect(crossover.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("processor-async-result"));
    expect((screen.getByTestId("processor-crossover-input") as HTMLInputElement).disabled).toBe(
      false,
    );
  });

  it("supports delete, duplicate, and reorder actions from the summary rows", () => {
    const { onDispatch, transitionUuid, processorUuids } = renderTransitionForm([
      { type: "externalized", name: "notify", executionMode: "SYNC", config: {} },
      { type: "externalized", name: "enrich", executionMode: "ASYNC_NEW_TX" },
    ]);

    fireEvent.click(screen.getByTestId("processor-delete-0"));
    fireEvent.click(screen.getByTestId("processor-duplicate-0"));
    fireEvent.click(screen.getByTestId("processor-move-down-0"));
    fireEvent.click(screen.getByTestId("processor-move-up-1"));

    expect(onDispatch).toHaveBeenNthCalledWith(1, {
      op: "removeProcessor",
      processorUuid: processorUuids[0],
    });
    expect(onDispatch).toHaveBeenNthCalledWith(2, {
      op: "addProcessor",
      transitionUuid,
      processor: { type: "externalized", name: "notify-copy", executionMode: "SYNC", config: {} },
      index: 1,
    });
    expect(onDispatch).toHaveBeenNthCalledWith(3, {
      op: "reorderProcessor",
      transitionUuid,
      processorUuid: processorUuids[0],
      toIndex: 1,
    });
    expect(onDispatch).toHaveBeenNthCalledWith(4, {
      op: "reorderProcessor",
      transitionUuid,
      processorUuid: processorUuids[1],
      toIndex: 0,
    });
  });
});
