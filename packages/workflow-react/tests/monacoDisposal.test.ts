import { describe, it, expect } from "vitest";
import { installMonacoCancellationFilter } from "../src/components/monacoDisposal.js";

// Dispatch a synthetic `unhandledrejection` and report whether a listener
// suppressed it via preventDefault(). Mirrors how Monaco's benign "Canceled"
// disposal rejections surface — and lets us assert suppression happens
// regardless of timing (the old time-boxed window leaked on slower machines).
function fireUnhandledRejection(reason: unknown): boolean {
  const e = new Event("unhandledrejection", { cancelable: true });
  Object.defineProperty(e, "reason", { value: reason, configurable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

describe("installMonacoCancellationFilter", () => {
  it("suppresses Monaco 'Canceled' rejections (by error name)", () => {
    installMonacoCancellationFilter();
    expect(fireUnhandledRejection({ name: "Canceled", message: "Canceled" })).toBe(true);
  });

  it("suppresses a 'Canceled'-prefixed reason even with no active dispose window", () => {
    installMonacoCancellationFilter();
    // No editor disposal is "in progress" — the old window-gated impl would leak here.
    expect(fireUnhandledRejection("Canceled: Canceled")).toBe(true);
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
