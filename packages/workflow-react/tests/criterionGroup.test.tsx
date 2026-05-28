import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import {
  parseImportPayload,
  type Criterion,
  type DomainPatch,
  type GroupCriterion,
} from "@cyoda/workflow-core";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";
import { TransitionForm } from "../src/inspector/TransitionForm.js";

const SIMPLE_A: Criterion = {
  type: "simple",
  jsonPath: "$.a",
  operation: "EQUALS",
  value: 1,
};
const SIMPLE_B: Criterion = {
  type: "simple",
  jsonPath: "$.b",
  operation: "EQUALS",
  value: 2,
};
const SIMPLE_C: Criterion = {
  type: "simple",
  jsonPath: "$.c",
  operation: "EQUALS",
  value: 3,
};

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

function renderGroup(criterion: GroupCriterion) {
  return renderEditor(criterion);
}

function renderEditor(criterion: Criterion) {
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

function lastSetCriterion(
  onDispatch: ReturnType<typeof vi.fn>,
): GroupCriterion | undefined {
  const patches = onDispatch.mock.calls.map((c) => c[0] as DomainPatch);
  for (let i = patches.length - 1; i >= 0; i--) {
    const p = patches[i]!;
    if (p.op === "setCriterion" && p.criterion?.type === "group") {
      return p.criterion;
    }
  }
  return undefined;
}

function applyModal(getByTestId: ReturnType<typeof render>["getByTestId"]) {
  fireEvent.click(getByTestId("criterion-modal-apply"));
}

afterEach(() => cleanup());

describe("GroupCriterionFields", () => {
  it("renders segmented AND/OR controls for a fresh group", () => {
    const { getByTestId } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B],
    });
    expect(getByTestId("criterion-group-and").textContent).toBe("All conditions (AND)");
    expect(getByTestId("criterion-group-or").textContent).toBe("Any condition (OR)");
    expect(getByTestId("criterion-group-add-condition").textContent).toBe("+ Add condition");
    expect(getByTestId("criterion-group-add-group").textContent).toBe("+ Add group");
  });

  it("preserves legacy NOT as a warning, allows switching to OR on Apply", () => {
    const { getByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "NOT",
      conditions: [SIMPLE_A],
    });
    expect(getByTestId("criterion-group-legacy-operator").textContent).toContain(
      defaultMessages.criterion.legacyNotBanner,
    );

    fireEvent.click(getByTestId("criterion-group-or"));
    expect(onDispatch).not.toHaveBeenCalled();
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next).toEqual({
      type: "group",
      operator: "OR",
      conditions: [SIMPLE_A],
    });
  });

  it("operator change stays draft-only until modal Apply", () => {
    const { getByTestId, queryByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B],
    });
    expect(queryByTestId("criterion-group-apply")).toBeNull();
    fireEvent.click(getByTestId("criterion-group-or"));
    expect(onDispatch).not.toHaveBeenCalled();
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next?.operator).toBe("OR");
    expect(next?.conditions).toEqual([SIMPLE_A, SIMPLE_B]);
  });

  it("Add condition appends, expands, and focuses a default simple", () => {
    const { getByTestId, getAllByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A],
    });
    fireEvent.click(getByTestId("criterion-group-add-condition"));
    expect(getByTestId("criterion-group-editor-1")).toBeTruthy();
    expect(getByTestId("criterion-group-edit-1").textContent).toBe("Complete condition");
    expect(getByTestId("criterion-rule-done-criterion.conditions.1").textContent).toBe(
      "Done",
    );
    expect(document.activeElement).toBe(getAllByTestId("criterion-simple-path").at(-1));
    expect(getByTestId("criterion-group-row-error-1").textContent).toContain("Path is required");
    expect(onDispatch).not.toHaveBeenCalled();
    fireEvent.change(getAllByTestId("criterion-simple-path").at(-1)!, {
      target: { value: "$.new" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "10" },
    });
    applyModal(getByTestId);
    expect(onDispatch).toHaveBeenCalledTimes(1);
    const next = lastSetCriterion(onDispatch);
    expect(next?.conditions).toHaveLength(2);
    expect(next?.conditions[1]).toEqual({
      type: "simple",
      jsonPath: "$.new",
      operation: "EQUALS",
      value: 10,
    });
  });

  it("Cancel after adding a condition leaves the canonical criterion unchanged", () => {
    const { getByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A],
    });
    fireEvent.click(getByTestId("criterion-group-add-condition"));
    fireEvent.click(getByTestId("criterion-modal-cancel"));
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it("clicking an invalid row opens it for editing", () => {
    const { getByTestId, queryByTestId } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A],
    });
    fireEvent.click(getByTestId("criterion-group-add-condition"));
    fireEvent.click(getByTestId("criterion-group-edit-0"));
    expect(queryByTestId("criterion-group-editor-1")).toBeNull();

    fireEvent.click(getByTestId("criterion-group-row-1"));

    expect(getByTestId("criterion-group-editor-1")).toBeTruthy();
    expect(getByTestId("criterion-simple-path-error").textContent).toBe("Path is required.");
  });

  it("Done collapses the expanded editor while keeping draft summary changes", () => {
    const { getByTestId, queryByTestId } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B],
    });

    fireEvent.click(getByTestId("criterion-group-edit-1"));
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "22" },
    });
    fireEvent.click(getByTestId("criterion-rule-done-criterion.conditions.1"));

    expect(queryByTestId("criterion-group-editor-1")).toBeNull();
    expect(getByTestId("criterion-group-summary-1").textContent).toContain("$.b is 22");
    expect(getByTestId("criterion-editor-modal")).toBeTruthy();
  });

  it("keeps a top-level condition expanded when its operator changes", () => {
    const { getByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B],
    });

    fireEvent.click(getByTestId("criterion-group-edit-1"));
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "GREATER_THAN" },
    });

    expect(getByTestId("criterion-group-editor-1")).toBeTruthy();
    expect(getByTestId("criterion-simple-path")).toBeTruthy();
    expect(getByTestId("criterion-simple-value")).toBeTruthy();
    expect(getByTestId("criterion-editor-modal")).toBeTruthy();
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it("keeps a newly added nested condition expanded when its operator changes", () => {
    const { getByTestId, getAllByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A],
    });

    fireEvent.click(getByTestId("criterion-group-add-group"));
    const nestedGroup = getByTestId("criterion-group-nested-criterion.conditions.1");
    fireEvent.click(within(nestedGroup).getByTestId("criterion-group-add-condition"));
    expect(getByTestId("criterion-group-editor-0")).toBeTruthy();
    fireEvent.change(getAllByTestId("criterion-simple-path").at(-1)!, {
      target: { value: "$.amount" },
    });
    fireEvent.change(getAllByTestId("criterion-simple-op").at(-1)!, {
      target: { value: "GREATER_THAN" },
    });

    expect(getByTestId("criterion-group-editor-0")).toBeTruthy();
    expect(getAllByTestId("criterion-simple-path").at(-1)).toBeTruthy();
    expect(getAllByTestId("criterion-simple-value").at(-1)).toBeTruthy();
    expect(getByTestId("criterion-editor-modal")).toBeTruthy();
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it("keeps the editor expanded while operator value shapes change", () => {
    const { getByTestId, queryByTestId } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A],
    });

    fireEvent.click(getByTestId("criterion-group-edit-0"));
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "BETWEEN" },
    });
    expect(getByTestId("criterion-group-editor-0")).toBeTruthy();
    expect(getByTestId("criterion-simple-low")).toBeTruthy();
    expect(getByTestId("criterion-simple-high")).toBeTruthy();

    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "IS_NULL" },
    });
    expect(getByTestId("criterion-group-editor-0")).toBeTruthy();
    expect(queryByTestId("criterion-simple-value")).toBeNull();
    expect(queryByTestId("criterion-simple-low")).toBeNull();
    expect(queryByTestId("criterion-simple-high")).toBeNull();

    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "EQUALS" },
    });
    expect(getByTestId("criterion-group-editor-0")).toBeTruthy();
    expect(getByTestId("criterion-simple-value")).toBeTruthy();
  });

  it("renders AND connector chips between sibling rows and updates to OR", () => {
    const { getByTestId, queryAllByTestId } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B, SIMPLE_C],
    });

    expect(queryAllByTestId(/criterion-group-connector-/)).toHaveLength(2);
    expect(getByTestId("criterion-group-connector-0").textContent).toBe("AND");
    expect(getByTestId("criterion-group-connector-1").textContent).toBe("AND");

    fireEvent.click(getByTestId("criterion-group-or"));

    expect(getByTestId("criterion-group-connector-0").textContent).toBe("OR");
    expect(getByTestId("criterion-group-connector-1").textContent).toBe("OR");
  });

  it("only the selected condition expands and the readable summary updates while editing", () => {
    const { getByTestId, queryByTestId } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B],
    });
    expect(queryByTestId("criterion-group-editor-0")).toBeNull();
    expect(queryByTestId("criterion-group-editor-1")).toBeNull();

    fireEvent.click(getByTestId("criterion-group-edit-0"));
    expect(getByTestId("criterion-group-editor-0")).toBeTruthy();
    expect(queryByTestId("criterion-group-editor-1")).toBeNull();
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "10" },
    });
    expect(getByTestId("criterion-group-summary-0").textContent).toContain(
      "$.a is 10",
    );

    fireEvent.click(getByTestId("criterion-group-edit-1"));
    expect(queryByTestId("criterion-group-editor-0")).toBeNull();
    expect(getByTestId("criterion-group-editor-1")).toBeTruthy();
  });

  it("Add group appends a nested group draft only", () => {
    const { getByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A],
    });
    fireEvent.click(getByTestId("criterion-group-add-group"));
    expect(onDispatch).not.toHaveBeenCalled();
    expect(getByTestId("criterion-group-editor-1")).toBeTruthy();
    expect(getByTestId("criterion-group-nested-criterion.conditions.1")).toBeTruthy();
    expect(getByTestId("criterion-group-empty-criterion.conditions.1").textContent).toContain(
      "No conditions yet. Add a condition or nested group.",
    );
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next?.conditions[1]).toEqual({
      type: "group",
      operator: "AND",
      conditions: [],
    });
  });

  it("Remove condition drops the targeted index", () => {
    const { getByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B, SIMPLE_C],
    });
    fireEvent.click(getByTestId("criterion-group-remove-1"));
    expect(onDispatch).not.toHaveBeenCalled();
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next?.conditions).toEqual([SIMPLE_A, SIMPLE_C]);
  });

  it("Move up swaps with previous; disabled at index 0", () => {
    const { getByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B, SIMPLE_C],
    });
    expect((getByTestId("criterion-group-move-up-0") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(getByTestId("criterion-group-move-up-2"));
    expect(onDispatch).not.toHaveBeenCalled();
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next?.conditions).toEqual([SIMPLE_A, SIMPLE_C, SIMPLE_B]);
  });

  it("Move down swaps with next; disabled at last index", () => {
    const { getByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B, SIMPLE_C],
    });
    expect(
      (getByTestId("criterion-group-move-down-2") as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(getByTestId("criterion-group-move-down-0"));
    expect(onDispatch).not.toHaveBeenCalled();
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next?.conditions).toEqual([SIMPLE_B, SIMPLE_A, SIMPLE_C]);
  });

  it("Duplicate inserts a structural clone after the targeted index", () => {
    const { getByTestId, onDispatch } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A, SIMPLE_B],
    });
    fireEvent.click(getByTestId("criterion-group-duplicate-0"));
    expect(onDispatch).not.toHaveBeenCalled();
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next?.conditions).toEqual([SIMPLE_A, SIMPLE_A, SIMPLE_B]);
    // Clone must be a distinct object so further edits don't double-mutate.
    expect(next?.conditions[0]).not.toBe(next?.conditions[1]);
  });

  it("Depth banner appears once a group renders at depth ≥ 5", () => {
    // CriterionSection mounts CriterionForm at depth 0, so a 6-level nested
    // group tree puts the innermost group's GroupCriterionFields at depth 5.
    let inner: Criterion = SIMPLE_A;
    for (let i = 0; i < 6; i++) {
      inner = { type: "group", operator: "AND", conditions: [inner] };
    }
    const view = renderGroup(inner as GroupCriterion);
    for (let i = 0; i < 5; i++) {
      fireEvent.click(view.getAllByTestId("criterion-group-edit-0").at(-1)!);
    }
    const banners = view.queryAllByTestId("criterion-group-depth-warning");
    expect(banners.length).toBeGreaterThan(0);
  });

  it("Depth banner is absent at depth < 5", () => {
    let inner: Criterion = SIMPLE_A;
    for (let i = 0; i < 3; i++) {
      inner = { type: "group", operator: "AND", conditions: [inner] };
    }
    const { container } = renderGroup(inner as GroupCriterion);
    const banners = container.querySelectorAll(
      '[data-testid="criterion-group-depth-warning"]',
    );
    expect(banners.length).toBe(0);
  });
});

describe("Wrap-in-AND-group action", () => {
  it("wraps an existing simple criterion into an AND group with a default trailing simple", () => {
    const original: Criterion = {
      type: "simple",
      jsonPath: "$.confirmation.status",
      operation: "IEQUALS",
      value: "mismatch",
    };
    const { getByTestId, getAllByTestId, onDispatch } = renderEditor(original);

    fireEvent.click(getByTestId("criterion-wrap-and"));
    expect(onDispatch).not.toHaveBeenCalled();
    fireEvent.change(getAllByTestId("criterion-simple-path").at(-1)!, {
      target: { value: "$.settleStatus" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "ok" },
    });
    applyModal(getByTestId);

    const next = lastSetCriterion(onDispatch);
    expect(next).toEqual({
      type: "group",
      operator: "AND",
      conditions: [
        original,
        { type: "simple", jsonPath: "$.settleStatus", operation: "EQUALS", value: "ok" },
      ],
    });
  });

  it("preserves nested criteria exactly (function + lifecycle + array shapes)", () => {
    const fn: Criterion = {
      type: "function",
      function: {
        name: "MyFn",
        config: { attachEntity: true, calculationNodesTags: "x" },
        criterion: {
          type: "simple",
          jsonPath: "$.x",
          operation: "EQUALS",
          value: "y",
        },
      },
    };
    const { getByTestId, getAllByTestId, onDispatch } = renderEditor(fn);
    fireEvent.click(getByTestId("criterion-wrap-and"));
    fireEvent.change(getAllByTestId("criterion-simple-path").at(-1)!, {
      target: { value: "$.new" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "ok" },
    });
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next?.conditions[0]).toEqual(fn);
  });

  it("clones the original criterion rather than passing it by reference", () => {
    const original: Criterion = {
      type: "simple",
      jsonPath: "$.a",
      operation: "EQUALS",
      value: { nested: { deep: [1, 2, 3] } },
    };
    const { getByTestId, getAllByTestId, onDispatch } = renderEditor(original);
    fireEvent.click(getByTestId("criterion-wrap-and"));
    fireEvent.change(getAllByTestId("criterion-simple-path").at(-1)!, {
      target: { value: "$.new" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "ok" },
    });
    applyModal(getByTestId);
    const next = lastSetCriterion(onDispatch);
    expect(next?.conditions[0]).toEqual(original);
    expect(next?.conditions[0]).not.toBe(original);
    if (
      next?.conditions[0]?.type === "simple" &&
      typeof original.value === "object" &&
      original.value !== null
    ) {
      expect(next.conditions[0].value).not.toBe(original.value);
    }
  });

  it("is hidden when the current criterion is already a group", () => {
    const { queryByTestId } = renderGroup({
      type: "group",
      operator: "AND",
      conditions: [SIMPLE_A],
    });
    expect(queryByTestId("criterion-wrap-and")).toBeNull();
  });
});
