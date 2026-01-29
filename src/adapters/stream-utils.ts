/**
 * Stream utility functions.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/types.ts, src/logic/media-stream-controller.ts
 */

import type { StreamUtils } from "./types";

/**
 * Create StreamUtils for managing MediaStream tracks.
 */
export function createStreamUtils(): StreamUtils {
  return {
    stopTracks(stream: MediaStream | null): void {
      if (!stream) return;
      for (const track of stream.getTracks()) {
        track.stop();
      }
    },

    createStream(tracks: MediaStreamTrack[]): MediaStream {
      return new MediaStream(tracks);
    },
  };
}

/**
 * Create a mock StreamUtils for testing.
 */
export function createMockStreamUtils(overrides: Partial<StreamUtils> = {}): StreamUtils {
  const defaultMock: StreamUtils = {
    stopTracks: () => {},
    createStream: () => new MediaStream(),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Standalone function to stop all tracks in a stream.
 * Kept for backwards compatibility with existing code.
 */
export function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}
