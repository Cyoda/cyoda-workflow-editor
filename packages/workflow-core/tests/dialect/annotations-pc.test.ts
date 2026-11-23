import { describe, expect, test } from "vitest";
import { parseImportPayload, serializeImportPayload } from "../../src/index.js";

const PAYLOAD = JSON.stringify({
  importMode: "REPLACE",
  workflows: [{
    version: "1.2", name: "wf", initialState: "S", active: true,
    criterionAnnotations: { displayName: "WF guard" },
    states: { S: { transitions: [{
      name: "t", next: "S", manual: true,
      criterionAnnotations: { displayName: "T guard" },
      processors: [{ type: "externalized", name: "p1", executionMode: "SYNC",
        annotations: { displayName: "Proc One" } }],
    }] } },
  }],
});

function wire(json: string, targetVersion: string) {
  const { document } = parseImportPayload(json);
  const out = serializeImportPayload(document!, { targetVersion });
  return JSON.parse(out).workflows[0];
}

describe("0.9 dialect emits processor & criterion annotations", () => {
  test("0.9 wire carries the three new fields", () => {
    const wf = wire(PAYLOAD, "0.9");
    expect(wf.criterionAnnotations).toEqual({ displayName: "WF guard" });
    const t = wf.states.S.transitions[0];
    expect(t.criterionAnnotations).toEqual({ displayName: "T guard" });
    expect(t.processors[0].annotations).toEqual({ displayName: "Proc One" });
  });

  test("a workflow without the new fields is byte-identical to before", () => {
    const plain = JSON.stringify({ importMode: "REPLACE", workflows: [{
      version: "1.2", name: "wf", initialState: "S", active: true,
      states: { S: { transitions: [{ name: "t", next: "S", manual: true }] } } }] });
    const { document } = parseImportPayload(plain);
    const out = serializeImportPayload(document!, { targetVersion: "0.9" });
    expect(JSON.parse(out).workflows[0].states.S.transitions[0]).not.toHaveProperty("annotations");
    expect(JSON.parse(out).workflows[0]).not.toHaveProperty("criterionAnnotations");
  });
});
