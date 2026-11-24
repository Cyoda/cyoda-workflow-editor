import { useCallback, useRef, useState } from "react";

export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export interface PanZoomHandlers {
  transform: ViewportTransform;
  onWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
  onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
  reset: () => void;
  setTransform: (t: ViewportTransform) => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.1;

/**
 * Minimal pan + zoom state for a single SVG `<g>` transform. No inertia, no
 * trackpad-gesture normalisation — deferred to when we adopt react-zoom-pan
 * or a similar library.
 */
export function usePanZoom(initial?: Partial<ViewportTransform>): PanZoomHandlers {
  const [transform, setTransform] = useState<ViewportTransform>({
    x: initial?.x ?? 0,
    y: initial?.y ?? 0,
    scale: initial?.scale ?? 1,
  });
  const dragStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    setTransform((t) => {
      const nextScale = clamp(t.scale * delta, MIN_SCALE, MAX_SCALE);
      const ratio = nextScale / t.scale;
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      return {
        scale: nextScale,
        x: px - (px - t.x) * ratio,
        y: py - (py - t.y) * ratio,
      };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY, vx: transform.x, vy: transform.y };
  }, [transform.x, transform.y]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const start = dragStart.current;
    if (!start) return;
    // Compute the target now, from the event. The updater below may run later
    // (React queues all but the first update on an idle component), by which
    // time mouse-up has cleared `dragStart` — reading the ref inside it threw
    // and unmounted the viewer.
    const x = start.vx + (e.clientX - start.x);
    const y = start.vy + (e.clientY - start.y);
    setTransform((t) => ({ ...t, x, y }));
  }, []);

  const onMouseUp = useCallback(() => {
    dragStart.current = null;
  }, []);

  const reset = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  return { transform, onWheel, onMouseDown, onMouseMove, onMouseUp, reset, setTransform };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
