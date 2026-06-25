import { describe, expect, it } from "vitest";
import { findNonOverlappingCenter, type Rect } from "../src/components/newStatePosition.js";

const SIZE = { width: 144, height: 72 };

function asRect(centerX: number, centerY: number, size = SIZE): Rect {
  return { x: centerX - size.width / 2, y: centerY - size.height / 2, width: size.width, height: size.height };
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

describe("findNonOverlappingCenter", () => {
  it("returns the desired centre when the area is empty", () => {
    const result = findNonOverlappingCenter({ x: 100, y: 200 }, SIZE, []);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it("returns the desired centre when no obstacle overlaps it", () => {
    const obstacles: Rect[] = [asRect(1000, 1000)];
    const result = findNonOverlappingCenter({ x: 0, y: 0 }, SIZE, obstacles);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("nudges away from an obstacle sitting on the desired centre", () => {
    const desired = { x: 50, y: 50 };
    const obstacles: Rect[] = [asRect(50, 50)];
    const result = findNonOverlappingCenter(desired, SIZE, obstacles, { gap: 24 });
    expect(result).not.toEqual(desired);
    // The chosen slot must clear every obstacle (including the configured gap).
    const placed = asRect(result.x, result.y);
    expect(obstacles.every((o) => !overlaps(placed, o, 24))).toBe(true);
  });

  it("finds a free slot amid a cluster of nodes", () => {
    const desired = { x: 0, y: 0 };
    const obstacles: Rect[] = [];
    for (let gx = -2; gx <= 2; gx++) {
      for (let gy = -2; gy <= 2; gy++) {
        if (gx === 0 && gy === 0) continue; // leave the exact centre cell, but gap rules push it out
        obstacles.push(asRect(gx * 60, gy * 60));
      }
    }
    const result = findNonOverlappingCenter(desired, SIZE, obstacles, { gap: 16 });
    const placed = asRect(result.x, result.y);
    expect(obstacles.every((o) => !overlaps(placed, o, 16))).toBe(true);
  });

  it("falls back to the desired centre when no slot is found within maxRings", () => {
    const desired = { x: 0, y: 0 };
    // A single obstacle exactly at centre, but only one ring allowed with a
    // step far too small to ever clear the node footprint.
    const obstacles: Rect[] = [asRect(0, 0)];
    const result = findNonOverlappingCenter(desired, SIZE, obstacles, { step: 1, maxRings: 1 });
    expect(result).toEqual(desired);
  });
});
