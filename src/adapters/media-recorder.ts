/**
 * MediaRecorder browser API adapter.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/types.ts, src/hooks/useRecording.ts
 */

import type { MediaRecorderAdapter, MediaRecorderInstance, MediaRecorderOptions } from "./types";

/**
 * Create a MediaRecorderAdapter that wraps the browser's MediaRecorder API.
 */
export function createMediaRecorderAdapter(): MediaRecorderAdapter {
  return {
    isTypeSupported(mimeType: string): boolean {
      if (typeof MediaRecorder === "undefined") {
        return false;
      }
      return MediaRecorder.isTypeSupported(mimeType);
    },

    create(stream: MediaStream, options: MediaRecorderOptions): MediaRecorderInstance {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not available in this browser.");
      }

      const recorder = new MediaRecorder(stream, options);

      return {
        get state() {
          return recorder.state;
        },

        start(timeslice?: number): void {
          recorder.start(timeslice);
        },

        stop(): void {
          recorder.stop();
        },

        pause(): void {
          recorder.pause();
        },

        resume(): void {
          recorder.resume();
        },

        onDataAvailable(handler: (data: Blob) => void): void {
          recorder.ondataavailable = (event) => {
            handler(event.data);
          };
        },

        onStop(handler: () => void): void {
          recorder.onstop = handler;
        },

        onError(handler: (error: Error) => void): void {
          recorder.onerror = (event) => {
            handler((event as ErrorEvent).error ?? new Error("MediaRecorder error"));
          };
        },
      };
    },
  };
}

/**
 * Create a mock MediaRecorderAdapter for testing.
 */
export function createMockMediaRecorderAdapter(
  overrides: Partial<MediaRecorderAdapter> = {},
): MediaRecorderAdapter {
  const defaultMock: MediaRecorderAdapter = {
    isTypeSupported: () => true,
    create: (): MediaRecorderInstance => ({
      state: "inactive",
      start: () => {},
      stop: () => {},
      pause: () => {},
      resume: () => {},
      onDataAvailable: () => {},
      onStop: () => {},
      onError: () => {},
    }),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Create a mock MediaRecorderInstance for testing.
 */
export function createMockMediaRecorderInstance(
  overrides: Partial<MediaRecorderInstance> = {},
): MediaRecorderInstance {
  const defaultMock: MediaRecorderInstance = {
    state: "inactive",
    start: () => {},
    stop: () => {},
    pause: () => {},
    resume: () => {},
    onDataAvailable: () => {},
    onStop: () => {},
    onError: () => {},
  };

  return { ...defaultMock, ...overrides };
}
