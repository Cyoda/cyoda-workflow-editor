import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { applyPatch, parseImportPayload, type DomainPatch } from "@cyoda/workflow-core";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";
import { TransitionForm } from "../src/inspector/TransitionForm.js";

function loadDoc() {
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
                { name: "go", next: "b", manual: false, disabled: false },
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

function loadDocWithProcessor() {
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
                  processors: [
                    {
                      type: "externalized",
                      name: "notify",
                      executionMode: "ASYNC_NEW_TX",
                      config: { attachEntity: false, responseTimeoutMs: 5000 },
                    },
                  ],
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

afterEach(() => cleanup());

describe("TransitionForm anchor dropdowns", () => {
  it("groups transition criteria and processors into clear sections", () => {
    const doc = loadDoc();
    const workflow = doc.session.workflows[0]!;
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const transition = workflow.states["a"]!.transitions[0]!;
    const onDispatch = vi.fn<(patch: DomainPatch) => void>();

    const { getByTestId, getByText } = render(
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

    expect(getByTestId("inspector-transition-criteria-section")).toBeTruthy();
    expect(getByText("Criteria")).toBeTruthy();
    expect(getByTestId("inspector-transition-processes-section")).toBeTruthy();
    expect(getByText("Processors")).toBeTruthy();
    expect(getByText("No processors run on this transition.")).toBeTruthy();
  });

  it("opens the processor modal from the transition processor summary row", () => {
    const doc = loadDocWithProcessor();
    const workflow = doc.session.workflows[0]!;
    const transitionUuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const processorUuid = Object.keys(doc.meta.ids.processors)[0]!;
    const transition = workflow.states["a"]!.transitions[0]!;
    const onDispatch = vi.fn<(patch: DomainPatch) => void>();

    const { getByTestId, queryByTestId } = render(
      <I18nContext.Provider value={defaultMessages}>
        <TransitionForm
          workflow={workflow}
          stateCode="a"
          transition={transition}
          transitionUuid={transitionUuid}
          transitionIndex={0}
          processorUuids={[processorUuid]}
          anchors={undefined}
          disabled={false}
          onDispatch={onDispatch}
        />
      </I18nContext.Provider>,
    );

    expect(queryByTestId("processor-editor-modal")).toBeNull();

    fireEvent.click(getByTestId("processor-edit-0"));

    expect(getByTestId("processor-editor-modal")).toBeTruthy();
    expect((getByTestId("processor-name-input") as HTMLInputElement).value).toBe("notify");
  });

  it("dispatches setEdgeAnchors with the chosen side", () => {
    const doc = loadDoc();
    const workflow = doc.session.workflows[0]!;
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const transition = workflow.states["a"]!.transitions[0]!;
    const onDispatch = vi.fn<(patch: DomainPatch) => void>();

    const { getByTestId } = render(
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

    const sourceSelect = getByTestId("inspector-transition-source-anchor") as HTMLSelectElement;
    fireEvent.change(sourceSelect, { target: { value: "right" } });

    expect(onDispatch).toHaveBeenCalledWith({
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: { source: "right" },
    });
  });

  it("clearing to default with no other anchor set dispatches null", () => {
    const doc = loadDoc();
    const workflow = doc.session.workflows[0]!;
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const transition = workflow.states["a"]!.transitions[0]!;
    const onDispatch = vi.fn<(patch: DomainPatch) => void>();

    const { getByTestId } = render(
      <I18nContext.Provider value={defaultMessages}>
        <TransitionForm
          workflow={workflow}
          stateCode="a"
          transition={transition}
          transitionUuid={uuid}
          transitionIndex={0}
          processorUuids={[]}
          anchors={{ source: "right" }}
          disabled={false}
          onDispatch={onDispatch}
        />
      </I18nContext.Provider>,
    );

    const sourceSelect = getByTestId("inspector-transition-source-anchor") as HTMLSelectElement;
    fireEvent.change(sourceSelect, { target: { value: "" } });

    expect(onDispatch).toHaveBeenCalledWith({
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: null,
    });
  });

  it("the dispatched patch round-trips through applyPatch → meta only", () => {
    const doc = loadDoc();
    const uuid = Object.keys(doc.meta.ids.transitions)[0]!;
    const after = applyPatch(doc, {
      op: "setEdgeAnchors",
      transitionUuid: uuid,
      anchors: { source: "right", target: "left" },
    });
    expect(after.session).toBe(doc.session);
    expect(after.meta.workflowUi["wf"]?.edgeAnchors?.[uuid]).toEqual({
      source: "right",
      target: "left",
    });
  });
});
