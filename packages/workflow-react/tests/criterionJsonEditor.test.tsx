import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Criterion } from "@cyoda/workflow-core";
import { CriterionJsonEditor } from "../src/inspector/CriterionJsonEditor.js";

afterEach(cleanup);

const valid: Criterion = { type: "simple", jsonPath: "$.a", operation: "EQUALS", value: "x" };

describe("CriterionJsonEditor (textarea fallback)", () => {
  it("renders a textarea when no Monaco runtime is present", () => {
    render(<CriterionJsonEditor value={valid} disabled={false} modelKey="t1" onChange={() => {}} />);
    expect(screen.getByTestId("criterion-json-editor")).toBeTruthy();
  });

  it("reports a valid criterion on mount", () => {
    const onChange = vi.fn();
    render(<CriterionJsonEditor value={valid} disabled={false} modelKey="t1" onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith({ criterion: valid, error: null });
  });

  it("reports an error when edited to invalid JSON", () => {
    const onChange = vi.fn();
    render(<CriterionJsonEditor value={valid} disabled={false} modelKey="t1" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("criterion-json-editor"), { target: { value: "{ broken" } });
    expect(onChange).toHaveBeenLastCalledWith({ criterion: null, error: expect.stringMatching(/JSON/i) });
  });

  it("disables the textarea when disabled", () => {
    render(<CriterionJsonEditor value={valid} disabled modelKey="t1" onChange={() => {}} />);
    expect((screen.getByTestId("criterion-json-editor") as HTMLTextAreaElement).disabled).toBe(true);
  });
});
