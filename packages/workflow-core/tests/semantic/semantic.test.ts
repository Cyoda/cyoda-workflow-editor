import { describe, expect, test } from "vitest";
import { parseImportPayload } from "../../src/index.js";

function codes(json: unknown): string[] {
  const result = parseImportPayload(JSON.stringify(json));
  return result.issues.map((i) => i.code);
}

describe("semantic validation", () => {
  test("clean workflow produces no errors", () => {
    const json = {
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "clean",
          initialState: "start",
          active: true,
          states: {
            start: { transitions: [{ name: "go", next: "end", manual: false, disabled: false }] },
            end: { transitions: [] },
          },
        },
      ],
    };
    expect(codes(json).filter((c) => c.startsWith("schema-"))).toEqual([]);
    const issues = parseImportPayload(JSON.stringify(json)).issues;
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  test("duplicate-workflow-name", () => {
    const json = {
      importMode: "MERGE",
      workflows: [
        makeWf("dup"),
        makeWf("dup"),
      ],
    };
    expect(codes(json)).toContain("duplicate-workflow-name");
  });

  test("unknown-initial-state", () => {
    const json = {
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "missing",
          active: true,
          states: {
            a: { transitions: [] },
          },
        },
      ],
    };
    expect(codes(json)).toContain("unknown-initial-state");
  });

  test("unknown-transition-target", () => {
    const json = {
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: {
            a: {
              transitions: [
                { name: "go", next: "ghost", manual: false, disabled: false },
              ],
            },
          },
        },
      ],
    };
    expect(codes(json)).toContain("unknown-transition-target");
  });

  test("unreachable-state", () => {
    const json = {
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: {
            a: { transitions: [] },
            lonely: { transitions: [] },
          },
        },
      ],
    };
    expect(codes(json)).toContain("unreachable-state");
  });

  test("duplicate-transition-name", () => {
    const json = {
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: {
            a: {
              transitions: [
                { name: "go", next: "b", manual: false, disabled: false },
                { name: "go", next: "b", manual: false, disabled: false },
              ],
            },
            b: { transitions: [] },
          },
        },
      ],
    };
    expect(codes(json)).toContain("duplicate-transition-name");
  });

  test("crossover-without-async-result", () => {
    const json = {
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: {
            a: {
              transitions: [
                {
                  name: "t",
                  next: "b",
                  manual: false,
                  disabled: false,
                  processors: [
                    {
                      type: "externalized",
                      name: "p",
                      config: { crossoverToAsyncMs: 1000 },
                    },
                  ],
                },
              ],
            },
            b: { transitions: [] },
          },
        },
      ],
    };
    expect(codes(json)).toContain("crossover-without-async-result");
  });

  test("all-transitions-manual", () => {
    const json = {
      importMode: "MERGE",
      workflows: [
        {
          version: "1.0",
          name: "wf",
          initialState: "a",
          active: true,
          states: {
            a: {
              transitions: [
                { name: "t1", next: "b", manual: true, disabled: false },
                { name: "t2", next: "c", manual: true, disabled: false },
              ],
            },
            b: { transitions: [] },
            c: { transitions: [] },
          },
        },
      ],
    };
    expect(codes(json)).toContain("all-transitions-manual");
  });
});

function makeWf(name: string) {
  return {
    version: "1.0",
    name,
    initialState: "s",
    active: true,
    states: { s: { transitions: [] } },
  };
}

// ---------------------------------------------------------------------------
// Canonical JSON tolerance: fields the Cyoda API omits that the schema defaults
// ---------------------------------------------------------------------------
describe("canonical JSON tolerance", () => {
  const HELLO_WORLD = {
    importMode: "REPLACE",
    workflows: [
      {
        version: "1",
        name: "HelloWorldWorkflow",
        initialState: "START",
        active: true,
        states: {
          START: {
            transitions: [
              { name: "ToMorning", next: "MORNING", manual: false,
                criterion: { type: "function", function: { name: "IsMorningCriterion", config: { calculationNodesTags: "helloworld", attachEntity: true } } } },
              { name: "ToAfternoon", next: "AFTERNOON", manual: false,
                criterion: { type: "function", function: { name: "IsAfternoonCriterion", config: { calculationNodesTags: "helloworld", attachEntity: true } } } },
            ],
          },
          MORNING: {
            transitions: [
              { name: "MorningToDone", next: "DONE", manual: false,
                processors: [
                  { name: "SetMorningProcessor", executionMode: "SYNC", config: { calculationNodesTags: "helloworld", attachEntity: true } },
                  { name: "PrintGreetingProcessor", executionMode: "SYNC", config: { calculationNodesTags: "helloworld", attachEntity: true } },
                ] },
            ],
          },
          AFTERNOON: {
            transitions: [
              { name: "AfternoonToDone", next: "DONE", manual: false,
                processors: [
                  { name: "SetAfternoonProcessor", executionMode: "SYNC", config: { calculationNodesTags: "helloworld", attachEntity: true } },
                  { name: "PrintGreetingProcessor", executionMode: "SYNC", config: { calculationNodesTags: "helloworld", attachEntity: true } },
                ] },
            ],
          },
          DONE: { transitions: [] },
        },
      },
    ],
  };

  test("hello world workflow parses without errors (no disabled, no processor type)", () => {
    const result = parseImportPayload(JSON.stringify(HELLO_WORLD));
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(result.document).toBeDefined();
  });

  test("omitted transition disabled defaults to false", () => {
    const result = parseImportPayload(JSON.stringify(HELLO_WORLD));
    const wf = result.document!.session.workflows[0]!;
    for (const state of Object.values(wf.states)) {
      for (const t of state.transitions) {
        expect(t.disabled).toBe(false);
      }
    }
  });

  test("processor without type is normalized to externalized", () => {
    const result = parseImportPayload(JSON.stringify(HELLO_WORLD));
    const wf = result.document!.session.workflows[0]!;
    for (const state of Object.values(wf.states)) {
      for (const t of state.transitions) {
        for (const p of t.processors ?? []) {
          expect(p.type).toBe("externalized");
        }
      }
    }
  });
});
