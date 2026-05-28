import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  parseImportPayload,
  type Criterion,
  type DomainPatch,
  type FunctionCriterion,
} from "@cyoda/workflow-core";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";
import { TransitionForm } from "../src/inspector/TransitionForm.js";

function loadDoc(criterion: Criterion) {
  const { document } = parseImportPayload(
    JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: {
            a: {
              transitions: [
                {
                  name: "go",
                  next: "b",
                  manual: false,
                  disabled: false,
                  criterion,
                },
              ],
            },
            b: { transitions: [] },
          },
        },
      ],
    }),
  );
  if (!document) throw new Error("fixture parse failed");
  return document;
}

function renderFunction(criterion: FunctionCriterion) {
  const doc = loadDoc(criterion);
  const workflow = doc.session.workflows[0]!;
  const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
  const transition = workflow.states["a"]!.transitions[0]!;
  const onDispatch = vi.fn<(patch: DomainPatch) => void>();

  const view = render(
    <I18nContext.Provider value={defaultMessages}>
      <TransitionForm
        workflow={workflow}
        stateCode="a"
        transition={transition}
        transitionUuid={uuid}
        transitionIndex={0}
        processorUuids={[]}
        anchors={undefined}
        disabled={false}
        onDispatch={onDispatch}
      />
    </I18nContext.Provider>,
  );

  fireEvent.click(view.getByTestId("inspector-criterion-edit"));
  return { ...view, onDispatch };
}

function lastSetFunctionCriterion(
  onDispatch: ReturnType<typeof vi.fn>,
): FunctionCriterion | undefined {
  const patches = onDispatch.mock.calls.map((c) => c[0] as DomainPatch);
  for (let i = patches.length - 1; i >= 0; i--) {
    const p = patches[i]!;
    if (p.op === "setCriterion" && p.criterion?.type === "function") {
      return p.criterion;
    }
  }
  return undefined;
}

afterEach(() => cleanup());

describe("FunctionCriterionFields", () => {
  it("empty function name renders inline error and disables Apply", () => {
    const { getByTestId } = renderFunction({
      type: "function",
      function: { name: "ok" },
    });
    fireEvent.change(getByTestId("criterion-fn-name"), { target: { value: "" } });
    expect(getByTestId("criterion-fn-name-error").textContent).toBe(
      defaultMessages.criterion.function.nameEmpty,
    );
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("invalid function name (starts with digit) renders inline error and disables Apply", () => {
    const { getByTestId } = renderFunction({
      type: "function",
      function: { name: "ok" },
    });
    fireEvent.change(getByTestId("criterion-fn-name"), { target: { value: "9bad" } });
    expect(getByTestId("criterion-fn-name-error").textContent).toBe(
      defaultMessages.criterion.function.nameInvalid,
    );
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("valid name + valid JSON config dispatches setCriterion with parsed config", () => {
    const { getByTestId, onDispatch } = renderFunction({
      type: "function",
      function: { name: "stub" },
    });
    fireEvent.change(getByTestId("criterion-fn-name"), {
      target: { value: "computeRisk" },
    });
    fireEvent.change(getByTestId("criterion-fn-config"), {
      target: { value: '{"attachEntity":true}' },
    });
    fireEvent.click(getByTestId("criterion-modal-apply"));
    const next = lastSetFunctionCriterion(onDispatch);
    expect(next).toEqual({
      type: "function",
      function: {
        name: "computeRisk",
        config: { attachEntity: true },
      },
    });
  });

  it("invalid JSON config shows inline error and disables Apply", () => {
    const { getByTestId } = renderFunction({
      type: "function",
      function: { name: "stub" },
    });
    fireEvent.change(getByTestId("criterion-fn-config"), {
      target: { value: "{not-json" },
    });
    expect(getByTestId("criterion-fn-config-error").textContent).toBe(
      defaultMessages.criterion.function.configInvalid,
    );
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Add pre-check criterion stays draft-only until modal Apply", () => {
    const { getByTestId, onDispatch } = renderFunction({
      type: "function",
      function: { name: "stub" },
    });
    fireEvent.click(getByTestId("criterion-fn-precheck-add"));
    expect(onDispatch).not.toHaveBeenCalled();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.precheck" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "ok" },
    });
    fireEvent.click(getByTestId("criterion-modal-apply"));
    const next = lastSetFunctionCriterion(onDispatch);
    expect(next).toEqual({
      type: "function",
      function: {
        name: "stub",
        criterion: { type: "simple", jsonPath: "$.precheck", operation: "EQUALS", value: "ok" },
      },
    });
  });

  it("Remove pre-check criterion stays draft-only until modal Apply", () => {
    const { getByTestId, onDispatch } = renderFunction({
      type: "function",
      function: {
        name: "stub",
        criterion: { type: "simple", jsonPath: "$.x", operation: "EQUALS", value: 1 },
      },
    });
    fireEvent.click(getByTestId("criterion-fn-precheck-remove"));
    expect(onDispatch).not.toHaveBeenCalled();
    fireEvent.click(getByTestId("criterion-modal-apply"));
    const next = lastSetFunctionCriterion(onDispatch);
    expect(next).toEqual({
      type: "function",
      function: { name: "stub" },
    });
  });
});
