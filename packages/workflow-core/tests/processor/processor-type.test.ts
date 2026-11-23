import { describe, expect, test } from "vitest";
import { parseImportPayload, serializeImportPayload } from "../../src/index.js";

function parse(type: string) {
  const raw = JSON.stringify({
    importMode: "MERGE",
    workflows: [{
      version: "1.3", name: "w", initialState: "A", active: true,
      states: { A: { transitions: [{
        name: "t", next: "A", manual: true,
        processors: [{ type, name: "p" }],
      }] } },
    }],
  });
  return parseImportPayload(raw);
}

describe("processor type is preserved verbatim (spec §1)", () => {
  // The document keeps whatever type it was given, so a file with a type
  // cyoda-go 0.9.0 refuses still opens (with an error) and can be fixed.
  test.each(["externalized", "EXTERNAL", "SCHEDULED", "internalized", ""])(
    "round-trips %j",
    (type) => {
      const parsed = parse(type);
      expect(parsed.document).toBeDefined();
      const out = JSON.parse(serializeImportPayload(parsed.document!));
      expect(out.workflows[0].states.A.transitions[0].processors[0].type).toBe(type);
    },
  );

  test.each(["externalized", ""])("%j is accepted by cyoda-go 0.9.0 — no error", (type) => {
    expect(parse(type).issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  test("a non-canonical type is an error (cyoda-go 0.9.0 refuses it at import)", () => {
    const issue = parse("SCHEDULED").issues.find(
      (i) => i.code === "processor-type-non-canonical",
    );
    expect(issue?.severity).toBe("error");
  });

  test("internalized is reported specifically, as an error", () => {
    const issues = parse("internalized").issues;
    const issue = issues.find((i) => i.code === "processor-type-internalized");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toMatch(/externalized/);
    expect(issues.map((i) => i.code)).not.toContain("processor-type-non-canonical");
  });

  test("an empty type is canonical and warns about neither", () => {
    const codes = parse("").issues.map((i) => i.code);
    expect(codes).not.toContain("processor-type-non-canonical");
  });

  test("crossover-unsupported fires regardless of type, including canonical empty", () => {
    const raw = JSON.stringify({
      importMode: "MERGE",
      workflows: [{
        version: "1.3", name: "w", initialState: "A", active: true,
        states: { A: { transitions: [{
          name: "t", next: "A", manual: true,
          processors: [{ type: "", name: "p", config: { crossoverToAsyncMs: 100 } }],
        }] } },
      }],
    });
    const parsed = parseImportPayload(raw);
    const issue = parsed.issues.find((i) => i.code === "crossover-unsupported");
    expect(issue?.severity).toBe("warning");
  });
});
