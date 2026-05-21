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
