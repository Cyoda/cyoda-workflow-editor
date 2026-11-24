import { describe, expect, test } from "vitest";
import { parseImportPayload, serializeImportPayload } from "../../src/index.js";

function roundTrip(processor: Record<string, unknown>): Record<string, unknown> {
  const raw = JSON.stringify({
    importMode: "MERGE",
    workflows: [{
      // 1.5: some cases use `idempotent`, a schema 1.5 field.
      version: "1.5", name: "w", initialState: "A", active: true,
      states: { A: { transitions: [{
        name: "t", next: "A", manual: true, processors: [processor],
      }] } },
    }],
  });
  const parsed = parseImportPayload(raw);
  expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
  const out = JSON.parse(serializeImportPayload(parsed.document!));
  return out.workflows[0].states.A.transitions[0].processors[0];
}

describe("pre-existing round-trip defects (spec §4a)", () => {
  test("does not fabricate an executionMode", () => {
    const p = roundTrip({ type: "externalized", name: "p" });
    expect(p).not.toHaveProperty("executionMode");
  });

  test("preserves asyncResult: false", () => {
    const p = roundTrip({
      type: "externalized", name: "p", config: { asyncResult: false },
    });
    expect(p.config).toMatchObject({ asyncResult: false });
  });

  test("preserves attachEntity: false", () => {
    const p = roundTrip({
      type: "externalized", name: "p", config: { attachEntity: false },
    });
    expect(p.config).toMatchObject({ attachEntity: false });
  });

  test("preserves crossoverToAsyncMs without asyncResult", () => {
    const p = roundTrip({
      type: "externalized", name: "p", config: { crossoverToAsyncMs: 100 },
    });
    expect(p.config).toMatchObject({ crossoverToAsyncMs: 100 });
  });

  test("preserves a zero responseTimeoutMs (the lowest value cyoda-go 0.9.0 accepts)", () => {
    const p = roundTrip({
      type: "externalized", name: "p", config: { responseTimeoutMs: 0 },
    });
    expect(p.config).toMatchObject({ responseTimeoutMs: 0 });
  });

  test("preserves idempotent: false as well as true", () => {
    for (const idempotent of [false, true]) {
      const p = roundTrip({ type: "externalized", name: "p", config: { idempotent } });
      expect(p.config).toEqual({ idempotent });
    }
  });

  test("preserves startNewTxOnDispatch: false", () => {
    const p = roundTrip({ type: "externalized", name: "p", startNewTxOnDispatch: false });
    expect(p.startNewTxOnDispatch).toBe(false);
  });
});
