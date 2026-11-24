import { describe, expect, it } from "vitest";
import { parseLocalWorkflowFile } from "../src/lib/localWorkflowParsing.js";

const workflow = {
  version: "1.5",
  name: "wf",
  initialState: "A",
  active: true,
  states: { A: { transitions: [{ name: "go", next: "B", manual: true }] }, B: {} },
};

describe("parseLocalWorkflowFile", () => {
  it("opens an import payload", () => {
    const { document } = parseLocalWorkflowFile(JSON.stringify({ importMode: "REPLACE", workflows: [workflow] }));
    expect(document.session.importMode).toBe("REPLACE");
    expect(document.session.workflows[0]!.name).toBe("wf");
  });

  // A cyoda-go `GET …/workflow/export` response has `entityName` /
  // `modelVersion` and no `importMode`; the dev-console opens these by
  // synthesizing `importMode: "MERGE"`.
  it("opens a cyoda-go export payload", () => {
    const { document } = parseLocalWorkflowFile(
      JSON.stringify({ entityName: "probe", modelVersion: 1, workflows: [workflow] }),
    );
    expect(document.session.importMode).toBe("MERGE");
    expect(document.session.workflows[0]!.name).toBe("wf");
  });

  it("opens a bare { workflows } object and a standalone workflow", () => {
    expect(parseLocalWorkflowFile(JSON.stringify({ workflows: [workflow] })).document.session.workflows).toHaveLength(1);
    expect(parseLocalWorkflowFile(JSON.stringify(workflow)).document.session.workflows).toHaveLength(1);
  });

  it("names the actual problem when no document can be built", () => {
    const broken = { importMode: "MERGE", workflows: [{ ...workflow, initialState: undefined }] };
    expect(() => parseLocalWorkflowFile(JSON.stringify(broken))).toThrow(/initialState/);
  });
});
