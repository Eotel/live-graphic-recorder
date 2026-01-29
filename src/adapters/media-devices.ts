/**
 * MediaDevices browser API adapter.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/types.ts, src/logic/media-stream-controller.ts
 */

import type { MediaDevicesAdapter } from "./types";

/**
 * Create a MediaDevicesAdapter that wraps the browser's MediaDevices API.
 */
export function createMediaDevicesAdapter(): MediaDevicesAdapter {
  return {
    hasGetUserMedia(): boolean {
      return typeof navigator?.mediaDevices?.getUserMedia === "function";
    },

    hasGetDisplayMedia(): boolean {
      return typeof navigator?.mediaDevices?.getDisplayMedia === "function";
    },

    getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
      if (!this.hasGetUserMedia()) {
        return Promise.reject(
          new Error("Camera/microphone APIs are not available in this browser."),
        );
      }
      return navigator.mediaDevices.getUserMedia(constraints);
    },

    getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStream> {
      if (!this.hasGetDisplayMedia()) {
        return Promise.reject(new Error("Screen sharing is not supported in this browser."));
      }
      return navigator.mediaDevices.getDisplayMedia(constraints);
    },

    async enumerateDevices(): Promise<MediaDeviceInfo[]> {
      if (!navigator?.mediaDevices?.enumerateDevices) {
        console.warn("MediaDevices API not available");
        return [];
      }
      try {
        return await navigator.mediaDevices.enumerateDevices();
      } catch (err) {
        console.error("Failed to enumerate devices:", err);
        return [];
      }
    },

    onDeviceChange(handler: () => void): () => void {
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.addEventListener) {
        return () => {};
      }
      mediaDevices.addEventListener("devicechange", handler);
      return () => {
        mediaDevices.removeEventListener("devicechange", handler);
      };
    },
  };
}

/**
 * Create a mock MediaDevicesAdapter for testing.
 */
export function createMockMediaDevicesAdapter(
  overrides: Partial<MediaDevicesAdapter> = {},
): MediaDevicesAdapter {
  const defaultMock: MediaDevicesAdapter = {
    hasGetUserMedia: () => true,
    hasGetDisplayMedia: () => true,
    getUserMedia: () => Promise.resolve(new MediaStream()),
    getDisplayMedia: () => Promise.resolve(new MediaStream()),
    enumerateDevices: () => Promise.resolve([]),
    onDeviceChange: () => () => {},
  };

  return { ...defaultMock, ...overrides };
}
