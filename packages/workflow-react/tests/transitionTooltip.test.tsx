import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Transition } from "@cyoda/workflow-core";
import { TransitionTooltip } from "../src/components/TransitionTooltip.js";

afterEach(cleanup);

const t: Transition = {
  name: "APPROVE", next: "approved", manual: false, disabled: false,
  annotations: { displayName: "Approve request", description: "Manager sign-off" },
  criterion: { type: "simple", jsonPath: "$.ok", operation: "EQUALS", value: true },
  criterionAnnotations: { displayName: "Is ready" },
  processors: [{ type: "externalized", name: "notify", executionMode: "SYNC",
    annotations: { displayName: "Notify approver" } }],
};

describe("transition tooltip annotations", () => {
  test("shows displayName/description for transition, criterion, and processor", () => {
    render(<TransitionTooltip transition={t} x={0} y={0} />);
    expect(screen.getByText("Approve request")).toBeTruthy();
    expect(screen.getByText("Manager sign-off")).toBeTruthy();
    expect(screen.getByText("Is ready")).toBeTruthy();
    expect(screen.getByText("Notify approver")).toBeTruthy();
  });
});

describe("transition tooltip processor execution-mode badge (spec §4a)", () => {
  // An absent executionMode reads as SYNC, the documented default at fire —
  // not ASYNC_NEW_TX. ProcessorForm's summarizeProcessor already agrees on
  // this; these two tooltips were the two sites still treating an absent
  // mode as ASYNC_NEW_TX and rendering no badge at all.
  test("renders a SYNC badge for a processor with no executionMode", () => {
    const withoutMode: Transition = {
      ...t,
      processors: [{ type: "externalized", name: "notify" }],
    };
    render(<TransitionTooltip transition={withoutMode} x={0} y={0} />);
    expect(screen.getByText("SYNC")).toBeTruthy();
  });

  test("omits the badge for an explicit ASYNC_NEW_TX (the true default)", () => {
    const explicitDefault: Transition = {
      ...t,
      processors: [{ type: "externalized", name: "notify", executionMode: "ASYNC_NEW_TX" }],
    };
    render(<TransitionTooltip transition={explicitDefault} x={0} y={0} />);
    expect(screen.queryByText("ASYNC NEW TX")).toBeNull();
    expect(screen.queryByText(/ASYNC/)).toBeNull();
  });
});

describe("transition tooltip startNewTxOnDispatch tag", () => {
  test("renders a NEW TX tag when startNewTxOnDispatch is true", () => {
    const withNewTx: Transition = {
      ...t,
      processors: [{
        type: "externalized",
        name: "notify",
        executionMode: "COMMIT_BEFORE_DISPATCH",
        startNewTxOnDispatch: true,
      }],
    };
    render(<TransitionTooltip transition={withNewTx} x={0} y={0} />);
    expect(screen.getByText("NEW TX")).toBeTruthy();
  });

  test("omits the NEW TX tag when startNewTxOnDispatch is false", () => {
    const withoutNewTx: Transition = {
      ...t,
      processors: [{
        type: "externalized",
        name: "notify",
        executionMode: "COMMIT_BEFORE_DISPATCH",
        startNewTxOnDispatch: false,
      }],
    };
    render(<TransitionTooltip transition={withoutNewTx} x={0} y={0} />);
    expect(screen.queryByText("NEW TX")).toBeNull();
  });

  test("omits the NEW TX tag when startNewTxOnDispatch is unset", () => {
    render(<TransitionTooltip transition={t} x={0} y={0} />);
    expect(screen.queryByText("NEW TX")).toBeNull();
  });
});
