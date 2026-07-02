import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { AnnotationsField } from "../src/inspector/AnnotationsField.js";

afterEach(cleanup);

// No CriterionMonacoProvider → useCriterionMonaco() returns null → textarea path.

test("absent value shows Add button; clicking dispatches setAnnotations({})", () => {
  const onCommit = vi.fn();
  render(<AnnotationsField value={undefined} disabled={false} modelKey="k" onCommit={onCommit} onRemove={vi.fn()} />);
  fireEvent.click(screen.getByTestId("inspector-annotations-add"));
  expect(onCommit).toHaveBeenCalledWith({});
});

test("editing to a valid changed object enables Apply and commits the parsed object", () => {
  const onCommit = vi.fn();
  render(<AnnotationsField value={{}} disabled={false} modelKey="k" onCommit={onCommit} onRemove={vi.fn()} />);
  const ta = screen.getByTestId("annotations-json-editor") as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: '{"role":"reviewer"}' } });
  const apply = screen.getByTestId("inspector-annotations-apply") as HTMLButtonElement;
  expect(apply.disabled).toBe(false);
  fireEvent.click(apply);
  expect(onCommit).toHaveBeenCalledWith({ role: "reviewer" });
});

test("Apply is disabled when unchanged and when invalid", () => {
  render(<AnnotationsField value={{ a: 1 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  const apply = () => screen.getByTestId("inspector-annotations-apply") as HTMLButtonElement;
  const ta = screen.getByTestId("annotations-json-editor") as HTMLTextAreaElement;
  expect(apply().disabled).toBe(true); // unchanged
  fireEvent.change(ta, { target: { value: "{ not json" } });
  expect(apply().disabled).toBe(true); // invalid
  expect(screen.getByTestId("annotations-error")).toBeTruthy();
  fireEvent.change(ta, { target: { value: "[]" } });
  expect(screen.getByTestId("annotations-error").textContent).toMatch(/object/i);
});

test("Remove dispatches setAnnotations(undefined) via onRemove", () => {
  const onRemove = vi.fn();
  render(<AnnotationsField value={{ a: 1 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={onRemove} />);
  fireEvent.click(screen.getByTestId("inspector-annotations-remove"));
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test("Revert restores the buffer to value and re-disables Apply", () => {
  render(<AnnotationsField value={{ a: 1 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  const ta = screen.getByTestId("annotations-json-editor") as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: '{"a":2}' } });
  fireEvent.click(screen.getByTestId("inspector-annotations-revert"));
  expect(JSON.parse(ta.value)).toEqual({ a: 1 });
  expect((screen.getByTestId("inspector-annotations-apply") as HTMLButtonElement).disabled).toBe(true);
});

test("three-way sync: clean buffer re-seeds on external value change; echo is a no-op; dirty buffer is kept", () => {
  const { rerender } = render(
    <AnnotationsField value={{ a: 1 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />,
  );
  const ta = () => screen.getByTestId("annotations-json-editor") as HTMLTextAreaElement;

  // Clean buffer + external change (e.g. undo) → re-seed.
  rerender(<AnnotationsField value={{ a: 9 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  expect(JSON.parse(ta().value)).toEqual({ a: 9 });

  // Dirty buffer + external change → keep buffer, show "document changed" note.
  fireEvent.change(ta(), { target: { value: '{"a":100}' } });
  rerender(<AnnotationsField value={{ a: 55 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  expect(JSON.parse(ta().value)).toEqual({ a: 100 });
  expect(screen.getByTestId("annotations-doc-changed")).toBeTruthy();

  // Echo: value becomes deep-equal to the current (dirty) buffer → no note, buffer unchanged.
  rerender(<AnnotationsField value={{ a: 100 }} disabled={false} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  expect(JSON.parse(ta().value)).toEqual({ a: 100 });
  expect(screen.queryByTestId("annotations-doc-changed")).toBeNull();
});

test("read-only (disabled) shows no Add/Apply/Remove", () => {
  render(<AnnotationsField value={{ a: 1 }} disabled={true} modelKey="k" onCommit={vi.fn()} onRemove={vi.fn()} />);
  expect(screen.queryByTestId("inspector-annotations-apply")).toBeNull();
  expect(screen.queryByTestId("inspector-annotations-remove")).toBeNull();
});
