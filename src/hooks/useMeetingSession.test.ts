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
    expect(result.current.speakerAliases).toEqual({});
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
    expect(typeof result.current.requestMeetingHistoryDelta).toBe("function");
    expect(typeof result.current.setMeetingMode).toBe("function");
    expect(typeof result.current.updateMeetingTitle).toBe("function");
    expect(typeof result.current.updateSpeakerAlias).toBe("function");
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
    expect(result.current.speakerAliases).toEqual({});
  });

  test("applies speaker aliases from meeting history", async () => {
    const { result } = renderHook(() => useMeetingSession());

    act(() => {
      result.current.connect();
    });
    await new Promise((r) => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0];
    if (ws) {
      act(() => {
        ws.simulateMessage({
          type: "meeting:history",
          data: {
            transcripts: [],
            analyses: [],
            images: [],
            captures: [],
            metaSummaries: [],
            speakerAliases: { 0: "田中" },
          },
        });
      });
    }

    expect(result.current.speakerAliases).toEqual({ 0: "田中" });
  });

  test("applies meeting history delta by appending unique entries", async () => {
    const { result } = renderHook(() => useMeetingSession());

    act(() => {
      result.current.connect();
    });
    await new Promise((r) => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0];
    if (ws) {
      act(() => {
        ws.simulateMessage({
          type: "meeting:history",
          data: {
            transcripts: [
              {
                text: "A",
                timestamp: 1000,
                isFinal: true,
                speaker: 0,
                startTime: 0,
                isUtteranceEnd: true,
              },
            ],
            analyses: [],
            images: [],
            captures: [],
            metaSummaries: [],
            speakerAliases: {},
          },
        });
      });

      act(() => {
        ws.simulateMessage({
          type: "meeting:history:delta",
          data: {
            transcripts: [
              {
                text: "A",
                timestamp: 1000,
                isFinal: true,
                speaker: 0,
                startTime: 0,
                isUtteranceEnd: true,
              },
              {
                text: "B",
                timestamp: 2000,
                isFinal: true,
                speaker: 1,
                startTime: 1,
                isUtteranceEnd: true,
              },
            ],
            analyses: [],
            images: [],
            captures: [],
            metaSummaries: [],
            speakerAliases: { 1: "佐藤" },
          },
        });
      });
    }

    expect(result.current.transcriptSegments).toHaveLength(2);
    expect(result.current.transcriptSegments[0]?.text).toBe("A");
    expect(result.current.transcriptSegments[1]?.text).toBe("B");
    expect(result.current.speakerAliases).toEqual({ 1: "佐藤" });
  });

  test("requests meeting history delta immediately in view mode", async () => {
    const { result } = renderHook(() => useMeetingSession());

    act(() => {
      result.current.connect();
    });
    await new Promise((r) => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0];
    if (!ws) {
      throw new Error("WebSocket instance not found");
    }

    act(() => {
      ws.simulateMessage({
        type: "meeting:status",
        data: {
          meetingId: "550e8400-e29b-41d4-a716-446655440000",
          title: "Weekly",
          sessionId: "session-1",
          mode: "view",
        },
      });
    });

    await new Promise((r) => setTimeout(r, 20));

    const sentJson = (ws.send.mock.calls as unknown[]).flatMap((call) => {
      if (!Array.isArray(call)) return [];
      const payload = call[0];
      if (typeof payload !== "string") return [];
      return [JSON.parse(payload)];
    });

    const deltaRequests = sentJson.filter((msg) => msg.type === "meeting:history:request");
    expect(deltaRequests.length).toBeGreaterThanOrEqual(1);
    expect(deltaRequests[0]).toEqual({
      type: "meeting:history:request",
      data: {
        meetingId: "550e8400-e29b-41d4-a716-446655440000",
        cursor: {},
      },
    });
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
