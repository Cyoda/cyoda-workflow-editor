import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePanZoom } from "../src/hooks/usePanZoom.js";

type Mouse = React.MouseEvent<SVGSVGElement>;
const mouse = (clientX: number, clientY: number, button = 0) =>
  ({ clientX, clientY, button }) as unknown as Mouse;

describe("usePanZoom", () => {
  it("pans by the drag delta", () => {
    const { result } = renderHook(() => usePanZoom());
    act(() => result.current.onMouseDown(mouse(10, 10)));
    act(() => result.current.onMouseMove(mouse(40, 25)));
    act(() => result.current.onMouseUp(mouse(40, 25)));
    expect(result.current.transform).toEqual({ x: 30, y: 15, scale: 1 });
  });

  // Regression: React computes the first update on an idle component eagerly,
  // but queues later ones (a burst of mouse moves) and runs their updaters at
  // the next render. When the button is released before that render — in the
  // viewer, the click that ends a drag also selects a state and renders — the
  // queued updater used to read the already-cleared drag ref and throw
  // "dragStart.current is null", unmounting the whole viewer (blank screen).
  it("does not throw when the drag ends before queued moves are rendered", () => {
    const { result } = renderHook(() => usePanZoom());
    act(() => result.current.onMouseDown(mouse(0, 0)));
    expect(() =>
      act(() => {
        result.current.onMouseMove(mouse(2, 3));
        result.current.onMouseMove(mouse(5, 7));
        result.current.onMouseUp(mouse(5, 7));
      }),
    ).not.toThrow();
    expect(result.current.transform).toEqual({ x: 5, y: 7, scale: 1 });
  });

  it("ignores moves with no drag in progress", () => {
    const { result } = renderHook(() => usePanZoom());
    act(() => result.current.onMouseMove(mouse(50, 50)));
    expect(result.current.transform).toEqual({ x: 0, y: 0, scale: 1 });
  });
});
