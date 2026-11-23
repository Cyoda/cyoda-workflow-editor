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
// cyoda-go 0.9.0 binary (a824b3e, built 2026-11-22). The server restamps the
// tag to "1.5", echoes whichever operator spelling was sent (`operator`,
// `operatorType`), writes `startNewTxOnDispatch` beside `executionMode`,
// `idempotent` inside `config`, `retryPolicy` on `schedule.function`, an empty
// or omitted processor `type` as "externalized", and drops an empty
// `transitions` array (`"B": {}`).
const serverExport = readFileSync(join(__dirname, "fixtures/cyoda-0_9_0-export.json"), "utf8");

type Wire = {
  workflows: {
    states: Record<string, { transitions: Record<string, unknown>[] }>;
  }[];
};

describe("cyoda-go 0.9.0 wire format (dialect 0.9)", () => {
  test("a real 0.9.0 export opens with no errors or warnings", () => {
    const parsed = parseExportPayload(serverExport);
    expect(parsed.document).toBeDefined();
    expect(parsed.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(parsed.warnings ?? []).toEqual([]);
  });

  test("new workflows are stamped with schema tag 1.5", () => {
    // WorkflowEditor stamps new workflows with the dialect's schemaVersionTag.
    expect(getDialect("0.9").schemaVersionTag).toBe("1.5");
  });

  test("the export re-serializes with every 0.9.0 field in its 0.9.0 position", () => {
    const parsed = parseExportPayload(serverExport);
    const wire = JSON.parse(serializeImportPayload(parsed.document!)) as Wire;
    const [go, tick] = wire.workflows[0]!.states["A"]!.transitions as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    const [commit, , audit] = go["processors"] as Record<string, unknown>[];
    expect(commit!["startNewTxOnDispatch"]).toBe(true);
    expect(commit!["config"]).toMatchObject({ idempotent: true, retryPolicy: "FIXED" });
    expect(commit!["config"]).not.toHaveProperty("startNewTxOnDispatch");
    expect(audit!["startNewTxOnDispatch"]).toBe(false);
    expect((tick["schedule"] as Record<string, unknown>)["function"]).toMatchObject({
      retryPolicy: "NONE",
    });
    expect(tick["schedule"]).not.toHaveProperty("delayMs");
  });

  test("the `operator` spelling of a leaf's operator is read (the export echoes it)", () => {
    const parsed = parseExportPayload(serverExport);
    const criterion = parsed.document!.session.workflows[0]!.criterion!;
    expect(criterion.type === "group" && criterion.conditions[0]).toMatchObject({
      type: "simple",
      operation: "EQUALS",
    });
  });

  test("`operator` on a group stays the group operator", () => {
    const parsed = parseImportPayload(
      JSON.stringify({
        importMode: "MERGE",
        workflows: [{
          version: "1.5", name: "w", initialState: "A", active: true,
          criterion: {
            type: "group",
            operator: "OR",
            conditions: [{ type: "array", jsonPath: "$.t[*]", operator: "GREATER_THAN", values: [1] }],
          },
          states: { A: { transitions: [] } },
        }],
      }),
    );
    const c = parsed.document!.session.workflows[0]!.criterion!;
    expect(c).toMatchObject({ type: "group", operator: "OR" });
    // The array leaf's `operator` was read — not defaulted to EQUALS.
    expect(c.type === "group" && c.conditions[0]).toMatchObject({ operation: "GREATER_THAN" });
    expect(parsed.issues.map((i) => i.code)).not.toContain("array-criterion-operator-defaulted");
  });

  test("conflicting `operator` and `operation` on one leaf is a parse error, not a silent pick", () => {
    const parsed = parseImportPayload(
      JSON.stringify({
        importMode: "MERGE",
        workflows: [{
          version: "1.5", name: "w", initialState: "A", active: true,
          criterion: { type: "simple", jsonPath: "$.a", operator: "EQUALS", operation: "NOT_EQUAL", value: 1 },
          states: { A: { transitions: [] } },
        }],
      }),
    );
    expect(parsed.document).toBeUndefined();
    expect(parsed.issues.some((i) => i.severity === "error")).toBe(true);
  });

  test("a 0.8.3/0.8.4 export's `delayMs: 0` beside a function is dropped, so it re-saves importable", () => {
    // 0.9.0 refuses any delayMs beside a function, and the 0.8.3/0.8.4
    // exporters wrote `delayMs: 0` beside every one.
    const parsed = parseImportPayload(
      JSON.stringify({
        importMode: "MERGE",
        workflows: [{
          version: "1.4", name: "w", initialState: "A", active: true,
          states: { A: { transitions: [{
            name: "t", next: "A", manual: false,
            schedule: { delayMs: 0, function: { name: "f", resultKind: "Schedule", calculationNodesTags: "t" } },
          }] } },
        }],
      }),
    );
    expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    const wire = JSON.parse(serializeImportPayload(parsed.document!)) as Wire;
    expect(wire.workflows[0]!.states["A"]!.transitions[0]!["schedule"]).not.toHaveProperty("delayMs");
  });
});
