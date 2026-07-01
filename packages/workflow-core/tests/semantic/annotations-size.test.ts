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

  test("a >64KB workflow annotation is a blocking error carrying the workflow targetId", () => {
    const json = JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "NEW",
          active: true,
          annotations: { blob: "x".repeat(70_000) },
          states: { NEW: { transitions: [] } },
        },
      ],
    });
    const result = parseImportPayload(json);
    const issue = result.issues.find((i) => i.code === "annotations-too-large");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
    expect(issue!.targetId).toBe(result.document!.meta.ids.workflows["wf"]);
  });

  test("a >64KB transition annotation is a blocking error carrying the transition targetId", () => {
    const json = JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "NEW",
          active: true,
          states: {
            NEW: {
              transitions: [
                { name: "go", next: "DONE", manual: false, annotations: { blob: "x".repeat(70_000) } },
              ],
            },
            DONE: { transitions: [] },
          },
        },
      ],
    });
    const result = parseImportPayload(json);
    const issue = result.issues.find((i) => i.code === "annotations-too-large");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
    const doc = result.document!;
    const transitionId = Object.entries(doc.meta.ids.transitions).find(
      ([, p]) => p.workflow === "wf" && p.state === "NEW",
    )?.[0];
    expect(issue!.targetId).toBe(transitionId);
  });

  test("a small annotation produces no size error", () => {
    const result = parseImportPayload(payloadWithStateAnnotation({ ok: true }));
    expect(result.issues.some((i) => i.code === "annotations-too-large")).toBe(false);
  });
});
