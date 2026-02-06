/**
 * Tests for useBeforeUnloadGuard hook.
 *
 * Related: src/hooks/useBeforeUnloadGuard.ts
 */

import { describe, test, expect, spyOn } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useBeforeUnloadGuard } from "./useBeforeUnloadGuard";

describe("useBeforeUnloadGuard", () => {
  test("registers beforeunload listener when enabled and blocks unload", () => {
    const addEventListenerSpy = spyOn(window, "addEventListener");
    const removeEventListenerSpy = spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useBeforeUnloadGuard(true));
    const beforeUnloadCall = addEventListenerSpy.mock.calls.find(
      (call) => call[0] === "beforeunload",
    );

    expect(beforeUnloadCall).toBeDefined();
    const handler = beforeUnloadCall![1] as (event: BeforeUnloadEvent) => void;

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(event, "returnValue", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    handler(event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe("");

    unmount();

    const removed = removeEventListenerSpy.mock.calls.some(
      (call) => call[0] === "beforeunload" && call[1] === handler,
    );
    expect(removed).toBe(true);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  test("does not register beforeunload listener when disabled", () => {
    const addEventListenerSpy = spyOn(window, "addEventListener");

    renderHook(() => useBeforeUnloadGuard(false));

    const beforeUnloadCall = addEventListenerSpy.mock.calls.find(
      (call) => call[0] === "beforeunload",
    );
    expect(beforeUnloadCall).toBeUndefined();

    addEventListenerSpy.mockRestore();
  });
});
