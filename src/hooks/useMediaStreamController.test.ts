/**
 * useMediaStreamController hook tests.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/hooks/useMediaStreamController.ts, src/logic/media-stream-controller.ts
 */

import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { StrictMode, createElement } from "react";
import type { MediaDevicesAdapter, StreamUtils } from "../adapters/types";

// Mock MediaStreamTrack / MediaStream for Bun environment
class MockMediaStreamTrack {
  kind: "audio" | "video";
  onended: (() => void) | null = null;
  constructor(kind: "audio" | "video") {
    this.kind = kind;
  }
  stop() {}
  getSettings() {
    return { deviceId: `mock-${this.kind}-device` };
  }
}

class MockMediaStream {
  private tracks: MockMediaStreamTrack[] = [];
  constructor(tracks?: MockMediaStreamTrack[]) {
    this.tracks = tracks ?? [];
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
}

if (typeof globalThis.MediaStream === "undefined") {
  (globalThis as any).MediaStream = MockMediaStream;
}

function createMockCameraStream() {
  return new MockMediaStream([
    new MockMediaStreamTrack("audio"),
    new MockMediaStreamTrack("video"),
  ]);
}

type MediaProvider = MediaSource | Blob | MediaStream;

function createVideoElement(playImpl: () => Promise<void>) {
  const video = document.createElement("video");
  let attachedStream: MediaStream | null = null;

  Object.defineProperty(video, "srcObject", {
    configurable: true,
    get: () => attachedStream,
    set: (value: MediaProvider | null) => {
      attachedStream = value as MediaStream | null;
    },
  });

  Object.defineProperty(video, "play", {
    configurable: true,
    value: playImpl,
  });

  document.body.appendChild(video);
  return video;
}

const mockGetUserMedia = mock(() =>
  Promise.resolve(createMockCameraStream() as unknown as MediaStream),
);
const mockStopTracks = mock(() => {});

mock.module("../adapters/media-devices", () => ({
  createMediaDevicesAdapter: (): MediaDevicesAdapter => ({
    hasGetUserMedia: () => true,
    hasGetDisplayMedia: () => true,
    getUserMedia: mockGetUserMedia,
    getDisplayMedia: () => Promise.resolve(new MediaStream()),
    enumerateDevices: () => Promise.resolve([]),
    onDeviceChange: () => () => {},
  }),
}));

mock.module("../adapters/stream-utils", () => ({
  createStreamUtils: (): StreamUtils => ({
    stopTracks: mockStopTracks,
    createStream: () => new MediaStream(),
  }),
}));

// Import after mocking
const { useMediaStreamController } = await import("./useMediaStreamController");

describe("useMediaStreamController", () => {
  beforeEach(() => {
    mockGetUserMedia.mockClear();
    mockStopTracks.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("GIVEN initial render WHEN requestPermission THEN hasPermission becomes true", async () => {
    const { result } = renderHook(() => useMediaStreamController());

    expect(result.current.hasPermission).toBe(false);

    await act(async () => {
      const ok = await result.current.requestPermission();
      expect(ok).toBe(true);
    });

    expect(result.current.hasPermission).toBe(true);
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
  });

  test("GIVEN StrictMode WHEN requestPermission THEN hasPermission becomes true", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(StrictMode, null, children);

    const { result } = renderHook(() => useMediaStreamController(), { wrapper });

    expect(result.current.hasPermission).toBe(false);

    await act(async () => {
      const ok = await result.current.requestPermission();
      expect(ok).toBe(true);
    });

    expect(result.current.hasPermission).toBe(true);
  });

  test("GIVEN unmount+remount WHEN requestPermission THEN works with fresh controller", async () => {
    // Simulates StrictMode effect cycle: dispose on cleanup, then re-create on remount.
    // Without the fix (clearing controllerRef on cleanup), the second mount
    // would reuse the disposed controller and requestPermission would silently fail.
    const { unmount } = renderHook(() => useMediaStreamController());
    unmount();

    const { result } = renderHook(() => useMediaStreamController());

    await act(async () => {
      const ok = await result.current.requestPermission();
      expect(ok).toBe(true);
    });

    expect(result.current.hasPermission).toBe(true);
  });

  test("cleanup disposes controller on unmount", () => {
    const { unmount } = renderHook(() => useMediaStreamController());
    unmount();
    // Should not crash
  });

  test("re-attaches stream when video element ref target changes", async () => {
    const firstPlayMock = mock(() => Promise.resolve());
    const secondPlayMock = mock(() => Promise.resolve());
    const firstVideo = createVideoElement(firstPlayMock);
    const secondVideo = createVideoElement(secondPlayMock);

    const { result } = renderHook(() => useMediaStreamController());

    act(() => {
      result.current.videoRef(firstVideo);
    });

    await act(async () => {
      const ok = await result.current.requestPermission();
      expect(ok).toBe(true);
    });

    expect(firstVideo.srcObject).toBe(result.current.stream);

    act(() => {
      result.current.videoRef(secondVideo);
    });

    expect(secondVideo.srcObject).toBe(result.current.stream);
    expect(secondPlayMock).toHaveBeenCalledTimes(1);
    expect(result.current.videoElementRef.current).toBe(secondVideo);
  });
});

afterAll(() => {
  mock.restore();
});
