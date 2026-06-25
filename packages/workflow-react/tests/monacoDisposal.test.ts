import { describe, it, expect } from "vitest";
import { installMonacoCancellationFilter } from "../src/components/monacoDisposal.js";

// These tests cover the FILTER MATCHING LOGIC and that a cancelable
// `unhandledrejection` is honored via preventDefault(). Real browser + Monaco
// timing (a late disposal cancellation actually arriving as a suppressible
// event) is covered by in-browser verification, not jsdom.
function fireUnhandledRejection(reason: unknown): boolean {
  const e = new Event("unhandledrejection", { cancelable: true });
  Object.defineProperty(e, "reason", { value: reason, configurable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

describe("installMonacoCancellationFilter", () => {
  it("suppresses Monaco's CancellationError (name === 'Canceled'), regardless of timing", () => {
    installMonacoCancellationFilter();
    // No editor disposal is "in progress" — the old window-gated impl leaked here.
    expect(fireUnhandledRejection({ name: "Canceled", message: "Canceled" })).toBe(true);
  });

  it("does NOT suppress a legitimate string rejection that starts with 'Canceled'", () => {
    installMonacoCancellationFilter();
    // e.g. an app doing Promise.reject("Canceled by user") for flow control.
    expect(fireUnhandledRejection("Canceled by user")).toBe(false);
  });

  it("does NOT suppress unrelated rejections", () => {
    installMonacoCancellationFilter();
    expect(fireUnhandledRejection(new TypeError("boom"))).toBe(false);
    expect(fireUnhandledRejection({ name: "Error", message: "real failure" })).toBe(false);
  });

  it("is idempotent — repeated installs do not double-handle", () => {
    installMonacoCancellationFilter();
    installMonacoCancellationFilter();
    expect(fireUnhandledRejection({ name: "Canceled" })).toBe(true);
  });
});
