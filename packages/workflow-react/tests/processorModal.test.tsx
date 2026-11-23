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
          version: "1.3",
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
  });

  it("asyncResult toggles crossoverToAsyncMs availability", () => {
    renderTransitionForm();

    fireEvent.click(screen.getByTestId("inspector-add-processor"));
    const crossover = screen.getByTestId("processor-crossover-input") as HTMLInputElement;
    expect(crossover.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("processor-async-result"), { target: { value: "true" } });
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

// Spec §4a fixed these three in the serializer; the modal re-introduced them on
// the edit path, where opening and Applying a processor is enough to trigger
// them. Each test edits nothing but the name, so the assertion is purely about
// what an untouched round-trip through the form preserves.
describe("processor modal round-trip fidelity (spec §4a)", () => {
  const openEditAndApply = (onDispatch: () => void) => {
    fireEvent.click(screen.getByTestId("processor-edit-0"));
    fireEvent.click(screen.getByTestId("processor-modal-apply"));
    return onDispatch;
  };

  it("preserves an explicit attachEntity: false instead of collapsing it to absent", () => {
    // Absent means `true` to the server, so dropping an explicit `false`
    // inverts the user's setting. TransitionForm already models this as a
    // three-option select for schedule.function.attachEntity.
    const { onDispatch, processorUuids } = renderTransitionForm([
      {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        config: { attachEntity: false },
      },
    ]);

    openEditAndApply(onDispatch);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        config: { attachEntity: false },
      },
    });
  });

  it("keeps attachEntity absent when the source had none", () => {
    const { onDispatch, processorUuids } = renderTransitionForm([
      { type: "externalized", name: "notify", executionMode: "SYNC" },
    ]);

    openEditAndApply(onDispatch);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: { type: "externalized", name: "notify", executionMode: "SYNC" },
    });
  });

  it("offers attachEntity as a three-option select, not a checkbox", () => {
    renderTransitionForm([
      {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        config: { attachEntity: false },
      },
    ]);
    fireEvent.click(screen.getByTestId("processor-edit-0"));
    const select = screen.getByTestId("processor-attach-entity") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "true", "false"]);
    expect(select.value).toBe("false");
  });

  it("keeps crossoverToAsyncMs when asyncResult is not set", () => {
    // A document that parses with a `crossover-unsupported` warning (the field
    // set, asyncResult absent) currently loses the field on the next Apply.
    const { onDispatch, processorUuids } = renderTransitionForm([
      {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        config: { crossoverToAsyncMs: 500 },
      },
    ]);

    openEditAndApply(onDispatch);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        config: { crossoverToAsyncMs: 500 },
      },
    });
  });

  it("preserves an explicit startNewTxOnDispatch: false instead of collapsing it to absent", () => {
    // Same bug class as attachEntity (spec §4a / disagreement #3): an
    // explicit `false` is a real, distinct value from absent and must survive
    // an untouched Apply.
    const { onDispatch, processorUuids } = renderTransitionForm([
      {
        type: "externalized",
        name: "notify",
        executionMode: "COMMIT_BEFORE_DISPATCH",
        startNewTxOnDispatch: false,
      },
    ]);

    openEditAndApply(onDispatch);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: {
        type: "externalized",
        name: "notify",
        executionMode: "COMMIT_BEFORE_DISPATCH",
        startNewTxOnDispatch: false,
      },
    });
  });

  it("preserves startNewTxOnDispatch: true even when executionMode isn't COMMIT_BEFORE_DISPATCH", () => {
    // Invalid (flagged by the hard start-new-tx-without-commit-before-dispatch
    // error), but a migrated legacy document can carry exactly this
    // combination — Apply must not be what silently deletes it.
    const { onDispatch, processorUuids } = renderTransitionForm([
      {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        startNewTxOnDispatch: true,
      },
    ]);

    openEditAndApply(onDispatch);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        startNewTxOnDispatch: true,
      },
    });
  });

  it("preserves an explicit asyncResult: false instead of dropping it", () => {
    // Verified against the server: config: { asyncResult: false, ... }
    // survives a round trip; only `true` is rejected (spec §4a).
    const { onDispatch, processorUuids } = renderTransitionForm([
      {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        config: { asyncResult: false, calculationNodesTags: "t" },
      },
    ]);

    openEditAndApply(onDispatch);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        config: { asyncResult: false, calculationNodesTags: "t" },
      },
    });
  });

  it("blocks Apply for a negative responseTimeoutMs (cyoda-go 0.9.0 refuses it)", () => {
    const { onDispatch } = renderTransitionForm([
      {
        type: "externalized",
        name: "notify",
        executionMode: "SYNC",
        config: { responseTimeoutMs: -1 },
      },
    ]);

    fireEvent.click(screen.getByTestId("processor-edit-0"));
    expect(screen.getByTestId("processor-modal-error").textContent).toMatch(/greater than or equal to 0/);
    fireEvent.click(screen.getByTestId("processor-modal-apply"));
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it("does not fabricate an executionMode for a processor that had none", () => {
    // The serializer stopped inventing ASYNC_NEW_TX; SYNC is the documented
    // default at fire, so inventing a mode here both adds data and adds the
    // wrong value.
    const { onDispatch, processorUuids } = renderTransitionForm([
      { type: "externalized", name: "notify", config: { calculationNodesTags: "a" } },
    ]);

    openEditAndApply(onDispatch);
    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: {
        type: "externalized",
        name: "notify",
        config: { calculationNodesTags: "a" },
      },
    });
  });

  it("summarizes an absent executionMode as SYNC, the default at fire", () => {
    renderTransitionForm([{ type: "externalized", name: "notify" }]);
    expect(screen.getByText(/SYNC/)).toBeTruthy();
    expect(screen.queryByText(/ASYNC_NEW_TX/)).toBeNull();
  });
});

describe("processor modal with a non-canonical type (spec §1, task-4)", () => {
  it("shows a SCHEDULED processor's fields instead of a blank form", () => {
    const { processorUuids } = renderTransitionForm([
      { type: "SCHEDULED", name: "legacy-proc", executionMode: "SYNC" },
    ]);

    fireEvent.click(screen.getByTestId(`processor-edit-0`));
    expect(processorUuids).toHaveLength(1);
    expect((screen.getByTestId("processor-name-input") as HTMLInputElement).value).toBe(
      "legacy-proc",
    );
    expect(
      (screen.getByTestId("processor-execution-mode") as HTMLSelectElement).value,
    ).toBe("SYNC");
    expect(screen.getByTestId("processor-non-canonical-type-warning")).toBeTruthy();
  });

  it("renders every field disabled and does not let Apply rewrite the type", () => {
    const { onDispatch } = renderTransitionForm([{ type: "SCHEDULED", name: "legacy-proc" }]);

    fireEvent.click(screen.getByTestId("processor-edit-0"));
    // Every editable control is disabled — a real user cannot change a field.
    expect((screen.getByTestId("processor-name-input") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("processor-tags-input") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId("processor-async-result") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId("processor-modal-apply") as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByTestId("processor-modal-apply"));
    // Apply is disabled while read-only, so no patch is dispatched at all —
    // the type can't be rewritten because there's nothing to apply.
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it("names the reserved internalized type and says cyoda-go refuses it at import", () => {
    renderTransitionForm([{ type: "internalized", name: "p" }]);

    fireEvent.click(screen.getByTestId("processor-edit-0"));
    const text = screen.getByTestId("processor-non-canonical-type-warning").textContent ?? "";
    expect(text).toMatch(/"internalized"/);
    expect(text).toMatch(/refuses at import/);
  });

  it("treats an empty type as canonical and keeps the form editable", () => {
    const { onDispatch, processorUuids } = renderTransitionForm([
      { type: "", name: "legacy-empty", executionMode: "SYNC" },
    ]);

    fireEvent.click(screen.getByTestId("processor-edit-0"));
    expect(screen.queryByTestId("processor-non-canonical-type-warning")).toBeNull();
    expect((screen.getByTestId("processor-name-input") as HTMLInputElement).disabled).toBe(false);

    fireEvent.change(screen.getByTestId("processor-name-input"), {
      target: { value: "renamed" },
    });
    fireEvent.click(screen.getByTestId("processor-modal-apply"));

    expect(onDispatch).toHaveBeenCalledWith({
      op: "updateProcessor",
      processorUuid: processorUuids[0],
      updates: { type: "", name: "renamed", executionMode: "SYNC" },
    });
  });
});
