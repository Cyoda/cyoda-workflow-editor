import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { useState } from "react";
import type {
  EntityFieldHintProvider,
  EntityIdentity,
  FieldHint,
} from "@cyoda/workflow-core";
import { I18nContext } from "../src/i18n/context.js";
import { defaultMessages } from "../src/i18n/en.js";
import { FieldHintsProvider } from "../src/inspector/criteria/FieldHintsContext.js";
import { JsonPathInput } from "../src/inspector/criteria/JsonPathInput.js";

interface HarnessProps {
  provider?: EntityFieldHintProvider;
  entity?: EntityIdentity | null;
  initial?: string;
}

function Harness({ provider, entity, initial = "" }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <I18nContext.Provider value={defaultMessages}>
      <FieldHintsProvider
        {...(provider ? { provider } : {})}
        {...(entity !== undefined ? { entity } : {})}
      >
        <JsonPathInput
          value={value}
          onChange={setValue}
          inputStyle={{ padding: 4 }}
          testIdPrefix="t"
        />
      </FieldHintsProvider>
    </I18nContext.Provider>
  );
}

function makeProvider(
  hints: FieldHint[],
): EntityFieldHintProvider & { listFieldPaths: ReturnType<typeof vi.fn> } {
  const listFieldPaths = vi.fn(async () => hints);
  return { listFieldPaths } as EntityFieldHintProvider & {
    listFieldPaths: ReturnType<typeof vi.fn>;
  };
}

function getInput(view: RenderResult): HTMLInputElement {
  return view.getByTestId("t-path") as HTMLInputElement;
}

const ENTITY: EntityIdentity = { entityName: "Order", modelVersion: 1 };

const HINTS: FieldHint[] = [
  { jsonPath: "$.amount", type: "number" },
  { jsonPath: "$.customer.id", type: "string", description: "Customer UUID" },
  { jsonPath: "$.customer.status", type: "string" },
  { jsonPath: "$.items", type: "array" },
];

afterEach(() => cleanup());

describe("JsonPathInput — field-hints panel", () => {
  it("renders a plain input and never opens the panel when no provider is configured", () => {
    const view = render(<Harness />);
    const input = getInput(view);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "$.x" } });
    expect(view.queryByTestId("t-path-hints")).toBeNull();
    expect(input.getAttribute("aria-autocomplete")).toBeNull();
    expect(input.getAttribute("role")).toBeNull();
  });

  it("shows a no-entity hint row when a provider is given but entity is null", () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={null} />);
    fireEvent.focus(getInput(view));
    expect(view.getByTestId("t-path-hints")).toBeTruthy();
    expect(view.getByTestId("t-path-hints-no-entity").textContent).toBe(
      defaultMessages.criterion.hints.noEntity,
    );
    expect(provider.listFieldPaths).not.toHaveBeenCalled();
  });

  it("loads hints on focus and renders the list with type labels", async () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    fireEvent.focus(getInput(view));
    expect(view.getByTestId("t-path-hints-loading")).toBeTruthy();
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    expect(provider.listFieldPaths).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("t-path-hint-0").textContent).toContain("$.amount");
    expect(view.getByTestId("t-path-hint-0").textContent).toContain("(number)");
    expect(view.getByTestId("t-path-hint-1").textContent).toContain(
      "Customer UUID",
    );
  });

  it("filters the panel by typed substring without re-calling the provider", async () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    const input = getInput(view);
    fireEvent.focus(input);
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    fireEvent.change(input, { target: { value: "customer" } });
    expect(view.queryByTestId("t-path-hint-2")).toBeNull();
    expect(view.getByTestId("t-path-hint-0").textContent).toContain(
      "$.customer.id",
    );
    expect(view.getByTestId("t-path-hint-1").textContent).toContain(
      "$.customer.status",
    );
    expect(provider.listFieldPaths).toHaveBeenCalledTimes(1);
  });

  it("ArrowDown / ArrowUp / Enter commits the highlighted path into the input", async () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    const input = getInput(view);
    fireEvent.focus(input);
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(
      view.getByTestId("t-path-hint-1").getAttribute("data-active"),
    ).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("$.customer.id");
    expect(view.queryByTestId("t-path-hints")).toBeNull();
  });

  it("Escape closes the panel without committing", async () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    const input = getInput(view);
    fireEvent.focus(input);
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    fireEvent.keyDown(input, { key: "Escape" });
    expect(view.queryByTestId("t-path-hints")).toBeNull();
    expect(input.value).toBe("");
  });

  it("mousedown outside the wrapper closes the panel", async () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    fireEvent.focus(getInput(view));
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    fireEvent.mouseDown(document.body);
    expect(view.queryByTestId("t-path-hints")).toBeNull();
  });

  it("clicking a row commits the chosen path", async () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    const input = getInput(view);
    fireEvent.focus(input);
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    fireEvent.mouseDown(view.getByTestId("t-path-hint-3"));
    expect(input.value).toBe("$.items");
    expect(view.queryByTestId("t-path-hints")).toBeNull();
  });

  it("caches the result so re-focusing does not re-call the provider", async () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    const input = getInput(view);
    fireEvent.focus(input);
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    fireEvent.blur(input);
    fireEvent.mouseDown(document.body);
    fireEvent.focus(input);
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    expect(provider.listFieldPaths).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when the entity changes", async () => {
    const provider = makeProvider(HINTS);
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    fireEvent.focus(getInput(view));
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    expect(provider.listFieldPaths).toHaveBeenCalledTimes(1);
    view.rerender(
      <Harness
        provider={provider}
        entity={{ entityName: "Order", modelVersion: 2 }}
      />,
    );
    fireEvent.focus(getInput(view));
    await waitFor(() => expect(provider.listFieldPaths).toHaveBeenCalledTimes(2));
  });

  it("shows an error row with retry when the provider rejects", async () => {
    let attempt = 0;
    const provider: EntityFieldHintProvider = {
      listFieldPaths: vi.fn(async () => {
        attempt++;
        if (attempt === 1) throw new Error("boom");
        return HINTS;
      }),
    };
    const view = render(<Harness provider={provider} entity={ENTITY} />);
    fireEvent.focus(getInput(view));
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hints-error")).toBeTruthy(),
    );
    expect(view.getByTestId("t-path-hints-error").textContent).toContain("boom");
    fireEvent.mouseDown(view.getByTestId("t-path-hints-retry"));
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hint-0")).toBeTruthy(),
    );
    expect(provider.listFieldPaths).toHaveBeenCalledTimes(2);
  });

  it("shows a 'no matches' row when the filter excludes everything", async () => {
    const provider = makeProvider(HINTS);
    const view = render(
      <Harness provider={provider} entity={ENTITY} initial="$.zzz" />,
    );
    const input = getInput(view);
    fireEvent.focus(input);
    await waitFor(() =>
      expect(view.queryByTestId("t-path-hints-empty")).toBeTruthy(),
    );
    expect(view.getByTestId("t-path-hints-empty").textContent).toBe(
      defaultMessages.criterion.hints.noMatches,
    );
  });
});
