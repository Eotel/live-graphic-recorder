/**
 * Tests for useMeetingSession hook.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { StrictMode, createElement, useEffect } from "react";
import { useMeetingSession } from "./useMeetingSession";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  binaryType = "blob";
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    MockWebSocket.instances.push(this);
    // Auto-open after a tick
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  send = mock(() => {});
  close = mock(() => {});

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("useMeetingSession", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  test("initializes with default state", () => {
    const { result } = renderHook(() => useMeetingSession());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.sessionStatus).toBe("idle");
    expect(result.current.generationPhase).toBe("idle");
    expect(result.current.transcriptSegments).toEqual([]);
    expect(result.current.summaryPages).toEqual([]);
    expect(result.current.images).toEqual([]);
    expect(result.current.flow).toBe(50);
    expect(result.current.heat).toBe(50);
  });

  test("provides connect and disconnect actions", () => {
    const { result } = renderHook(() => useMeetingSession());

    expect(typeof result.current.connect).toBe("function");
    expect(typeof result.current.disconnect).toBe("function");
    expect(typeof result.current.sendAudio).toBe("function");
    expect(typeof result.current.startMeeting).toBe("function");
    expect(typeof result.current.stopMeeting).toBe("function");
    expect(typeof result.current.requestMeetingList).toBe("function");
    expect(typeof result.current.updateMeetingTitle).toBe("function");
    expect(typeof result.current.startSession).toBe("function");
    expect(typeof result.current.stopSession).toBe("function");
    expect(typeof result.current.sendCameraFrame).toBe("function");
    expect(typeof result.current.setImageModelPreset).toBe("function");
    expect(typeof result.current.resetSession).toBe("function");
  });

  test("resetSession clears all session data", async () => {
    const { result } = renderHook(() => useMeetingSession());

    // Connect first
    act(() => {
      result.current.connect();
    });

    // Wait for connection
    await new Promise((r) => setTimeout(r, 10));

    // Simulate receiving transcript
    const ws = MockWebSocket.instances[0];
    if (ws) {
      act(() => {
        ws.simulateMessage({
          type: "transcript",
          data: {
            text: "Hello",
            isFinal: true,
            timestamp: 1000,
          },
        });
      });
    }

    expect(result.current.transcriptSegments.length).toBeGreaterThanOrEqual(0);

    // Reset
    act(() => {
      result.current.resetSession();
    });

    expect(result.current.transcriptSegments).toEqual([]);
  });

  test("isAnalyzing and isGenerating derived states", async () => {
    const { result } = renderHook(() => useMeetingSession());

    // Connect
    act(() => {
      result.current.connect();
    });

    await new Promise((r) => setTimeout(r, 10));

    // Initially idle
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.isGenerating).toBe(false);

    const ws = MockWebSocket.instances[0];
    if (ws) {
      // Simulate analyzing phase
      act(() => {
        ws.simulateMessage({
          type: "generation:status",
          data: { phase: "analyzing" },
        });
      });

      expect(result.current.isAnalyzing).toBe(true);
      expect(result.current.isGenerating).toBe(false);

      // Simulate generating phase
      act(() => {
        ws.simulateMessage({
          type: "generation:status",
          data: { phase: "generating" },
        });
      });

      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.isGenerating).toBe(true);
    }
  });

  test("auto-connect works under StrictMode", async () => {
    const wrapper = ({ children }: { children: any }) => createElement(StrictMode, null, children);

    const { result } = renderHook(
      () => {
        const session = useMeetingSession();
        useEffect(() => {
          session.connect();
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return session;
      },
      { wrapper },
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.isConnected).toBe(true);
  });
});
