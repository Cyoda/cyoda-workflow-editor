import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadWorkflowJson } from "../src/lib/localWorkflowFiles.js";

describe("downloadWorkflowJson", () => {
  const createObjectURL = vi.fn(() => "blob:workflow");
  const revokeObjectURL = vi.fn();
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL,
    });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it("creates and revokes a blob URL for download", () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const appendChild = vi.spyOn(document.body, "appendChild");
    const removeChild = vi.spyOn(document.body, "removeChild");
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "a") {
        return originalCreateElement(tagName);
      }

      const anchor = originalCreateElement("a");
      anchor.click = click as unknown as typeof anchor.click;
      return anchor;
    });

    downloadWorkflowJson("workflow.json", "{\"ok\":true}");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workflow");

    createElement.mockRestore();
    appendChild.mockRestore();
    removeChild.mockRestore();
  });
});

describe("openWorkflowFile — <input type=file> fallback (no File System Access API)", () => {
  let input: HTMLInputElement | null = null;
  const realCreate = document.createElement.bind(document);

  beforeEach(() => {
    vi.useFakeTimers();
    input = null;
    vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = realCreate(tag, options);
      if (tag === "input") {
        input = el as HTMLInputElement;
        vi.spyOn(input, "click").mockImplementation(() => {});
      }
      return el;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const choose = (file: File) => {
    Object.defineProperty(input!, "files", { value: [file], configurable: true });
    input!.dispatchEvent(new Event("change"));
  };

  // Firefox fires the window `focus` (dialog closed) before the input's
  // `change`. A focus-based cancel heuristic resolved `null` first and the
  // chosen file was dropped — "choose a file, nothing happens".
  it("returns the chosen file even when window focus arrives before change", async () => {
    const { openWorkflowFile } = await import("../src/lib/localWorkflowFiles.js");
    const pending = openWorkflowFile();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(10);
    choose(new File(['{"importMode":"MERGE","workflows":[]}'], "wf.json", { type: "application/json" }));
    await expect(pending).resolves.toEqual({
      name: "wf.json",
      text: '{"importMode":"MERGE","workflows":[]}',
      handle: null,
    });
  });

  it("resolves null when the picker is cancelled", async () => {
    const { openWorkflowFile } = await import("../src/lib/localWorkflowFiles.js");
    const pending = openWorkflowFile();
    input!.dispatchEvent(new Event("cancel"));
    await expect(pending).resolves.toBeNull();
  });
});
