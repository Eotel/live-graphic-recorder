/**
 * Tests for usePaneState hook.
 *
 * Related: src/hooks/usePaneState.ts, src/logic/pane-state-controller.ts
 */

import { describe, test, expect } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { usePaneState } from "./usePaneState";

describe("usePaneState", () => {
  test("initializes with no expanded pane and no popouts", () => {
    const { result } = renderHook(() => usePaneState());

    expect(result.current.expandedPane).toBeNull();
    expect(result.current.popoutPanes.size).toBe(0);
  });

  test("expandPane updates state", () => {
    const { result } = renderHook(() => usePaneState());

    act(() => {
      result.current.expandPane("summary");
    });

    expect(result.current.expandedPane).toBe("summary");
  });

  test("collapsePane clears expanded pane", () => {
    const { result } = renderHook(() => usePaneState());

    act(() => {
      result.current.expandPane("camera");
    });
    act(() => {
      result.current.collapsePane();
    });

    expect(result.current.expandedPane).toBeNull();
  });

  test("popoutPane updates popoutPanes", () => {
    const { result } = renderHook(() => usePaneState());

    act(() => {
      result.current.popoutPane("graphics");
    });

    expect(result.current.popoutPanes.has("graphics")).toBe(true);
  });

  test("closePopout removes from popoutPanes", () => {
    const { result } = renderHook(() => usePaneState());

    act(() => {
      result.current.popoutPane("graphics");
    });
    act(() => {
      result.current.closePopout("graphics");
    });

    expect(result.current.popoutPanes.has("graphics")).toBe(false);
  });

  test("getPaneMode returns correct mode", () => {
    const { result } = renderHook(() => usePaneState());

    act(() => {
      result.current.expandPane("summary");
    });

    expect(result.current.getPaneMode("summary")).toBe("expanded");
    expect(result.current.getPaneMode("camera")).toBe("normal");
  });

  test("controller is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => usePaneState());

    act(() => {
      result.current.expandPane("summary");
    });

    rerender();

    expect(result.current.expandedPane).toBe("summary");
  });
});
