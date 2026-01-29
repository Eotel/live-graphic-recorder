/**
 * Tests for stream utility functions.
 */

import { describe, test, expect, mock } from "bun:test";

// Mock MediaStream for Node/Bun environment
class MockMediaStream {
  private tracks: MediaStreamTrack[] = [];

  constructor(tracks?: MediaStreamTrack[]) {
    this.tracks = tracks ?? [];
  }

  getTracks() {
    return this.tracks;
  }
}

// Set up global MediaStream if not available
if (typeof globalThis.MediaStream === "undefined") {
  (globalThis as any).MediaStream = MockMediaStream;
}
import { createStreamUtils, createMockStreamUtils, stopTracks } from "./stream-utils";

describe("createStreamUtils", () => {
  describe("stopTracks", () => {
    test("does nothing for null stream", () => {
      const utils = createStreamUtils();
      // Should not throw
      utils.stopTracks(null);
    });

    test("stops all tracks in a stream", () => {
      const track1 = { stop: mock(() => {}) } as unknown as MediaStreamTrack;
      const track2 = { stop: mock(() => {}) } as unknown as MediaStreamTrack;
      const stream = {
        getTracks: () => [track1, track2],
      } as unknown as MediaStream;

      const utils = createStreamUtils();
      utils.stopTracks(stream);

      expect(track1.stop).toHaveBeenCalled();
      expect(track2.stop).toHaveBeenCalled();
    });
  });

  describe("createStream", () => {
    test("creates a new MediaStream with provided tracks", () => {
      const utils = createStreamUtils();
      const tracks: MediaStreamTrack[] = [];

      const stream = utils.createStream(tracks);
      expect(stream).toBeInstanceOf(MediaStream);
    });
  });
});

describe("createMockStreamUtils", () => {
  test("creates utils with default implementations", () => {
    const utils = createMockStreamUtils();

    // Should not throw
    utils.stopTracks(null);
    const stream = utils.createStream([]);
    expect(stream).toBeInstanceOf(MediaStream);
  });

  test("allows overriding stopTracks", () => {
    const stopTracksMock = mock(() => {});
    const utils = createMockStreamUtils({
      stopTracks: stopTracksMock,
    });

    utils.stopTracks(new MediaStream());
    expect(stopTracksMock).toHaveBeenCalled();
  });
});

describe("stopTracks standalone function", () => {
  test("does nothing for null stream", () => {
    // Should not throw
    stopTracks(null);
  });

  test("stops all tracks using forEach", () => {
    const track1 = { stop: mock(() => {}) } as unknown as MediaStreamTrack;
    const track2 = { stop: mock(() => {}) } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track1, track2],
    } as unknown as MediaStream;

    stopTracks(stream);

    expect(track1.stop).toHaveBeenCalled();
    expect(track2.stop).toHaveBeenCalled();
  });
});
