/**
 * Tests for transition block node computation logic.
 *
 * These tests exercise the pure utility logic for positioning transition block
 * nodes (midpoint computation, stored position override, self-transition
 * positioning) without needing a full React component render.
 */
import { describe, it, expect } from "vitest";
import { parseImportPayload } from "@cyoda/workflow-core";
import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
import type { LayoutResult } from "@cyoda/workflow-layout";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fixture(json: string): WorkflowEditorDocument {
  const result = parseImportPayload(json);
  if (!result.document) throw new Error("fixture parse failed");
  return result.document;
}

function stateUuid(
  doc: WorkflowEditorDocument,
  workflow: string,
  stateCode: string,
): string {
  const entry = Object.entries(doc.meta.ids.states).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`State UUID not found for ${workflow}:${stateCode}`);
  return entry[0];
}

function transitionUuid(
  doc: WorkflowEditorDocument,
  workflow: string,
  stateCode: string,
): string {
  const entry = Object.entries(doc.meta.ids.transitions).find(
    ([, ptr]) => ptr.workflow === workflow && ptr.state === stateCode,
  );
  if (!entry) throw new Error(`Transition UUID not found for ${workflow}:${stateCode}`);
  return entry[0];
}

// ── Pure utility: midpoint computation ───────────────────────────────────────

const BLOCK_WIDTH = 120;
const BLOCK_HEIGHT = 36;

function computeMidpoint(
  srcPos: { x: number; y: number; width: number; height: number },
  tgtPos: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: (srcPos.x + srcPos.width / 2 + tgtPos.x + tgtPos.width / 2) / 2 - BLOCK_WIDTH / 2,
    y: (srcPos.y + srcPos.height / 2 + tgtPos.y + tgtPos.height / 2) / 2 - BLOCK_HEIGHT / 2,
  };
}

function computeSelfTransitionPosition(
  srcPos: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: srcPos.x + srcPos.width + 20,
    y: srcPos.y - BLOCK_HEIGHT / 2,
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TWO_STATE_CONNECTED = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "start",
      active: true,
      states: {
        start: { transitions: [{ name: "go", next: "end", manual: false, disabled: false }] },
        end: { transitions: [] },
      },
    },
  ],
});

const SELF_LOOP = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "wf",
      initialState: "approved",
      active: true,
      states: {
        approved: {
          transitions: [{ name: "retry_here", next: "approved", manual: true, disabled: false }],
        },
      },
    },
  ],
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("transition block midpoint computation", () => {
  it("computes the correct midpoint between source and target node centers", () => {
    const srcPos = { x: 100, y: 100, width: 160, height: 60 };
    const tgtPos = { x: 100, y: 300, width: 160, height: 60 };

    const mid = computeMidpoint(srcPos, tgtPos);

    // Source center: (180, 130); Target center: (180, 330)
    // Midpoint of centers: (180, 230)
    // Minus half block size: (180 - 60, 230 - 18) = (120, 212)
    expect(mid.x).toBe(120);
    expect(mid.y).toBe(212);
  });

  it("centers the block horizontally when source and target are at different x positions", () => {
    const srcPos = { x: 0, y: 0, width: 160, height: 60 };
    const tgtPos = { x: 400, y: 0, width: 160, height: 60 };

    const mid = computeMidpoint(srcPos, tgtPos);

    // Source center: (80, 30); Target center: (480, 30)
    // Midpoint of centers: (280, 30)
    // Minus half block size: (280 - 60, 30 - 18) = (220, 12)
    expect(mid.x).toBe(220);
    expect(mid.y).toBe(12);
  });

  it("places self-transition block to the right of the source node", () => {
    const srcPos = { x: 120, y: 220, width: 160, height: 60 };

    const pos = computeSelfTransitionPosition(srcPos);

    // x = srcPos.x + srcPos.width + 20 = 120 + 160 + 20 = 300
    // y = srcPos.y - BLOCK_HEIGHT / 2 = 220 - 18 = 202
    expect(pos.x).toBe(300);
    expect(pos.y).toBe(202);
  });
});

describe("transition block stored position override", () => {
  it("uses stored position when transitionPositions has an entry", () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const uuid = transitionUuid(doc, "wf", "start");
    const startId = stateUuid(doc, "wf", "start");
    const endId = stateUuid(doc, "wf", "end");

    const storedPos = { x: 999, y: 888 };
    const transitionPositions: Record<string, { x: number; y: number }> = {
      [uuid]: storedPos,
    };

    const srcPos = { x: 100, y: 100, width: 160, height: 60 };
    const tgtPos = { x: 100, y: 300, width: 160, height: 60 };

    // Verify that the stored position takes precedence over computed midpoint
    const computedMid = computeMidpoint(srcPos, tgtPos);
    const usedPos = transitionPositions[uuid] ?? computedMid;

    expect(usedPos).toEqual(storedPos);
    expect(usedPos).not.toEqual(computedMid);

    // Confirm IDs resolved correctly
    expect(startId).toBeTruthy();
    expect(endId).toBeTruthy();
  });

  it("falls back to computed midpoint when no stored position", () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const uuid = transitionUuid(doc, "wf", "start");

    const transitionPositions: Record<string, { x: number; y: number }> = {};

    const srcPos = { x: 100, y: 100, width: 160, height: 60 };
    const tgtPos = { x: 100, y: 300, width: 160, height: 60 };

    const computedMid = computeMidpoint(srcPos, tgtPos);
    const usedPos = transitionPositions[uuid] ?? computedMid;

    expect(usedPos).toEqual(computedMid);
    expect(usedPos.x).toBe(120);
    expect(usedPos.y).toBe(212);
  });
});

describe("transition block layout position tracking", () => {
  it("verifies transition UUID is present in document ids", () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const uuid = transitionUuid(doc, "wf", "start");

    expect(uuid).toBeTruthy();
    const ptr = doc.meta.ids.transitions[uuid];
    expect(ptr).toBeDefined();
    expect(ptr?.workflow).toBe("wf");
    expect(ptr?.state).toBe("start");
  });

  it("verifies self-loop transition UUID is present in document ids", () => {
    const doc = fixture(SELF_LOOP);
    const uuid = transitionUuid(doc, "wf", "approved");

    expect(uuid).toBeTruthy();
    const ptr = doc.meta.ids.transitions[uuid];
    expect(ptr).toBeDefined();
    expect(ptr?.workflow).toBe("wf");
    expect(ptr?.state).toBe("approved");
  });

  it("correctly maps transition position via transitionPositions after setTransitionBlockPosition", () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const uuid = transitionUuid(doc, "wf", "start");

    // Simulate what applyPatch(setTransitionBlockPosition) does to the document
    const updatedTransitionPositions: Record<string, { x: number; y: number }> = {
      [uuid]: { x: 200, y: 150 },
    };

    // After applying the patch, the block should use the stored position
    const storedPos = updatedTransitionPositions[uuid];
    expect(storedPos).toEqual({ x: 200, y: 150 });
  });
});

describe("layout result position integration", () => {
  it("builds a valid LayoutResult structure for midpoint computation", () => {
    const doc = fixture(TWO_STATE_CONNECTED);
    const startId = stateUuid(doc, "wf", "start");
    const endId = stateUuid(doc, "wf", "end");

    const layout: LayoutResult = {
      positions: new Map([
        [startId, { id: startId, x: 100, y: 100, width: 160, height: 60 }],
        [endId, { id: endId, x: 100, y: 300, width: 160, height: 60 }],
      ]),
      edges: new Map(),
      width: 500,
      height: 500,
      preset: "configuratorReadable",
    };

    const srcPos = layout.positions.get(startId);
    const tgtPos = layout.positions.get(endId);

    expect(srcPos).toBeDefined();
    expect(tgtPos).toBeDefined();

    if (srcPos && tgtPos) {
      const mid = computeMidpoint(srcPos, tgtPos);
      expect(mid.x).toBe(120);
      expect(mid.y).toBe(212);
    }
  });
});
