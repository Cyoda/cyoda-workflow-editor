import { describe, expect, test } from "vitest";
import { parseImportPayload } from "../../src/index.js";

function payloadWithStateAnnotation(annotation: Record<string, unknown>): string {
  return JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.0",
        name: "wf",
        initialState: "NEW",
        active: true,
        states: { NEW: { transitions: [], annotations: annotation } },
      },
    ],
  });
}

describe("annotations-too-large", () => {
  test("a >64KB state annotation is a blocking error carrying the state targetId", () => {
    const result = parseImportPayload(payloadWithStateAnnotation({ blob: "x".repeat(70_000) }));
    const issue = result.issues.find((i) => i.code === "annotations-too-large");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");

    const doc = result.document!;
    const stateId = Object.entries(doc.meta.ids.states).find(([, p]) => p.state === "NEW")?.[0];
    expect(issue!.targetId).toBe(stateId);
    expect(result.ok).toBe(false);
  });

  test("a small annotation produces no size error", () => {
    const result = parseImportPayload(payloadWithStateAnnotation({ ok: true }));
    expect(result.issues.some((i) => i.code === "annotations-too-large")).toBe(false);
  });
});
