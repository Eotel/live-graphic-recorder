/**
 * Tests for usePopoutWindow hook.
 *
 * Tests the window.open fallback path (Document PiP is not available in test env).
 *
 * Related: src/hooks/usePopoutWindow.ts
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { usePopoutWindow } from "./usePopoutWindow";

// --- Mock popout window object ---

function createMockPopoutWindow(overrides: Partial<MockPopoutWindow> = {}): MockPopoutWindow {
  const listeners = new Map<string, Set<EventListener>>();
  const headChildren: unknown[] = [];
  const bodyChildren: unknown[] = [];

  return {
    document: {
      head: {
        appendChild: mock((child: unknown) => {
          headChildren.push(child);
        }),
        _children: headChildren,
      },
      body: {
        appendChild: mock((child: unknown) => {
          bodyChildren.push(child);
        }),
        style: {} as CSSStyleDeclaration,
        _children: bodyChildren,
      },
      createElement: mock((tag: string) => document.createElement(tag)),
    },
    addEventListener: mock((event: string, handler: EventListener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    }),
    removeEventListener: mock((event: string, handler: EventListener) => {
      listeners.get(event)?.delete(handler);
    }),
    close: mock(() => {}),
    focus: mock(() => {}),
    closed: false,
    _listeners: listeners,
    _simulateEvent(event: string) {
      listeners.get(event)?.forEach((handler) => handler(new Event(event)));
    },
    ...overrides,
  };
}

interface MockPopoutWindow {
  document: {
    head: { appendChild: ReturnType<typeof mock>; _children: unknown[] };
    body: {
      appendChild: ReturnType<typeof mock>;
      style: CSSStyleDeclaration;
      _children: unknown[];
    };
    createElement: ReturnType<typeof mock>;
  };
  addEventListener: ReturnType<typeof mock>;
  removeEventListener: ReturnType<typeof mock>;
  close: ReturnType<typeof mock>;
  focus: ReturnType<typeof mock>;
  closed: boolean;
  _listeners: Map<string, Set<EventListener>>;
  _simulateEvent: (event: string) => void;
}

// Store original
const originalWindowOpen = globalThis.window.open;

describe("usePopoutWindow", () => {
  let mockPopout: MockPopoutWindow;

  beforeEach(() => {
    mockPopout = createMockPopoutWindow();
    globalThis.window.open = mock(() => mockPopout as unknown as Window);
  });

  afterEach(() => {
    globalThis.window.open = originalWindowOpen;
  });

  test("initial state: isOpen=false, portalContainer=null", () => {
    const { result } = renderHook(() => usePopoutWindow({ title: "Test Window" }));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.portalContainer).toBeNull();
  });

  test("open() sets isOpen=true and creates portalContainer", async () => {
    const { result } = renderHook(() => usePopoutWindow({ title: "Test Window" }));

    await act(async () => {
      await result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.portalContainer).not.toBeNull();
    expect(result.current.portalContainer).toBeInstanceOf(HTMLElement);
  });

  test("open() calls window.open with correct features (fallback path)", async () => {
    const { result } = renderHook(() =>
      usePopoutWindow({ title: "My Pane", width: 1024, height: 768 }),
    );

    await act(async () => {
      await result.current.open();
    });

    expect(globalThis.window.open).toHaveBeenCalledTimes(1);
    const args = (globalThis.window.open as ReturnType<typeof mock>).mock.calls[0]! as string[];
    expect(args[0]).toBe("");
    expect(args[1]).toBe("My Pane");
    expect(args[2]).toContain("width=1024");
    expect(args[2]).toContain("height=768");
  });

  test("open() uses default width=800, height=600", async () => {
    const { result } = renderHook(() => usePopoutWindow({ title: "Default Size" }));

    await act(async () => {
      await result.current.open();
    });

    const args = (globalThis.window.open as ReturnType<typeof mock>).mock.calls[0]! as string[];
    expect(args[2]).toContain("width=800");
    expect(args[2]).toContain("height=600");
  });

  test("open() copies stylesheets from parent to popout", async () => {
    // Add a style and a link[rel=stylesheet] to parent document
    const style = document.createElement("style");
    style.textContent = "body { margin: 0; }";
    document.head.appendChild(style);

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/test.css";
    document.head.appendChild(link);

    const { result } = renderHook(() => usePopoutWindow({ title: "Styled Window" }));

    await act(async () => {
      await result.current.open();
    });

    // Should have appended cloned style + link elements to popout head
    expect(mockPopout.document.head.appendChild).toHaveBeenCalled();
    const calls = mockPopout.document.head.appendChild.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Clean up parent document
    style.remove();
    link.remove();
  });

  test("open() registers pagehide and beforeunload listeners", async () => {
    const { result } = renderHook(() => usePopoutWindow({ title: "Test Window" }));

    await act(async () => {
      await result.current.open();
    });

    // Document PiP uses pagehide, window.open uses beforeunload — we register both
    expect(mockPopout.addEventListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
    expect(mockPopout.addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  test("close() sets isOpen=false and calls popoutWindow.close()", async () => {
    const { result } = renderHook(() => usePopoutWindow({ title: "Test Window" }));

    await act(async () => {
      await result.current.open();
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.portalContainer).toBeNull();
    expect(mockPopout.close).toHaveBeenCalled();
  });

  test("onClose callback fires when popout window is closed via pagehide", async () => {
    const onClose = mock(() => {});

    const { result } = renderHook(() => usePopoutWindow({ title: "Test Window", onClose }));

    await act(async () => {
      await result.current.open();
    });

    // Simulate the popout window being closed (Document PiP fires pagehide)
    act(() => {
      mockPopout._simulateEvent("pagehide");
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.isOpen).toBe(false);
    expect(result.current.portalContainer).toBeNull();
  });

  test("onClose callback fires when popout window is closed via beforeunload", async () => {
    const onClose = mock(() => {});

    const { result } = renderHook(() => usePopoutWindow({ title: "Test Window", onClose }));

    await act(async () => {
      await result.current.open();
    });

    // Simulate the popout window being closed (window.open fires beforeunload)
    act(() => {
      mockPopout._simulateEvent("beforeunload");
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current.isOpen).toBe(false);
  });

  test("popup blocker: window.open returns null → isOpen stays false", async () => {
    globalThis.window.open = mock(() => null) as typeof window.open;

    const { result } = renderHook(() => usePopoutWindow({ title: "Blocked Window" }));

    await act(async () => {
      await result.current.open();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.portalContainer).toBeNull();
  });

  test("cleanup on unmount closes the popout window", async () => {
    const { result, unmount } = renderHook(() => usePopoutWindow({ title: "Test Window" }));

    await act(async () => {
      await result.current.open();
    });

    expect(result.current.isOpen).toBe(true);

    unmount();

    expect(mockPopout.close).toHaveBeenCalled();
  });

  test("calling open() when already open is a no-op", async () => {
    const { result } = renderHook(() => usePopoutWindow({ title: "Test Window" }));

    await act(async () => {
      await result.current.open();
    });

    const firstContainer = result.current.portalContainer;

    await act(async () => {
      await result.current.open();
    });

    // Should not have created a second window
    expect(globalThis.window.open).toHaveBeenCalledTimes(1);
    expect(result.current.portalContainer).toBe(firstContainer);
  });

  test("calling close() when not open is a no-op", () => {
    const { result } = renderHook(() => usePopoutWindow({ title: "Test Window" }));

    // Should not throw
    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
  });

  test("cleanup removes event listeners from popout window", async () => {
    const { result, unmount } = renderHook(() => usePopoutWindow({ title: "Test Window" }));

    await act(async () => {
      await result.current.open();
    });

    unmount();

    expect(mockPopout.removeEventListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
    expect(mockPopout.removeEventListener).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });
});
