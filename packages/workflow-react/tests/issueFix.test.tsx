import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import { parseImportPayload } from "@cyoda/workflow-core";
import { WorkflowEditor } from "../src/index.js";

function fixture(json: string): WorkflowEditorDocument {
  const result = parseImportPayload(json);
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

/**
 * `version: "1.0"` is below the minimum minor cyoda-go 0.8.3 accepts, so it
 * raises the one warning in the catalog that carries a `ValidationFix`.
 */
const OUTDATED = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "a",
      active: true,
      states: {
        a: { transitions: [{ name: "go", next: "b", manual: true, disabled: false }] },
        b: { transitions: [] },
      },
    },
  ],
});

const CLEAN = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.3",
      name: "wf",
      initialState: "a",
      active: true,
      states: {
        a: { transitions: [{ name: "go", next: "b", manual: false, disabled: false }] },
        b: { transitions: [] },
      },
    },
  ],
});

afterEach(() => cleanup());

describe("offered validation fixes (spec §4)", () => {
  it("renders the offered fix as an action on the issue that carries it", () => {
    render(<WorkflowEditor document={fixture(OUTDATED)} />);
    fireEvent.click(screen.getByTestId("toolbar-warnings"));
    const fix = screen.getByTestId("issues-drawer-fix-0");
    expect(fix.tagName).toBe("BUTTON");
    expect(fix.textContent).toMatch(/1\.4/);
  });

  it("applying the fix rewrites the tag, bumps the revision, and clears the warning", () => {
    const seen: WorkflowEditorDocument[] = [];
    const initial = fixture(OUTDATED);
    render(<WorkflowEditor document={initial} onChange={(d) => seen.push(d)} />);
    fireEvent.click(screen.getByTestId("toolbar-warnings"));
    fireEvent.click(screen.getByTestId("issues-drawer-fix-0"));

    const latest = seen[seen.length - 1]!;
    expect(latest.session.workflows[0]!.version).toBe("1.4");
    expect(latest.meta.revision).toBeGreaterThan(initial.meta.revision);
    // The warning is gone from the re-derived issue set, not just from the DOM.
    expect(screen.getByTestId("issues-drawer-empty")).toBeTruthy();
    expect((screen.getByTestId("toolbar-warnings") as HTMLButtonElement).disabled).toBe(true);
  });

  it("issues without a fix render no fix action", () => {
    render(<WorkflowEditor document={fixture(CLEAN)} />);
    fireEvent.click(screen.getByTestId("toolbar-infos"));
    expect(screen.getByTestId("issues-drawer")).toBeTruthy();
    expect(screen.queryByTestId("issues-drawer-fix-0")).toBeNull();
  });
});
