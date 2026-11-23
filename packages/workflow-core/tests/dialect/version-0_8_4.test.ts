import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  getDialect,
  parseExportPayload,
  parseImportPayload,
  serializeImportPayload,
} from "../../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Captured verbatim from `GET /model/probe/1/workflow/export` on a running
// cyoda-go 0.8.4 binary. The server restamps the tag to "1.4", writes criteria
// with `operatorType`, emits an array clause's list as `values`, and drops an
// empty `transitions` array (`"B": {}`).
const serverExport = readFileSync(join(__dirname, "fixtures/cyoda-0_8_4-export.json"), "utf8");

function payload(criterion: unknown): string {
  return JSON.stringify({
    importMode: "MERGE",
    workflows: [
      {
        version: "1.4",
        name: "wf",
        initialState: "A",
        active: true,
        states: {
          A: { transitions: [{ name: "go", next: "B", manual: false, criterion }] },
          B: { transitions: [] },
        },
      },
    ],
  });
}

function criterionOut(json: string): Record<string, unknown> {
  const wire = JSON.parse(json) as {
    workflows: { states: Record<string, { transitions: { criterion?: unknown }[] }> }[];
  };
  return wire.workflows[0]!.states["A"]!.transitions[0]!.criterion as Record<string, unknown>;
}

// The "0.8" dialect was removed with cyoda-go 0.9.0 support; the 0.9 dialect
// must still open everything 0.8.4 exported and this editor wrote for it.
describe("cyoda-go 0.8.4 files and exports under the 0.9 dialect", () => {
  test("a real 0.8.4 export opens with no errors or warnings", () => {
    const parsed = parseExportPayload(serverExport);
    expect(parsed.document).toBeDefined();
    expect(parsed.issues.filter((i) => i.severity !== "info")).toEqual([]);
  });

  test("a 0.8.4 export's 1.4 tag stays accepted (0.9.0 accepts 1.1–1.5)", () => {
    const parsed = parseExportPayload(serverExport);
    const codes = parsed.issues.map((i) => i.code);
    expect(codes).not.toContain("workflow-schema-version-malformed");
    expect(codes).not.toContain("workflow-schema-version-outdated");
    expect(getDialect("0.9").acceptedSchemaVersions?.[0]?.maxMinor).toBe(5);
  });

  test("an array clause is read from `values` and written back as `values`", () => {
    const parsed = parseImportPayload(
      payload({ type: "array", jsonPath: "$.tags[*]", operatorType: "EQUALS", values: ["a", null, 1] }),
    );
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    const out = criterionOut(serializeImportPayload(parsed.document!));
    expect(out).toEqual({ type: "array", jsonPath: "$.tags[*]", operation: "EQUALS", values: ["a", null, 1] });
    expect(out).not.toHaveProperty("value");
  });

  test("an array clause without an operator gets EQUALS (0.8.x semantics), with a warning", () => {
    // 0.8.4 compared array positions with equality whatever the clause said;
    // 0.9.0 requires the operator. EQUALS preserves what the clause meant.
    const parsed = parseImportPayload(payload({ type: "array", jsonPath: "$.tags[*]", values: ["a"] }));
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    const issue = parsed.issues.find((i) => i.code === "array-criterion-operator-defaulted");
    expect(issue?.severity).toBe("warning");
    expect(issue?.detail).toEqual({ count: 1 });
    expect(parsed.warnings).toContain("array-criterion-operator-defaulted:1");
    const out = criterionOut(serializeImportPayload(parsed.document!));
    expect(out).toEqual({ type: "array", jsonPath: "$.tags[*]", operation: "EQUALS", values: ["a"] });
  });

  test("a legacy editor file using `value` on an array clause is migrated to `values`", () => {
    // cyoda-go reads only `values`: an array clause written as `value` imports
    // cleanly but carries no positional tests, so it matched every entity.
    const parsed = parseImportPayload(
      payload({ type: "array", jsonPath: "$.tags[*]", operation: "EQUALS", value: ["a"] }),
    );
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    const out = criterionOut(serializeImportPayload(parsed.document!));
    expect(out["values"]).toEqual(["a"]);
    expect(out).not.toHaveProperty("value");
  });

  test("a stored array clause using the legacy `value` key raises a load-time warning", () => {
    const legacy = payload({ type: "array", jsonPath: "$.tags[*]", value: ["a"] });
    const issue = parseImportPayload(legacy).issues.find(
      (i) => i.code === "array-criterion-legacy-value",
    );
    expect(issue?.severity).toBe("warning");
    expect(issue?.detail).toEqual({ count: 1 });

    const exported = JSON.parse(legacy) as { workflows: unknown[] };
    const fromExport = parseExportPayload(
      JSON.stringify({ entityName: "e", modelVersion: 1, workflows: exported.workflows }),
    );
    expect(fromExport.issues.map((i) => i.code)).toContain("array-criterion-legacy-value");

    const current = payload({ type: "array", jsonPath: "$.tags[*]", values: ["a"] });
    expect(parseImportPayload(current).issues.map((i) => i.code)).not.toContain(
      "array-criterion-legacy-value",
    );
  });

  test("conflicting `value` and `values` on one array clause is an error, not a silent pick", () => {
    const parsed = parseImportPayload(
      payload({ type: "array", jsonPath: "$.tags[*]", value: ["a"], values: ["b"] }),
    );
    expect(parsed.document).toBeUndefined();
    expect(parsed.issues.some((i) => i.severity === "error")).toBe(true);
  });

  test("the 0.8.4 lifecycle fields parse", () => {
    for (const field of ["lastUpdateTime", "transitionForLatestSave", "transactionId", "id"]) {
      const parsed = parseImportPayload(
        payload({ type: "lifecycle", field, operatorType: "NOT_NULL", value: null }),
      );
      expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    }
  });
});
