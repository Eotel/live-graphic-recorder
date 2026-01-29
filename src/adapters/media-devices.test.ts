/**
 * Tests for MediaDevices adapter.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// Mock MediaStream for Node/Bun environment
class MockMediaStream {
  private tracks: MediaStreamTrack[] = [];

  constructor(tracks?: MediaStreamTrack[]) {
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

// Set up global MediaStream if not available
if (typeof globalThis.MediaStream === "undefined") {
  (globalThis as any).MediaStream = MockMediaStream;
}
import { createMediaDevicesAdapter, createMockMediaDevicesAdapter } from "./media-devices";

describe("createMediaDevicesAdapter", () => {
  let originalNavigator: Navigator;

  beforeEach(() => {
    originalNavigator = globalThis.navigator;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  describe("hasGetUserMedia", () => {
    test("returns true when getUserMedia is available", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {
            getUserMedia: () => Promise.resolve(new MediaStream()),
          },
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      expect(adapter.hasGetUserMedia()).toBe(true);
    });

    test("returns false when mediaDevices is not available", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {},
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      expect(adapter.hasGetUserMedia()).toBe(false);
    });
  });

  describe("hasGetDisplayMedia", () => {
    test("returns true when getDisplayMedia is available", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {
            getDisplayMedia: () => Promise.resolve(new MediaStream()),
          },
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      expect(adapter.hasGetDisplayMedia()).toBe(true);
    });

    test("returns false when getDisplayMedia is not available", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {},
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      expect(adapter.hasGetDisplayMedia()).toBe(false);
    });
  });

  describe("getUserMedia", () => {
    test("calls navigator.mediaDevices.getUserMedia with constraints", async () => {
      const mockStream = new MediaStream();
      const getUserMediaMock = mock(() => Promise.resolve(mockStream));

      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {
            getUserMedia: getUserMediaMock,
          },
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      const constraints = { audio: true, video: true };
      const result = await adapter.getUserMedia(constraints);

      expect(getUserMediaMock).toHaveBeenCalledWith(constraints);
      expect(result).toBe(mockStream);
    });

    test("rejects when getUserMedia is not available", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {},
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      await expect(adapter.getUserMedia({ audio: true })).rejects.toThrow(
        "Camera/microphone APIs are not available",
      );
    });
  });

  describe("getDisplayMedia", () => {
    test("calls navigator.mediaDevices.getDisplayMedia with constraints", async () => {
      const mockStream = new MediaStream();
      const getDisplayMediaMock = mock(() => Promise.resolve(mockStream));

      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {
            getDisplayMedia: getDisplayMediaMock,
          },
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      const constraints = { video: true };
      const result = await adapter.getDisplayMedia(constraints);

      expect(getDisplayMediaMock).toHaveBeenCalledWith(constraints);
      expect(result).toBe(mockStream);
    });

    test("rejects when getDisplayMedia is not available", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {},
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      await expect(adapter.getDisplayMedia({ video: true })).rejects.toThrow(
        "Screen sharing is not supported",
      );
    });
  });

  describe("enumerateDevices", () => {
    test("returns devices from navigator.mediaDevices.enumerateDevices", async () => {
      const mockDevices = [
        { kind: "audioinput", deviceId: "audio1", label: "Mic 1" },
        { kind: "videoinput", deviceId: "video1", label: "Camera 1" },
      ] as MediaDeviceInfo[];

      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {
            enumerateDevices: () => Promise.resolve(mockDevices),
          },
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      const result = await adapter.enumerateDevices();

      expect(result).toEqual(mockDevices);
    });

    test("returns empty array when mediaDevices is not available", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {},
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      const result = await adapter.enumerateDevices();

      expect(result).toEqual([]);
    });

    test("returns empty array when enumerateDevices fails", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {
            enumerateDevices: () => Promise.reject(new Error("Failed")),
          },
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      const result = await adapter.enumerateDevices();

      expect(result).toEqual([]);
    });
  });

  describe("onDeviceChange", () => {
    test("adds and removes event listener", () => {
      const addEventListenerMock = mock(() => {});
      const removeEventListenerMock = mock(() => {});

      Object.defineProperty(globalThis, "navigator", {
        value: {
          mediaDevices: {
            addEventListener: addEventListenerMock,
            removeEventListener: removeEventListenerMock,
          },
        },
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      const handler = () => {};
      const unsubscribe = adapter.onDeviceChange(handler);

      expect(addEventListenerMock).toHaveBeenCalledWith("devicechange", handler);

      unsubscribe();
      expect(removeEventListenerMock).toHaveBeenCalledWith("devicechange", handler);
    });

    test("returns no-op when mediaDevices is not available", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {},
        configurable: true,
      });

      const adapter = createMediaDevicesAdapter();
      const unsubscribe = adapter.onDeviceChange(() => {});

      // Should not throw
      unsubscribe();
    });
  });
});

describe("createMockMediaDevicesAdapter", () => {
  test("creates adapter with default implementations", async () => {
    const adapter = createMockMediaDevicesAdapter();

    expect(adapter.hasGetUserMedia()).toBe(true);
    expect(adapter.hasGetDisplayMedia()).toBe(true);
    expect(await adapter.enumerateDevices()).toEqual([]);
  });

  test("allows overriding specific methods", async () => {
    const mockDevices = [{ kind: "audioinput", deviceId: "mic1" } as MediaDeviceInfo];

    const adapter = createMockMediaDevicesAdapter({
      enumerateDevices: () => Promise.resolve(mockDevices),
      hasGetUserMedia: () => false,
    });

    expect(adapter.hasGetUserMedia()).toBe(false);
    expect(adapter.hasGetDisplayMedia()).toBe(true);
    expect(await adapter.enumerateDevices()).toEqual(mockDevices);
  });
});
