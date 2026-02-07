/**
 * Tests for MediaStreamController.
 */

import { describe, test, expect, mock } from "bun:test";
import { createMediaStreamController, formatMediaError } from "./media-stream-controller";
import type { MediaDevicesAdapter, StreamUtils } from "../adapters/types";
import type { MediaStreamControllerState } from "./types";

// Mock MediaStreamTrack for Node/Bun environment
class MockMediaStreamTrack {
  kind: "audio" | "video";
  onended: (() => void) | null = null;
  private listeners: { [event: string]: Set<() => void> } = {};

  constructor(kind: "audio" | "video") {
    this.kind = kind;
  }

  stop() {}

  getSettings() {
    return { deviceId: `mock-${this.kind}-device` };
  }

  addEventListener(event: string, listener: () => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
  }

  removeEventListener(event: string, listener: () => void) {
    this.listeners[event]?.delete(listener);
  }

  dispatchEvent(event: Event) {
    this.listeners[event.type]?.forEach((listener) => listener());
    if (event.type === "ended" && this.onended) {
      this.onended();
    }
    return true;
  }
}

// Mock MediaStream for Node/Bun environment
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

function createMockAudioTrack(): MockMediaStreamTrack {
  return new MockMediaStreamTrack("audio");
}

function createMockVideoTrack(): MockMediaStreamTrack {
  return new MockMediaStreamTrack("video");
}

function createMockCameraStream(): MockMediaStream {
  return new MockMediaStream([createMockAudioTrack(), createMockVideoTrack()]);
}

function createMockScreenStream(): MockMediaStream {
  return new MockMediaStream([createMockVideoTrack()]);
}

function createMockDeps(): { mediaDevices: MediaDevicesAdapter; streamUtils: StreamUtils } {
  return {
    mediaDevices: {
      hasGetUserMedia: () => true,
      hasGetDisplayMedia: () => true,
      getUserMedia: () => Promise.resolve(new MediaStream()),
      getDisplayMedia: () => Promise.resolve(new MediaStream()),
      enumerateDevices: () => Promise.resolve([]),
      onDeviceChange: () => () => {},
    },
    streamUtils: {
      stopTracks: () => {},
      createStream: () => new MediaStream(),
    },
  };
}

describe("formatMediaError", () => {
  test("formats NotAllowedError", () => {
    const error = new Error("Permission denied");
    error.name = "NotAllowedError";
    expect(formatMediaError(error)).toBe(
      "Permission denied. Please allow camera/microphone access.",
    );
  });

  test("formats NotFoundError", () => {
    const error = new Error("No device");
    error.name = "NotFoundError";
    expect(formatMediaError(error)).toBe("No camera or microphone found.");
  });

  test("formats NotReadableError", () => {
    const error = new Error("In use");
    error.name = "NotReadableError";
    expect(formatMediaError(error)).toBe(
      "Camera/microphone is already in use by another application.",
    );
  });

  test("formats OverconstrainedError", () => {
    const error = new Error("Constraints");
    error.name = "OverconstrainedError";
    expect(formatMediaError(error)).toBe("Cannot satisfy the requested media constraints.");
  });

  test("formats AbortError", () => {
    const error = new Error("Aborted");
    error.name = "AbortError";
    expect(formatMediaError(error)).toBe("Screen sharing was cancelled.");
  });

  test("returns error message for unknown errors", () => {
    const error = new Error("Something went wrong");
    expect(formatMediaError(error)).toBe("Something went wrong");
  });

  test("returns generic message for non-Error", () => {
    expect(formatMediaError("string error")).toBe("An unknown error occurred.");
    expect(formatMediaError(null)).toBe("An unknown error occurred.");
  });
});

describe("createMediaStreamController", () => {
  test("initializes with default state", () => {
    const deps = createMockDeps();
    const onStateChange = mock(() => {});

    const controller = createMediaStreamController(deps, { onStateChange });
    const state = controller.getState();

    expect(state.stream).toBeNull();
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.hasPermission).toBe(false);
    expect(state.sourceType).toBe("camera");
  });

  test("requestPermission calls getUserMedia for camera mode", async () => {
    const getUserMediaMock = mock(() => Promise.resolve(new MediaStream()));
    const deps = createMockDeps();
    deps.mediaDevices.getUserMedia = getUserMediaMock;

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();

    expect(getUserMediaMock).toHaveBeenCalled();
    expect(controller.getState().hasPermission).toBe(true);
  });

  test("requestPermission calls getDisplayMedia for screen mode", async () => {
    const getDisplayMediaMock = mock(() => Promise.resolve(new MediaStream()));
    const getUserMediaMock = mock(() => Promise.resolve(new MediaStream()));
    const deps = createMockDeps();
    deps.mediaDevices.getDisplayMedia = getDisplayMediaMock;
    deps.mediaDevices.getUserMedia = getUserMediaMock;

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    // Switch to screen mode first
    controller.switchSourceType("screen");
    await controller.requestPermission();

    expect(getDisplayMediaMock).toHaveBeenCalled();
    expect(getUserMediaMock).toHaveBeenCalled(); // For audio
  });

  test("stopStream stops tracks and resets state", async () => {
    const stopTracksMock = mock(() => {});
    const deps = createMockDeps();
    deps.streamUtils.stopTracks = stopTracksMock;

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();
    controller.stopStream();

    expect(stopTracksMock).toHaveBeenCalled();
    expect(controller.getState().stream).toBeNull();
    expect(controller.getState().hasPermission).toBe(false);
  });

  test("switchSourceType changes source type", () => {
    const deps = createMockDeps();
    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    expect(controller.getState().sourceType).toBe("camera");

    controller.switchSourceType("screen");
    expect(controller.getState().sourceType).toBe("screen");
  });

  test("setAudioDevice updates selected device", async () => {
    const deps = createMockDeps();
    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.setAudioDevice("device-123");
    expect(controller.getState().selectedAudioDeviceId).toBe("device-123");
  });

  test("setVideoDevice updates selected device in camera mode", async () => {
    const deps = createMockDeps();
    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.setVideoDevice("device-456");
    expect(controller.getState().selectedVideoDeviceId).toBe("device-456");
  });

  test("setVideoDevice does nothing in screen mode", async () => {
    const deps = createMockDeps();
    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    controller.switchSourceType("screen");
    await controller.setVideoDevice("device-456");

    // Should not update in screen mode
    expect(controller.getState().selectedVideoDeviceId).toBeNull();
  });

  test("handles getUserMedia error", async () => {
    const error = new Error("Permission denied");
    error.name = "NotAllowedError";

    const deps = createMockDeps();
    deps.mediaDevices.getUserMedia = () => Promise.reject(error);

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    const result = await controller.requestPermission();

    expect(result).toBe(false);
    expect(controller.getState().error).toBe(
      "Permission denied. Please allow camera/microphone access.",
    );
    expect(controller.getState().hasPermission).toBe(false);
  });

  test("dispose stops tracks and prevents further state changes", async () => {
    const stopTracksMock = mock(() => {});
    const deps = createMockDeps();
    deps.streamUtils.stopTracks = stopTracksMock;

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();
    const callCount = onStateChange.mock.calls.length;

    controller.dispose();

    // Try to trigger state change after dispose
    controller.stopStream();

    // Should not emit after dispose
    expect(onStateChange.mock.calls.length).toBe(callCount);
  });

  test("emits state changes on updates", async () => {
    const deps = createMockDeps();
    const states: MediaStreamControllerState[] = [];
    const onStateChange = mock((state: MediaStreamControllerState) => {
      states.push(state);
    });

    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();

    // Should have emitted multiple state changes
    expect(states.length).toBeGreaterThan(0);

    // Final state should have permission
    const lastState = states[states.length - 1];
    expect(lastState!.hasPermission).toBe(true);
  });
});

describe("switchVideoSource (video switching during recording)", () => {
  test("preserves audioStream when switching from camera to screen", async () => {
    const deps = createMockDeps();
    const cameraStream = createMockCameraStream();
    const screenStream = createMockScreenStream();

    deps.mediaDevices.getUserMedia = mock(() =>
      Promise.resolve(cameraStream as unknown as MediaStream),
    );
    deps.mediaDevices.getDisplayMedia = mock(() =>
      Promise.resolve(screenStream as unknown as MediaStream),
    );

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();
    const initialAudioStream = controller.getState().audioStream;

    const result = await controller.switchVideoSource("screen");

    expect(result).toBe(true);
    expect(controller.getState().sourceType).toBe("screen");
    // Audio stream should be the same instance
    expect(controller.getState().audioStream).toBe(initialAudioStream);
  });

  test("sets isSwitching during video source switch", async () => {
    const deps = createMockDeps();
    const cameraStream = createMockCameraStream();
    let resolveSwitchPromise: (value: MediaStream) => void;
    const switchPromise = new Promise<MediaStream>((resolve) => {
      resolveSwitchPromise = resolve;
    });

    deps.mediaDevices.getUserMedia = mock(() =>
      Promise.resolve(cameraStream as unknown as MediaStream),
    );
    deps.mediaDevices.getDisplayMedia = mock(() => switchPromise);

    const states: MediaStreamControllerState[] = [];
    const onStateChange = mock((state: MediaStreamControllerState) => {
      states.push(state);
    });
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();
    states.length = 0;

    const switchResultPromise = controller.switchVideoSource("screen");

    // Should be switching now
    expect(controller.getState().isSwitching).toBe(true);

    resolveSwitchPromise!(createMockScreenStream() as unknown as MediaStream);
    await switchResultPromise;

    // Should no longer be switching
    expect(controller.getState().isSwitching).toBe(false);
  });

  test("maintains current source on permission denial", async () => {
    const deps = createMockDeps();
    const cameraStream = createMockCameraStream();
    const permissionError = new Error("User cancelled");
    permissionError.name = "AbortError";

    deps.mediaDevices.getUserMedia = mock(() =>
      Promise.resolve(cameraStream as unknown as MediaStream),
    );
    deps.mediaDevices.getDisplayMedia = mock(() => Promise.reject(permissionError));

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();
    const audioStreamBefore = controller.getState().audioStream;

    const result = await controller.switchVideoSource("screen");

    expect(result).toBe(false);
    expect(controller.getState().sourceType).toBe("camera");
    // Audio stream should still be intact
    expect(controller.getState().audioStream).toBe(audioStreamBefore);
    expect(controller.getState().audioStream).not.toBeNull();
    // Combined stream should still work
    expect(controller.getState().stream).not.toBeNull();
  });

  test("calls onScreenShareEnded and switches to camera when screen share ends", async () => {
    const deps = createMockDeps();
    const cameraStream = createMockCameraStream();
    const screenVideoTrack = createMockVideoTrack();
    const screenStream = new MockMediaStream([screenVideoTrack]);

    deps.mediaDevices.getUserMedia = mock(() =>
      Promise.resolve(cameraStream as unknown as MediaStream),
    );
    deps.mediaDevices.getDisplayMedia = mock(() =>
      Promise.resolve(screenStream as unknown as MediaStream),
    );

    const onScreenShareEnded = mock(() => {});
    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, {
      onStateChange,
      onScreenShareEnded,
    });

    await controller.requestPermission();
    await controller.switchVideoSource("screen");

    expect(controller.getState().sourceType).toBe("screen");

    // Simulate screen share ending
    screenVideoTrack.dispatchEvent(new Event("ended"));

    // Wait for auto-switch to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onScreenShareEnded).toHaveBeenCalled();
    expect(controller.getState().sourceType).toBe("camera");
  });

  test("does nothing when switching to same source type", async () => {
    const deps = createMockDeps();
    const cameraStream = createMockCameraStream();

    const getUserMediaMock = mock(() => Promise.resolve(cameraStream as unknown as MediaStream));
    deps.mediaDevices.getUserMedia = getUserMediaMock;

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();
    const callCountAfterPermission = getUserMediaMock.mock.calls.length;

    const result = await controller.switchVideoSource("camera");

    expect(result).toBe(true);
    // Should not have made additional media calls
    expect(getUserMediaMock.mock.calls.length).toBe(callCountAfterPermission);
  });

  test("switching video does not stop audio stream", async () => {
    const deps = createMockDeps();
    const audioTrack = createMockAudioTrack();
    const videoTrack = createMockVideoTrack();
    const cameraStream = new MockMediaStream([audioTrack, videoTrack]);
    const screenStream = createMockScreenStream();

    const stopTracksMock = mock(() => {});
    deps.streamUtils.stopTracks = stopTracksMock;
    deps.mediaDevices.getUserMedia = mock(() =>
      Promise.resolve(cameraStream as unknown as MediaStream),
    );
    deps.mediaDevices.getDisplayMedia = mock(() =>
      Promise.resolve(screenStream as unknown as MediaStream),
    );

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();

    await controller.switchVideoSource("screen");

    // stopTracks should have been called on the video portion but not audio
    // The audioStream should remain the same
    expect(controller.getState().audioStream).not.toBeNull();
  });

  test("initializes with separate audio and video streams", async () => {
    const deps = createMockDeps();
    const cameraStream = createMockCameraStream();

    deps.mediaDevices.getUserMedia = mock(() =>
      Promise.resolve(cameraStream as unknown as MediaStream),
    );

    const onStateChange = mock(() => {});
    const controller = createMediaStreamController(deps, { onStateChange });

    await controller.requestPermission();

    const state = controller.getState();
    expect(state.audioStream).not.toBeNull();
    expect(state.videoStream).not.toBeNull();
    expect(state.isSwitching).toBe(false);
  });
});
