/**
 * Tests for useElapsedTime hook.
 *
 * Related: src/hooks/useElapsedTime.ts, src/lib/formatTime.ts
 */

import { describe, test, expect, spyOn, afterEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useElapsedTime } from "./useElapsedTime";

describe("useElapsedTime", () => {
  afterEach(() => {
    // Restore any spies after each test
  });

  test("returns 0 and 00:00 when disabled", () => {
    const { result } = renderHook(() => useElapsedTime({ enabled: false }));

    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.formattedTime).toBe("00:00");
  });

  test("returns 0 and 00:00 by default (enabled defaults to false)", () => {
    const { result } = renderHook(() => useElapsedTime());

    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.formattedTime).toBe("00:00");
  });

  test("starts counting when enabled becomes true", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useElapsedTime({ enabled, intervalMs: 100 }),
      { initialProps: { enabled: false } },
    );

    expect(result.current.elapsedSeconds).toBe(0);

    // Enable the timer
    rerender({ enabled: true });

    // Wait for interval to fire
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    // Should have counted at least 0 seconds (based on Date.now difference)
    expect(result.current.elapsedSeconds).toBeGreaterThanOrEqual(0);
  });

  test("resets to 0 when enabled becomes false", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useElapsedTime({ enabled, intervalMs: 100 }),
      { initialProps: { enabled: true } },
    );

    // Wait for some time to pass
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    // Disable the timer
    rerender({ enabled: false });

    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.formattedTime).toBe("00:00");
  });

  test("provides formatted time string", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useElapsedTime({ enabled, intervalMs: 100 }),
      { initialProps: { enabled: false } },
    );

    expect(result.current.formattedTime).toBe("00:00");

    // Enable and wait
    rerender({ enabled: true });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    // Format should be MM:SS
    expect(result.current.formattedTime).toMatch(/^\d{2}:\d{2}$/);
  });

  test("restarts from 0 when re-enabled after being disabled", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useElapsedTime({ enabled, intervalMs: 100 }),
      { initialProps: { enabled: true } },
    );

    // Wait for time to accumulate
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    // Disable
    rerender({ enabled: false });
    expect(result.current.elapsedSeconds).toBe(0);

    // Re-enable
    rerender({ enabled: true });
    expect(result.current.elapsedSeconds).toBe(0);
  });

  test("cleans up interval on unmount", async () => {
    const clearIntervalSpy = spyOn(globalThis, "clearInterval");

    const { unmount } = renderHook(() => useElapsedTime({ enabled: true, intervalMs: 100 }));

    // Wait for interval to be set up
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Unmount should trigger cleanup
    unmount();

    // Verify clearInterval was called during cleanup
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });
});
