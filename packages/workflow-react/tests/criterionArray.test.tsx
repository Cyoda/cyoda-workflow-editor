import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import {
  OPERATOR_GROUPS,
  SUPPORTED_SIMPLE_OPERATORS,
  parseImportPayload,
  type ArrayCriterion,
  type Criterion,
  type DomainPatch,
  type EntityFieldHintProvider,
  type EntityIdentity,
  type FieldHint,
} from "@cyoda/workflow-core";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";
import { TransitionForm } from "../src/inspector/TransitionForm.js";
import { FieldHintsProvider } from "../src/inspector/criteria/FieldHintsContext.js";

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

interface RenderOpts {
  hintProvider?: EntityFieldHintProvider;
  entity?: EntityIdentity | null;
}

function renderArray(criterion: ArrayCriterion, opts: RenderOpts = {}) {
  const doc = loadDoc(criterion);
  const workflow = doc.session.workflows[0]!;
  const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
  const transition = workflow.states["a"]!.transitions[0]!;
  const onDispatch = vi.fn<(patch: DomainPatch) => void>();

  const view = render(
    <I18nContext.Provider value={defaultMessages}>
      <FieldHintsProvider
        {...(opts.hintProvider ? { provider: opts.hintProvider } : {})}
        {...(opts.entity !== undefined ? { entity: opts.entity } : {})}
      >
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
      </FieldHintsProvider>
    </I18nContext.Provider>,
  );

  fireEvent.click(view.getByTestId("inspector-criterion-edit"));
  return { ...view, onDispatch };
}

function lastSetArrayCriterion(
  onDispatch: ReturnType<typeof vi.fn>,
): ArrayCriterion | undefined {
  const patches = onDispatch.mock.calls.map((c) => c[0] as DomainPatch);
  for (let i = patches.length - 1; i >= 0; i--) {
    const p = patches[i]!;
    if (p.op === "setCriterion" && p.criterion?.type === "array") {
      return p.criterion;
    }
  }
  return undefined;
}

afterEach(() => cleanup());

describe("ArrayCriterionFields", () => {
  it("operator dropdown offers only the 26 supported operators, grouped", () => {
    const { getByTestId } = renderArray({
      type: "array",
      jsonPath: "$.tags",
      operation: "EQUALS",
      value: ["a"],
    });
    const select = getByTestId("criterion-array-op") as HTMLSelectElement;
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

  it("recursive-descent jsonPath shows error and disables Apply", () => {
    const { getByTestId } = renderArray({
      type: "array",
      jsonPath: "$.tags",
      operation: "EQUALS",
      value: ["a"],
    });
    fireEvent.change(getByTestId("criterion-array-path"), {
      target: { value: "$..foo" },
    });
    expect(getByTestId("criterion-array-path-error").textContent).toBe(
      defaultMessages.criterion.jsonPathError["recursive-descent"],
    );
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Add / move-up / move-down / Apply produce the expected ordered value array", () => {
    const { getByTestId, onDispatch } = renderArray({
      type: "array",
      jsonPath: "$.tags",
      operation: "EQUALS",
      value: ["a", "b"],
    });
    // Add a third value via the input + Add button.
    fireEvent.change(getByTestId("criterion-array-new-item"), {
      target: { value: "c" },
    });
    fireEvent.click(getByTestId("criterion-array-add-item"));
    // Move "c" up so order becomes a, c, b.
    fireEvent.click(getByTestId("criterion-array-move-up-2"));
    // Move "a" down so order becomes c, a, b.
    fireEvent.click(getByTestId("criterion-array-move-down-0"));
    fireEvent.click(getByTestId("criterion-modal-apply"));
    expect(lastSetArrayCriterion(onDispatch)).toEqual({
      type: "array",
      jsonPath: "$.tags",
      operation: "EQUALS",
      value: ["c", "a", "b"],
    });
  });

  it("selecting a hint commits the chosen path on Apply", async () => {
    const hints: FieldHint[] = [
      { jsonPath: "$.tags", type: "array" },
      { jsonPath: "$.labels", type: "array", description: "All labels" },
    ];
    const provider: EntityFieldHintProvider = {
      listFieldPaths: vi.fn(async () => hints),
    };
    const { getByTestId, onDispatch } = renderArray(
      {
        type: "array",
        jsonPath: "$.tags",
        operation: "EQUALS",
        value: ["a"],
      },
      { hintProvider: provider, entity: { entityName: "Order", modelVersion: 1 } },
    );
    const input = getByTestId("criterion-array-path") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => expect(getByTestId("criterion-array-path-hint-1")).toBeTruthy());
    fireEvent.mouseDown(getByTestId("criterion-array-path-hint-1"));
    expect(input.value).toBe("$.labels");
    fireEvent.click(getByTestId("criterion-modal-apply"));
    const patches = onDispatch.mock.calls.map((c) => c[0] as DomainPatch);
    const last = patches.reverse().find(
      (p) => p.op === "setCriterion" && p.criterion?.type === "array",
    );
    expect(
      last && last.op === "setCriterion" ? last.criterion : null,
    ).toEqual({
      type: "array",
      jsonPath: "$.labels",
      operation: "EQUALS",
      value: ["a"],
    });
  });

  it("Remove drops the targeted value", () => {
    const { getByTestId, onDispatch } = renderArray({
      type: "array",
      jsonPath: "$.tags",
      operation: "EQUALS",
      value: ["a", "b", "c"],
    });
    fireEvent.click(getByTestId("criterion-array-remove-1"));
    fireEvent.click(getByTestId("criterion-modal-apply"));
    expect(lastSetArrayCriterion(onDispatch)).toEqual({
      type: "array",
      jsonPath: "$.tags",
      operation: "EQUALS",
      value: ["a", "c"],
    });
  });
});
