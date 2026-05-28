import { describe, expect, test } from "vitest";
import { Position } from "reactflow";
import {
  orthogonalEdgePath,
  polylineToPath,
  type Rect,
} from "../src/routing/orthogonal.js";

describe("orthogonalEdgePath", () => {
  test("returns ELK routePoints verbatim when provided", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 200, y: 100 },
    ];
    const out = orthogonalEdgePath({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 100,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      routePoints: pts,
    });
    expect(out.points).toEqual(pts);
    expect(out.path).toBe(polylineToPath(pts));
  });

  test("straight-line when anchors face each other and Y is aligned within tolerance", () => {
    const out = orthogonalEdgePath({
      sourceX: 100,
      sourceY: 50,
      targetX: 300,
      targetY: 53, // within 6 px default tolerance
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    expect(out.points).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ]);
    expect(out.path).toBe("M 100 50 L 300 50");
  });

  test("straight-line fails when misalignment exceeds tolerance → falls back to Z", () => {
    const out = orthogonalEdgePath({
      sourceX: 100,
      sourceY: 50,
      targetX: 300,
      targetY: 200,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      alignmentTolerance: 6,
      stubLength: 16,
    });
    expect(out.points.length).toBeGreaterThan(2);
    expect(out.points[0]).toEqual({ x: 100, y: 50 });
    expect(out.points[out.points.length - 1]).toEqual({ x: 300, y: 200 });
  });

  test("Z-shape for Bottom → Top with horizontal mid-segment", () => {
    const out = orthogonalEdgePath({
      sourceX: 50,
      sourceY: 100,
      targetX: 200,
      targetY: 300,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      stubLength: 16,
    });
    // Expect 4 points: source, stub-out, cross, stub-in, target (collinear
    // triples collapsed). Endpoints anchored.
    expect(out.points[0]).toEqual({ x: 50, y: 100 });
    expect(out.points[out.points.length - 1]).toEqual({ x: 200, y: 300 });
    // Middle segment should be horizontal → two consecutive points share Y.
    const pts = out.points;
    let hasHorizontal = false;
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i]!.y === pts[i + 1]!.y && pts[i]!.x !== pts[i + 1]!.x) {
        hasHorizontal = true;
        break;
      }
    }
    expect(hasHorizontal).toBe(true);
  });

  test("obstacle in the midpoint path nudges the middle segment past it", () => {
    const obstacles: Rect[] = [
      { x: 100, y: 180, width: 60, height: 40 },
    ];
    const out = orthogonalEdgePath({
      sourceX: 50,
      sourceY: 100,
      targetX: 300,
      targetY: 300,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      obstacles,
      stubLength: 16,
    });
    // Find the horizontal mid-segment and verify its Y is outside the
    // inflated obstacle range [180-8, 220+8] = [172, 228].
    const pts = out.points;
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i]!.y === pts[i + 1]!.y && pts[i]!.x !== pts[i + 1]!.x) {
        const y = pts[i]!.y;
        const inBand = y >= 172 && y <= 228;
        // If the segment crosses the obstacle X-range at all, y must be
        // outside the inflated band.
        const loX = Math.min(pts[i]!.x, pts[i + 1]!.x);
        const hiX = Math.max(pts[i]!.x, pts[i + 1]!.x);
        if (hiX >= 100 - 8 && loX <= 160 + 8) {
          expect(inBand).toBe(false);
        }
      }
    }
  });

  test("polylineToPath emits valid SVG d for a 3-point path", () => {
    expect(
      polylineToPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe("M 0 0 L 10 0 L 10 10");
  });

  test("polylineToPath returns empty string for an empty input", () => {
    expect(polylineToPath([])).toBe("");
  });

  test("self-loop on a vertically stacked workflow routes out to the side instead of through the node", () => {
    const out = orthogonalEdgePath({
      sourceX: 180,
      sourceY: 320,
      targetX: 180,
      targetY: 260,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      sourceRect: { id: "approved", x: 100, y: 260, width: 160, height: 60 },
      targetRect: { id: "approved", x: 100, y: 260, width: 160, height: 60 },
      stubLength: 16,
    });
    expect(out.points).toEqual([
      { x: 180, y: 320 },
      { x: 180, y: 348 },
      { x: 288, y: 348 },
      { x: 288, y: 232 },
      { x: 180, y: 232 },
      { x: 180, y: 260 },
    ]);
    expect(out.path).toBe("M 180 320 L 180 348 L 288 348 L 288 232 L 180 232 L 180 260");
    expect(out.labelX).toBe(288);
    expect(out.labelY).toBe(348);
  });
});
