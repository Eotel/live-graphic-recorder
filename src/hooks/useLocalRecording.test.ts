/**
 * useLocalRecording hook tests.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/hooks/useLocalRecording.ts
 */

import { describe, test, expect, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useLocalRecording } from "./useLocalRecording";

describe("useLocalRecording", () => {
  test("initializes with idle state", () => {
    const { result } = renderHook(() => useLocalRecording());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.sessionId).toBeNull();
    expect(result.current.totalChunks).toBe(0);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.writeChunk).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  test("start transitions to recording", async () => {
    const { result } = renderHook(() => useLocalRecording());

    await act(async () => {
      await result.current.start("session-1");
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.sessionId).toBe("session-1");
  });

  test("writeChunk increments totalChunks", async () => {
    const { result } = renderHook(() => useLocalRecording());

    await act(async () => {
      await result.current.start("session-1");
    });

    await act(async () => {
      await result.current.writeChunk(new ArrayBuffer(100));
    });

    expect(result.current.totalChunks).toBe(1);
  });

  test("stop transitions to idle", async () => {
    const { result } = renderHook(() => useLocalRecording());

    await act(async () => {
      await result.current.start("session-1");
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.sessionId).toBe("session-1");
  });

  test("cleanup disposes controller on unmount", async () => {
    const { result, unmount } = renderHook(() => useLocalRecording());

    await act(async () => {
      await result.current.start("session-1");
    });

    expect(result.current.isRecording).toBe(true);

    unmount();
    // After unmount the controller is disposed — no crash expected
  });
});
