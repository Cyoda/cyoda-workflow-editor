import { afterEach, describe, expect, test } from "vitest";
import {
  type CyodaDialect,
  getDialect,
  LATEST_CYODA_VERSION,
  listDialects,
  parseImportPayload,
  registerDialect,
  serializeImportPayload,
} from "../../src/index.js";

// Issue #24 — version-aware cyoda-go schema dialects.

function importJson(workflow: Record<string, unknown>): string {
  return JSON.stringify({ importMode: "MERGE", workflows: [workflow] });
}

const baseWorkflow = {
  version: "1.0",
  name: "wf",
  initialState: "new",
  active: true,
  states: {
    new: {
      transitions: [
        {
          name: "go",
          next: "done",
          manual: false,
          processors: [{ type: "externalized", name: "validate", executionMode: "SYNC" }],
        },
      ],
    },
    done: { transitions: [] },
  },
};

describe("dialect registry", () => {
  test("both 0.7 and 0.8 ship; 0.8 is the latest", () => {
    expect(LATEST_CYODA_VERSION).toBe("0.8");
    expect(listDialects()).toContain("0.7");
    expect(listDialects()).toContain("0.8");
    expect(getDialect("0.7").version).toBe("0.7");
    expect(getDialect("0.8").version).toBe("0.8");
  });

  test("an unknown version throws a clear, actionable error", () => {
    expect(() => getDialect("9.9")).toThrowError(/Unknown cyoda-go schema version "9.9"/);
  });
});

describe("default dialect path records the latest version (0.8)", () => {
  test("parse records 0.8 and serialize is identical with/without explicit 0.8", () => {
    const json = importJson(baseWorkflow);

    const def = parseImportPayload(json);
    expect(def.ok).toBe(true);
    expect(def.document?.meta.cyodaVersion).toBe("0.8");

    const explicit = parseImportPayload(json, undefined, { sourceVersion: "0.8" });
    expect(explicit.document?.meta.cyodaVersion).toBe("0.8");

    // Default serialize == explicit-0.8 serialize.
    const a = serializeImportPayload(def.document!);
    const b = serializeImportPayload(explicit.document!, { targetVersion: "0.8" });
    expect(a).toBe(b);
  });

  test("a schedule-less workflow serializes identically under 0.7 and 0.8", () => {
    const parsed = parseImportPayload(importJson(baseWorkflow), undefined, {
      sourceVersion: "0.7",
    });
    const wire07 = serializeImportPayload(parsed.document!, { targetVersion: "0.7" });
    const wire08 = serializeImportPayload(parsed.document!, { targetVersion: "0.8" });
    expect(wire07).toBe(wire08);
  });
});

describe("pluggability: a host-registered dialect round-trips", () => {
  // A synthetic dialect proving the seam without fabricating a real cyoda-go
  // schema: it wraps 0.7 and uppercases processor `type` on the wire,
  // lowercasing it back on the way in.
  const base = getDialect("0.7");
  const mapProcessorType = (
    workflows: Array<Record<string, unknown>>,
    fn: (t: string) => string,
  ): Array<Record<string, unknown>> =>
    JSON.parse(
      JSON.stringify(workflows, (k, v) => (k === "type" && typeof v === "string" ? fn(v) : v)),
    );

  const upperDialect: CyodaDialect = {
    version: "test-upper",
    toCanonical(raw) {
      const lowered = JSON.parse(
        JSON.stringify(raw, (k, v) =>
          k === "type" && typeof v === "string" && v === v.toUpperCase() ? v.toLowerCase() : v,
        ),
      );
      return base.toCanonical(lowered);
    },
    workflowsToWire(workflows) {
      return mapProcessorType(base.workflowsToWire(workflows), (t) => t.toUpperCase());
    },
  };

  afterEach(() => {
    // Re-register the real 0.7 dialect in case a test replaced it; "test-upper"
    // is harmless to leave registered.
    registerDialect(base);
  });

  test("serialize emits the dialect's wire shape; re-parse restores canonical", () => {
    registerDialect(upperDialect);

    const parsed = parseImportPayload(importJson(baseWorkflow));
    const wire = serializeImportPayload(parsed.document!, { targetVersion: "test-upper" });

    // The custom dialect uppercased the processor type on the wire...
    expect(wire).toContain('"type": "EXTERNALIZED"');
    expect(wire).not.toContain('"type": "externalized"');

    // ...and reading it back through the same dialect restores the canonical form.
    const reparsed = parseImportPayload(wire, undefined, { sourceVersion: "test-upper" });
    expect(reparsed.issues.filter((i) => i.severity === "error")).toEqual([]);
    const proc =
      reparsed.value?.workflows[0]?.states["new"]?.transitions[0]?.processors?.[0];
    expect(proc?.type).toBe("externalized");
  });
});

describe("0.7 dialect: legacy uppercase processor type normalization", () => {
  const workflowWithExternalType = {
    version: "1.0",
    name: "wf",
    initialState: "start",
    active: true,
    states: {
      start: {
        transitions: [
          {
            name: "go",
            next: "done",
            manual: false,
            processors: [
              {
                type: "EXTERNAL",
                name: "my-proc",
                executionMode: "SYNC",
                config: { attachEntity: true, calculationNodesTags: "tag", responseTimeoutMs: 5000 },
              },
            ],
          },
        ],
      },
      done: { transitions: [] },
    },
  };

  test("EXTERNAL (uppercase) is normalised to externalized on import via 0.7 dialect", () => {
    const json = importJson(workflowWithExternalType);
    const result = parseImportPayload(json, undefined, { sourceVersion: "0.7" });
    expect(result.ok).toBe(true);
    const proc = result.value?.workflows[0]?.states["start"]?.transitions[0]?.processors?.[0];
    expect(proc?.type).toBe("externalized");
  });

  test("EXTERNAL (uppercase) is normalised to externalized on import via 0.8 dialect", () => {
    const json = importJson(workflowWithExternalType);
    const result = parseImportPayload(json, undefined, { sourceVersion: "0.8" });
    expect(result.ok).toBe(true);
    const proc = result.value?.workflows[0]?.states["start"]?.transitions[0]?.processors?.[0];
    expect(proc?.type).toBe("externalized");
  });
});
