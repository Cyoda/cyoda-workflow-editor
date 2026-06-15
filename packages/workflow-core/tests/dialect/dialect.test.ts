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
  test("the 0.7 dialect ships and is the latest", () => {
    expect(LATEST_CYODA_VERSION).toBe("0.7");
    expect(listDialects()).toContain("0.7");
    expect(getDialect("0.7").version).toBe("0.7");
  });

  test("an unknown version throws a clear, actionable error", () => {
    expect(() => getDialect("9.9")).toThrowError(/Unknown cyoda-go schema version "9.9"/);
  });
});

describe("default dialect path is unchanged (0.7)", () => {
  test("parse records the latest version and serialize is identical with/without explicit 0.7", () => {
    const json = importJson(baseWorkflow);

    const def = parseImportPayload(json);
    expect(def.ok).toBe(true);
    expect(def.document?.meta.cyodaVersion).toBe("0.7");

    const explicit = parseImportPayload(json, undefined, { sourceVersion: "0.7" });
    expect(explicit.document?.meta.cyodaVersion).toBe("0.7");

    // Default serialize == explicit-0.7 serialize == latest.
    const a = serializeImportPayload(def.document!);
    const b = serializeImportPayload(explicit.document!, { targetVersion: "0.7" });
    expect(a).toBe(b);
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
