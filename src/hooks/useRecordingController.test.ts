/**
 * Tests for useRecordingController hook.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/hooks/useRecordingController.ts, src/logic/recording-controller.ts
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useRecordingController } from "./useRecordingController";
import type { UseRecordingControllerOptions } from "./useRecordingController";

// Mock the media-recorder adapter module
import { createMediaRecorderAdapter } from "../adapters/media-recorder";

// Since MediaRecorder isn't available in test env, we need to mock the module
// The hook creates the adapter internally, so we test behavior through the hook API

describe("useRecordingController", () => {
  function defaultOptions(): UseRecordingControllerOptions {
    return {
      audioStream: null,
      hasPermission: false,
      isConnected: false,
      hasMeeting: false,
      onChunk: mock(() => {}),
      onSessionStart: mock(() => {}),
      onSessionStop: mock(() => {}),
    };
  }

  test("initializes with idle state", () => {
    const { result } = renderHook(() => useRecordingController(defaultOptions()));

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isPendingStart).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.stop).toBe("function");
  });

  test("start() without audioStream sets error", () => {
    const opts = {
      ...defaultOptions(),
      hasPermission: true,
      isConnected: true,
      hasMeeting: true,
    };

    const { result } = renderHook(() => useRecordingController(opts));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).not.toBeNull();
  });

  test("start() without meeting is a no-op", () => {
    const opts = {
      ...defaultOptions(),
      hasPermission: true,
      isConnected: true,
      hasMeeting: false,
    };

    const { result } = renderHook(() => useRecordingController(opts));

    act(() => {
      result.current.start();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isPendingStart).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("stop() in idle is a no-op", () => {
    const onSessionStop = mock(() => {});
    const opts = { ...defaultOptions(), onSessionStop };

    const { result } = renderHook(() => useRecordingController(opts));

    act(() => {
      result.current.stop();
    });

    expect(onSessionStop).not.toHaveBeenCalled();
  });
});
