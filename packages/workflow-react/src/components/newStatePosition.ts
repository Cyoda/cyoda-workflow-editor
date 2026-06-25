/**
 * Placement helper for newly added states.
 *
 * When a state is created from the toolbar button or the "A" keyboard shortcut
 * there is no pointer location to anchor it to (unlike a canvas double-click).
 * To keep the new node in view, the canvas asks for a center point at the
 * middle of the currently visible viewport. If that point would land on top of
 * an existing node, we search outward on a grid for the nearest free slot so
 * the new node does not overlap anything that is already there.
 *
 * All coordinates are in flow (graph) space.
 */

export interface Rect {
  /** Top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FindOptions {
  /** Minimum empty space required between the new node and any obstacle. */
  gap?: number;
  /** Grid step used when searching outward from the desired center. */
  step?: number;
  /** Maximum number of rings to search before giving up. */
  maxRings?: number;
}

const DEFAULTS: Required<FindOptions> = {
  gap: 24,
  step: 32,
  maxRings: 40,
};

function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * Returns a center point (flow coordinates) at which a node of `size` can be
 * placed without overlapping any `obstacles`. Prefers `desiredCenter`; if that
 * is occupied it spirals outward on a grid and returns the nearest free slot.
 * If no free slot is found within `maxRings`, it falls back to `desiredCenter`.
 */
export function findNonOverlappingCenter(
  desiredCenter: Point,
  size: Size,
  obstacles: readonly Rect[],
  options: FindOptions = {},
): Point {
  const { gap, step, maxRings } = { ...DEFAULTS, ...options };
  const halfW = size.width / 2;
  const halfH = size.height / 2;

  const fits = (cx: number, cy: number): boolean => {
    const candidate: Rect = { x: cx - halfW, y: cy - halfH, width: size.width, height: size.height };
    return !obstacles.some((o) => rectsOverlap(candidate, o, gap));
  };

  if (fits(desiredCenter.x, desiredCenter.y)) return desiredCenter;

  // Expanding square spiral: for each ring, only test the perimeter cells, and
  // return the first free one. This yields the free slot closest to center.
  for (let ring = 1; ring <= maxRings; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cx = desiredCenter.x + dx * step;
        const cy = desiredCenter.y + dy * step;
        if (fits(cx, cy)) return { x: cx, y: cy };
      }
    }
  }

  return desiredCenter;
}
