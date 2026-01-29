import { test, expect, describe, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMediaStream } from "./useMediaStream";

describe("useMediaStream", () => {
  const mockMediaStream = {
    getTracks: () => [
      {
        stop: mock(() => {}),
        kind: "audio",
        getSettings: () => ({ deviceId: "audio-1" }),
      },
      {
        stop: mock(() => {}),
        kind: "video",
        getSettings: () => ({ deviceId: "video-1" }),
        onended: null as (() => void) | null,
      },
    ],
    getAudioTracks: () => [
      {
        stop: mock(() => {}),
        getSettings: () => ({ deviceId: "audio-1" }),
      },
    ],
    getVideoTracks: () => [
      {
        stop: mock(() => {}),
        getSettings: () => ({ deviceId: "video-1" }),
        onended: null as (() => void) | null,
      },
    ],
  } as unknown as MediaStream;

  const mockDevices = [
    { kind: "audioinput", deviceId: "audio-1", label: "Mic 1" },
    { kind: "videoinput", deviceId: "video-1", label: "Camera 1" },
  ] as MediaDeviceInfo[];

  beforeEach(() => {
    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: mock(async () => mockMediaStream),
        getDisplayMedia: mock(async () => mockMediaStream),
        enumerateDevices: mock(async () => mockDevices),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Clean up mocks
  });

  describe("initial state", () => {
    test("returns initial state with sourceType as 'camera'", () => {
      const { result } = renderHook(() => useMediaStream());

      expect(result.current.sourceType).toBe("camera");
      expect(result.current.stream).toBeNull();
      expect(result.current.hasPermission).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("switchSourceType", () => {
    test("switches from camera to screen", async () => {
      const { result } = renderHook(() => useMediaStream());

      expect(result.current.sourceType).toBe("camera");

      act(() => {
        result.current.switchSourceType("screen");
      });

      expect(result.current.sourceType).toBe("screen");
    });

    test("switches from screen to camera", async () => {
      const { result } = renderHook(() => useMediaStream());

      act(() => {
        result.current.switchSourceType("screen");
      });

      expect(result.current.sourceType).toBe("screen");

      act(() => {
        result.current.switchSourceType("camera");
      });

      expect(result.current.sourceType).toBe("camera");
    });

    test("does nothing when switching to the same type", async () => {
      const { result } = renderHook(() => useMediaStream());

      expect(result.current.sourceType).toBe("camera");

      act(() => {
        result.current.switchSourceType("camera");
      });

      expect(result.current.sourceType).toBe("camera");
    });

    test("resets hasPermission when switching source type", async () => {
      const { result } = renderHook(() => useMediaStream());

      // Request permission first
      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.hasPermission).toBe(true);

      // Switch source type
      act(() => {
        result.current.switchSourceType("screen");
      });

      expect(result.current.hasPermission).toBe(false);
    });

    test("stops existing stream when switching source type", async () => {
      const { result } = renderHook(() => useMediaStream());

      // Request permission first
      await act(async () => {
        await result.current.requestPermission();
      });

      expect(result.current.stream).not.toBeNull();

      // Switch source type - should stop stream
      act(() => {
        result.current.switchSourceType("screen");
      });

      expect(result.current.stream).toBeNull();
    });
  });

  describe("requestPermission with screen source", () => {
    test("calls getDisplayMedia when sourceType is screen", async () => {
      const { result } = renderHook(() => useMediaStream());

      act(() => {
        result.current.switchSourceType("screen");
      });

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled();
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled(); // For mic audio
    });

    test("calls getUserMedia when sourceType is camera", async () => {
      const { result } = renderHook(() => useMediaStream());

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });
  });

  describe("setVideoDevice in screen mode", () => {
    test("does nothing when sourceType is screen", async () => {
      const { result } = renderHook(() => useMediaStream());

      // Switch to screen mode
      act(() => {
        result.current.switchSourceType("screen");
      });

      // Request permission
      await act(async () => {
        await result.current.requestPermission();
      });

      // Try to set video device - should be a no-op
      const streamBefore = result.current.stream;

      await act(async () => {
        result.current.setVideoDevice("new-video-id");
      });

      // Stream should not have changed (no re-acquisition)
      expect(result.current.stream).toBe(streamBefore);
    });
  });
});
