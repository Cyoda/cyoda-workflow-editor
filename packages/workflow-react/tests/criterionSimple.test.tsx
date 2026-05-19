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
  type DomainPatch,
  type EntityFieldHintProvider,
  type EntityIdentity,
  type FieldHint,
} from "@cyoda/workflow-core";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";
import { TransitionForm } from "../src/inspector/TransitionForm.js";
import { FieldHintsProvider } from "../src/inspector/criteria/FieldHintsContext.js";
import type { SimpleCriterion } from "@cyoda/workflow-core";

function loadDoc(transitionCriterion?: SimpleCriterion) {
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
                  ...(transitionCriterion ? { criterion: transitionCriterion } : {}),
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

function renderWithCriterion(
  transitionCriterion?: SimpleCriterion,
  opts: RenderOpts = {},
) {
  const doc = loadDoc(transitionCriterion);
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

  // If there's already a criterion, the section shows Edit/Remove buttons —
  // click Edit so the form renders. If not, click "+ Add Criterion".
  if (transitionCriterion) {
    fireEvent.click(view.getByTestId("inspector-criterion-edit"));
  } else {
    fireEvent.click(view.getByTestId("inspector-criterion-add"));
  }

  return { ...view, onDispatch };
}

afterEach(() => cleanup());

describe("SimpleCriterionFields", () => {
  it("dropdown only offers the 26 supported operators, grouped", () => {
    const { getByTestId } = renderWithCriterion();
    const select = getByTestId("criterion-simple-op") as HTMLSelectElement;
    const optgroups = Array.from(select.querySelectorAll("optgroup"));
    expect(optgroups.map((g) => g.label)).toEqual(
      OPERATOR_GROUPS.map((g) => g.label),
    );
    const enabledOptions = Array.from(select.querySelectorAll("option")).filter(
      (o) => !o.disabled,
    );
    expect(enabledOptions).toHaveLength(SUPPORTED_SIMPLE_OPERATORS.size);
    for (const opt of enabledOptions) {
      expect(SUPPORTED_SIMPLE_OPERATORS.has(opt.value as never)).toBe(true);
    }
  });

  it("equality optgroup contains EQUALS/NOT_EQUAL/IEQUALS/INOT_EQUAL", () => {
    const { getByTestId } = renderWithCriterion();
    const select = getByTestId("criterion-simple-op");
    const equality = select.querySelector('optgroup[label="Equality"]')!;
    const ops = Array.from(equality.querySelectorAll("option")).map((o) => o.value);
    expect(ops).toEqual(["EQUALS", "NOT_EQUAL", "IEQUALS", "INOT_EQUAL"]);
  });

  it("legacy operator on existing criterion shows as disabled option", () => {
    const { getByTestId } = renderWithCriterion({
      type: "simple",
      jsonPath: "$.x",
      operation: "IS_CHANGED",
    });
    const select = getByTestId("criterion-simple-op") as HTMLSelectElement;
    const legacy = select.querySelector("option[disabled]") as HTMLOptionElement;
    expect(legacy).toBeTruthy();
    expect(legacy.value).toBe("IS_CHANGED");
    expect(legacy.textContent).toContain("IS_CHANGED");
    expect(legacy.textContent).toContain(defaultMessages.criterion.legacySuffix);
    expect(select.value).toBe("IS_CHANGED");
  });

  it("BETWEEN renders low/high inputs and dispatches [low, high]", () => {
    const { getByTestId, queryByTestId, onDispatch } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.n" },
    });
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "BETWEEN" },
    });
    expect(queryByTestId("criterion-simple-value")).toBeNull();
    fireEvent.change(getByTestId("criterion-simple-low"), { target: { value: "0" } });
    fireEvent.change(getByTestId("criterion-simple-high"), { target: { value: "10" } });
    fireEvent.click(getByTestId("criterion-modal-apply"));
    const patches = onDispatch.mock.calls.map((c) => c[0]);
    const setCrit = patches.find((p) => p.op === "setCriterion");
    expect(setCrit).toBeDefined();
    expect(setCrit && setCrit.op === "setCriterion" ? setCrit.criterion : null).toEqual({
      type: "simple",
      jsonPath: "$.n",
      operation: "BETWEEN",
      value: [0, 10],
    });
  });

  it("date-like path renders date input and dispatches string value", () => {
    const { getByTestId, onDispatch } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.tradeDates.tradeDate" },
    });
    const valueInput = getByTestId("criterion-simple-value") as HTMLInputElement;
    expect(valueInput.type).toBe("date");
    expect(getByTestId("criterion-simple-date-format").textContent).toContain("YYYY-MM-DD");
    fireEvent.change(valueInput, { target: { value: "2026-05-16" } });
    fireEvent.click(getByTestId("criterion-modal-apply"));

    const setCrit = onDispatch.mock.calls
      .map((c) => c[0])
      .find((p) => p.op === "setCriterion");
    expect(setCrit && setCrit.op === "setCriterion" ? setCrit.criterion : null).toEqual({
      type: "simple",
      jsonPath: "$.tradeDates.tradeDate",
      operation: "EQUALS",
      value: "2026-05-16",
    });
  });

  it("timestamp-like path renders datetime-local input", () => {
    const { getByTestId } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.audit.createdAt" },
    });
    const valueInput = getByTestId("criterion-simple-value") as HTMLInputElement;
    expect(valueInput.type).toBe("datetime-local");
    expect(getByTestId("criterion-simple-date-format").textContent).toContain(
      "YYYY-MM-DDTHH:mm",
    );
  });

  it("date-like BETWEEN renders From/To date inputs and dispatches string range", () => {
    const { getByTestId, onDispatch } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.settlement.settlementDate" },
    });
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "BETWEEN" },
    });

    const from = getByTestId("criterion-simple-low") as HTMLInputElement;
    const to = getByTestId("criterion-simple-high") as HTMLInputElement;
    expect(from.type).toBe("date");
    expect(to.type).toBe("date");
    expect(getByTestId("criterion-simple-range-start-label").textContent).toBe("From");
    expect(getByTestId("criterion-simple-range-end-label").textContent).toBe("To");

    fireEvent.change(from, { target: { value: "2026-05-01" } });
    fireEvent.change(to, { target: { value: "2026-05-16" } });
    fireEvent.click(getByTestId("criterion-modal-apply"));

    const setCrit = onDispatch.mock.calls
      .map((c) => c[0])
      .find((p) => p.op === "setCriterion");
    expect(setCrit && setCrit.op === "setCriterion" ? setCrit.criterion : null).toEqual({
      type: "simple",
      jsonPath: "$.settlement.settlementDate",
      operation: "BETWEEN",
      value: ["2026-05-01", "2026-05-16"],
    });
  });

  it("non-date path still renders normal text value input", () => {
    const { getByTestId } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.priority" },
    });
    expect((getByTestId("criterion-simple-value") as HTMLInputElement).type).toBe("text");
  });

  it("BETWEEN with missing high disables Apply and shows shape error", () => {
    const { getByTestId, queryByTestId } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.n" },
    });
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "BETWEEN" },
    });
    fireEvent.change(getByTestId("criterion-simple-low"), { target: { value: "0" } });
    expect(queryByTestId("criterion-simple-between-error")).toBeTruthy();
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("IS_NULL hides value input and dispatches criterion without value field", () => {
    const { getByTestId, queryByTestId, onDispatch } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.x" },
    });
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "IS_NULL" },
    });
    expect(queryByTestId("criterion-simple-value")).toBeNull();
    expect(queryByTestId("criterion-simple-low")).toBeNull();
    expect(queryByTestId("criterion-simple-value-ignored")).toBeTruthy();
    fireEvent.click(getByTestId("criterion-modal-apply"));
    const setCrit = onDispatch.mock.calls
      .map((c) => c[0])
      .find((p) => p.op === "setCriterion");
    expect(setCrit && setCrit.op === "setCriterion" ? setCrit.criterion : null).toEqual({
      type: "simple",
      jsonPath: "$.x",
      operation: "IS_NULL",
    });
  });

  it("recursive-descent jsonPath shows error and disables Apply", () => {
    const { getByTestId } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$..x" },
    });
    const err = getByTestId("criterion-simple-path-error");
    expect(err.textContent).toBe(
      defaultMessages.criterion.jsonPathError["recursive-descent"],
    );
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(true);
  });

  it("$.list[*].x is accepted (no error)", () => {
    const { getByTestId, queryByTestId } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.list[*].x" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "ok" },
    });
    expect(queryByTestId("criterion-simple-path-error")).toBeNull();
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(false);
  });

  it("LIKE shows always-on help and adds wildcard warning when value contains %", () => {
    const { getByTestId, queryByTestId } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.s" },
    });
    fireEvent.change(getByTestId("criterion-simple-op"), { target: { value: "LIKE" } });
    expect(getByTestId("criterion-simple-like-help")).toBeTruthy();
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "foo%" },
    });
    expect(queryByTestId("criterion-simple-like-warning")).toBeTruthy();
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(false);
  });

  it("MATCHES_PATTERN unanchored value emits warning, Apply enabled", () => {
    const { getByTestId, queryByTestId } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.s" },
    });
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "MATCHES_PATTERN" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: "foo" },
    });
    expect(queryByTestId("criterion-simple-matches-warning")).toBeTruthy();
    expect((getByTestId("criterion-modal-apply") as HTMLButtonElement).disabled).toBe(false);
  });

  it("selecting a hint commits the chosen path on Apply", async () => {
    const hints: FieldHint[] = [
      { jsonPath: "$.amount", type: "number" },
      { jsonPath: "$.customer.id", type: "string" },
    ];
    const provider: EntityFieldHintProvider = {
      listFieldPaths: vi.fn(async () => hints),
    };
    const { getByTestId, onDispatch } = renderWithCriterion(undefined, {
      hintProvider: provider,
      entity: { entityName: "Order", modelVersion: 1 },
    });
    const input = getByTestId("criterion-simple-path") as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => expect(getByTestId("criterion-simple-path-hint-0")).toBeTruthy());
    fireEvent.mouseDown(getByTestId("criterion-simple-path-hint-1"));
    expect(input.value).toBe("$.customer.id");
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "EQUALS" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: '"abc"' },
    });
    fireEvent.click(getByTestId("criterion-modal-apply"));
    const setCrit = onDispatch.mock.calls
      .map((c) => c[0])
      .find((p) => p.op === "setCriterion");
    expect(setCrit && setCrit.op === "setCriterion" ? setCrit.criterion : null).toEqual({
      type: "simple",
      jsonPath: "$.customer.id",
      operation: "EQUALS",
      value: "abc",
    });
  });

  it("without a hint provider, the jsonPath input behaves as a plain field (no panel)", () => {
    const { getByTestId, queryByTestId } = renderWithCriterion();
    const input = getByTestId("criterion-simple-path") as HTMLInputElement;
    fireEvent.focus(input);
    expect(queryByTestId("criterion-simple-path-hints")).toBeNull();
    fireEvent.change(input, { target: { value: "$.priority" } });
    expect(input.value).toBe("$.priority");
    expect(queryByTestId("criterion-simple-path-hints")).toBeNull();
  });

  it("EQUALS dispatches setCriterion with parsed scalar value", () => {
    const { getByTestId, onDispatch } = renderWithCriterion();
    fireEvent.change(getByTestId("criterion-simple-path"), {
      target: { value: "$.priority" },
    });
    fireEvent.change(getByTestId("criterion-simple-op"), {
      target: { value: "EQUALS" },
    });
    fireEvent.change(getByTestId("criterion-simple-value"), {
      target: { value: '"high"' },
    });
    fireEvent.click(getByTestId("criterion-modal-apply"));
    const setCrit = onDispatch.mock.calls
      .map((c) => c[0])
      .find((p) => p.op === "setCriterion");
    expect(setCrit && setCrit.op === "setCriterion" ? setCrit.criterion : null).toEqual({
      type: "simple",
      jsonPath: "$.priority",
      operation: "EQUALS",
      value: "high",
    });
  });
});
