import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  OPERATOR_GROUPS,
  SUPPORTED_SIMPLE_OPERATORS,
  parseImportPayload,
  type Criterion,
  type DomainPatch,
  type LifecycleCriterion,
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

function renderLifecycle(criterion: LifecycleCriterion) {
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

function lastSetLifecycleCriterion(
  onDispatch: ReturnType<typeof vi.fn>,
): LifecycleCriterion | undefined {
  const patches = onDispatch.mock.calls.map((c) => c[0] as DomainPatch);
  for (let i = patches.length - 1; i >= 0; i--) {
    const p = patches[i]!;
    if (p.op === "setCriterion" && p.criterion?.type === "lifecycle") {
      return p.criterion;
    }
  }
  return undefined;
}

afterEach(() => cleanup());

describe("LifecycleCriterionFields", () => {
  it("operator dropdown offers only the 26 supported operators, grouped", () => {
    const { getByTestId } = renderLifecycle({
      type: "lifecycle",
      field: "state",
      operation: "EQUALS",
    });
    const select = getByTestId("criterion-lifecycle-op") as HTMLSelectElement;
    const optgroups = Array.from(select.querySelectorAll("optgroup"));
    expect(optgroups.map((g) => g.label)).toEqual(OPERATOR_GROUPS.map((g) => g.label));
    const enabledOptions = Array.from(select.querySelectorAll("option")).filter(
      (o) => !o.disabled,
    );
    expect(enabledOptions).toHaveLength(SUPPORTED_SIMPLE_OPERATORS.size);
    for (const opt of enabledOptions) {
      expect(SUPPORTED_SIMPLE_OPERATORS.has(opt.value as never)).toBe(true);
    }
  });

  it("field dropdown lists state, creationDate, previousTransition", () => {
    const { getByTestId } = renderLifecycle({
      type: "lifecycle",
      field: "state",
      operation: "EQUALS",
    });
    const select = getByTestId("criterion-lifecycle-field") as HTMLSelectElement;
    const ops = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(ops).toEqual(["state", "creationDate", "previousTransition"]);
  });

  it("legacy operator (IS_CHANGED) preserved as disabled option", () => {
    const { getByTestId } = renderLifecycle({
      type: "lifecycle",
      field: "state",
      operation: "IS_CHANGED",
      value: null,
    });
    const select = getByTestId("criterion-lifecycle-op") as HTMLSelectElement;
    const legacy = select.querySelector("option[disabled]") as HTMLOptionElement;
    expect(legacy).toBeTruthy();
    expect(legacy.value).toBe("IS_CHANGED");
    expect(legacy.textContent).toContain(defaultMessages.criterion.legacySuffix);
    expect(select.value).toBe("IS_CHANGED");
  });

  it("BETWEEN renders low/high; missing high disables Apply", () => {
    const { getByTestId, queryByTestId } = renderLifecycle({
      type: "lifecycle",
      field: "creationDate",
      operation: "EQUALS",
    });
    fireEvent.change(getByTestId("criterion-lifecycle-op"), {
      target: { value: "BETWEEN" },
    });
    expect(queryByTestId("criterion-lifecycle-value")).toBeNull();
    fireEvent.change(getByTestId("criterion-lifecycle-low"), { target: { value: "0" } });
    expect(queryByTestId("criterion-lifecycle-between-error")).toBeTruthy();
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("IS_NULL hides value input and dispatches without value field", () => {
    const { getByTestId, queryByTestId, onDispatch } = renderLifecycle({
      type: "lifecycle",
      field: "state",
      operation: "EQUALS",
    });
    fireEvent.change(getByTestId("criterion-lifecycle-op"), {
      target: { value: "IS_NULL" },
    });
    expect(queryByTestId("criterion-lifecycle-value")).toBeNull();
    expect(queryByTestId("criterion-lifecycle-value-ignored")).toBeTruthy();
    fireEvent.click(getByTestId("criterion-modal-apply"));
    expect(lastSetLifecycleCriterion(onDispatch)).toEqual({
      type: "lifecycle",
      field: "state",
      operation: "IS_NULL",
    });
  });

  it("EQUALS scalar dispatches setCriterion with parsed value", () => {
    const { getByTestId, onDispatch } = renderLifecycle({
      type: "lifecycle",
      field: "state",
      operation: "EQUALS",
    });
    fireEvent.change(getByTestId("criterion-lifecycle-value"), {
      target: { value: '"APPROVED"' },
    });
    fireEvent.click(getByTestId("criterion-modal-apply"));
    expect(lastSetLifecycleCriterion(onDispatch)).toEqual({
      type: "lifecycle",
      field: "state",
      operation: "EQUALS",
      value: "APPROVED",
    });
  });
});
