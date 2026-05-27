import { describe, expect, test } from "vitest";
import { parseImportPayload } from "@cyoda/workflow-core";
import { projectToGraph } from "@cyoda/workflow-graph";
import { layoutGraph, estimateNodeSize } from "../src/index.js";

function project(json: unknown) {
  const parsed = parseImportPayload(JSON.stringify(json));
  if (!parsed.document) {
    throw new Error("parse failed: " + JSON.stringify(parsed.issues));
  }
  return projectToGraph(parsed.document);
}

const minimal = {
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "a",
      active: true,
      states: {
        a: {
          transitions: [{ name: "go", next: "b", manual: false, disabled: false }],
        },
        b: {
          transitions: [{ name: "back", next: "a", manual: false, disabled: false }],
        },
      },
    },
  ],
};

const linear = {
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "draft",
      active: true,
      states: {
        draft: {
          transitions: [
            { name: "submit", next: "review", manual: false, disabled: false },
          ],
        },
        review: {
          transitions: [
            { name: "approve", next: "done", manual: true, disabled: false },
          ],
        },
        done: { transitions: [] },
      },
    },
  ],
};

/** 4-state fixture matching the sample workflow in cyoda-launchpad. */
const fourState = {
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "new",
      active: true,
      states: {
        new: {
          transitions: [
            {
              name: "to_active",
              next: "active",
              manual: false,
              disabled: false,
              processors: [
                { type: "externalized", name: "validate", executionMode: "SYNC", config: { attachEntity: true } },
              ],
            },
          ],
        },
        active: {
          transitions: [
            {
              name: "to_approved",
              next: "approved",
              manual: true,
              disabled: false,
              processors: [
                { type: "externalized", name: "notify", executionMode: "ASYNC_NEW_TX", config: { attachEntity: true } },
              ],
            },
          ],
        },
        approved: {
          transitions: [
            {
              name: "to_archived",
              next: "archived",
              manual: false,
              disabled: false,
              criterion: {
                type: "lifecycle",
                field: "creationDate",
                operation: "LESS_OR_EQUAL",
                value: "NOW_MINUS_30D",
              },
            },
          ],
        },
        archived: {
          transitions: [
            { name: "reactivate", next: "active", manual: true, disabled: false },
          ],
        },
      },
    },
  ],
};

/** Dense branching fixture: one source, three targets, two back-edges. */
const branching = {
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: {
          transitions: [
            { name: "to_a", next: "a", manual: false, disabled: false },
            { name: "to_b", next: "b", manual: true, disabled: false },
            { name: "to_c", next: "c", manual: false, disabled: false },
          ],
        },
        a: {
          transitions: [
            { name: "done_a", next: "end", manual: false, disabled: false },
            { name: "retry_a", next: "start", manual: true, disabled: false },
          ],
        },
        b: {
          transitions: [
            { name: "done_b", next: "end", manual: false, disabled: false },
            { name: "retry_b", next: "start", manual: true, disabled: false },
          ],
        },
        c: {
          transitions: [
            { name: "done_c", next: "end", manual: false, disabled: false },
          ],
        },
        end: { transitions: [] },
      },
    },
  ],
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function round(n: number) { return Math.round(n); }

function posSnapshot(positions: Map<string, { x: number; y: number; width: number; height: number }>, codes: string[], graph: ReturnType<typeof project>) {
  const byCode: Record<string, unknown> = {};
  for (const code of codes) {
    const node = graph.nodes.find(n => n.kind === "state" && n.stateCode === code);
    if (!node) continue;
    const p = positions.get(node.id);
    if (!p) continue;
    byCode[code] = { x: round(p.x), y: round(p.y), w: round(p.width), h: round(p.height) };
  }
  return byCode;
}

// ─── correctness tests ────────────────────────────────────────────────────────

describe("layoutGraph", () => {
  test("returns positions for every state node", async () => {
    const graph = project(linear);
    const result = await layoutGraph(graph);
    const stateIds = graph.nodes.filter((n) => n.kind === "state").map((n) => n.id);
    for (const id of stateIds) {
      const pos = result.positions.get(id);
      expect(pos, `missing position for ${id}`).toBeTruthy();
      expect(pos!.width).toBeGreaterThan(0);
      expect(pos!.height).toBeGreaterThan(0);
    }
  });

  test("places initial above terminal in top-to-bottom flow", async () => {
    const graph = project(linear);
    const result = await layoutGraph(graph, { preset: "websiteCompact" });
    const draft = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "draft")!;
    const done = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "done")!;
    expect(result.positions.get(draft.id)!.y).toBeLessThan(result.positions.get(done.id)!.y);
  });

  test("honours pinned positions", async () => {
    const graph = project(linear);
    const draft = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "draft")!;
    const result = await layoutGraph(graph, { pinned: [{ id: draft.id, x: 500, y: 500 }] });
    const pos = result.positions.get(draft.id)!;
    expect(pos.x).toBe(500);
    expect(pos.y).toBe(500);
  });

  test("handles graphs with no state nodes", async () => {
    const result = await layoutGraph({ nodes: [], edges: [], annotations: [] } as const);
    expect(result.positions.size).toBe(0);
    expect(result.edges.size).toBe(0);
  });

  test("horizontal initial state is to the left of terminal", async () => {
    const graph = project(linear);
    const result = await layoutGraph(graph, { orientation: "horizontal" });
    const draft = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "draft")!;
    const done = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "done")!;
    expect(result.positions.get(draft.id)!.x).toBeLessThan(result.positions.get(done.id)!.x);
  });

  test("respects all three presets without crashing", async () => {
    const graph = project(linear);
    for (const preset of ["websiteCompact", "configuratorReadable", "opsAudit"] as const) {
      const result = await layoutGraph(graph, { preset });
      expect(result.preset).toBe(preset);
      expect(result.positions.size).toBeGreaterThan(0);
    }
  });

  // ─── node sizing ─────────────────────────────────────────────────────────────

  test("estimateNodeSize returns base width for short codes", () => {
    expect(estimateNodeSize("new").width).toBe(144);
    expect(estimateNodeSize("new").height).toBe(72);
    expect(estimateNodeSize("active").width).toBe(144);
  });

  test("estimateNodeSize grows width for long codes and snaps to 16px grid", () => {
    const s = estimateNodeSize("VERY_LONG_STATE_CODE_NAME");
    expect(s.width).toBeGreaterThan(144);
    expect(s.width % 16).toBe(0);
  });

  test("layout uses per-node sizes matching estimateNodeSize", async () => {
    const graph = project(linear);
    const result = await layoutGraph(graph);
    for (const node of graph.nodes) {
      if (node.kind !== "state") continue;
      const pos = result.positions.get(node.id)!;
      const expected = estimateNodeSize(node.stateCode);
      expect(pos.width).toBe(expected.width);
      expect(pos.height).toBe(expected.height);
    }
  });
});

// ─── regression fixtures ──────────────────────────────────────────────────────

describe("regression: 4-state workflow (vertical)", () => {
  test("node positions are stable", async () => {
    const graph = project(fourState);
    const result = await layoutGraph(graph, { preset: "configuratorReadable" });
    const snap = posSnapshot(result.positions, ["new", "active", "approved", "archived"], graph);
    // Nodes must be vertically ordered and non-overlapping.
    const ys = Object.values(snap).map((p) => (p as { y: number }).y);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]!);
    }
    // All nodes must have positive coordinates.
    for (const p of Object.values(snap)) {
      const { x, y } = p as { x: number; y: number };
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("regression: 4-state workflow (horizontal)", () => {
  test("nodes are horizontally ordered and non-overlapping", async () => {
    const graph = project(fourState);
    const result = await layoutGraph(graph, { preset: "configuratorReadable", orientation: "horizontal" });
    const snap = posSnapshot(result.positions, ["new", "active", "approved", "archived"], graph);
    const xs = Object.values(snap).map((p) => (p as { x: number }).x);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]!);
    }
  });
});

describe("regression: branching graph", () => {
  test("all nodes have positions", async () => {
    const graph = project(branching);
    const result = await layoutGraph(graph, { preset: "configuratorReadable" });
    const stateCodes = graph.nodes.filter((n) => n.kind === "state").map((n) => n.stateCode);
    for (const code of stateCodes) {
      const node = graph.nodes.find((n) => n.kind === "state" && n.stateCode === code)!;
      expect(result.positions.get(node.id)).toBeTruthy();
    }
  });

  test("initial state (start) is in the topmost layer", async () => {
    const graph = project(branching);
    const result = await layoutGraph(graph, { preset: "configuratorReadable" });
    const startNode = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "start")!;
    const endNode = graph.nodes.find((n) => n.kind === "state" && n.stateCode === "end")!;
    expect(result.positions.get(startNode.id)!.y).toBeLessThan(
      result.positions.get(endNode.id)!.y,
    );
  });
});
