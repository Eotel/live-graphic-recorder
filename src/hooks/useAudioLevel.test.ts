/**
 * Tests for useAudioLevel hook.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useAudioLevel.ts, src/components/recording/AudioLevelIndicator.tsx
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useAudioLevel } from "./useAudioLevel";

// Shared mock level for tests
let mockLevel = 0;
let mockContextState: AudioContextState = "running";

// Mock AnalyserNode
class MockAnalyserNode {
  fftSize = 256;
  frequencyBinCount = 128;

  getByteFrequencyData(array: Uint8Array) {
    for (let i = 0; i < array.length; i++) {
      array[i] = mockLevel;
    }
  }

  disconnect() {}
}

// Mock MediaStreamAudioSourceNode
class MockMediaStreamAudioSourceNode {
  connect() {}
  disconnect() {}
}

// Mock AudioContext
class MockAudioContext {
  get state() {
    return mockContextState;
  }

  createAnalyser() {
    return new MockAnalyserNode() as unknown as AnalyserNode;
  }

  createMediaStreamSource() {
    return new MockMediaStreamAudioSourceNode() as unknown as MediaStreamAudioSourceNode;
  }

  close() {
    mockContextState = "closed";
    return Promise.resolve();
  }
}

// Store original globals
const originalAudioContext = globalThis.AudioContext;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

describe("useAudioLevel", () => {
  let frameCallbacks: Array<FrameRequestCallback> = [];
  let frameId = 0;

  beforeEach(() => {
    mockLevel = 0;
    mockContextState = "running";
    frameCallbacks = [];
    frameId = 0;

    // Mock AudioContext
    globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;

    // Mock requestAnimationFrame to be synchronously controllable
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return ++frameId;
    };

    globalThis.cancelAnimationFrame = () => {
      frameCallbacks = [];
    };
  });

  afterEach(() => {
    globalThis.AudioContext = originalAudioContext;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  const flushFrames = async () => {
    await act(async () => {
      // Execute pending animation frame callbacks
      const callbacks = [...frameCallbacks];
      frameCallbacks = [];
      callbacks.forEach((cb) => cb(performance.now()));
    });
  };

  test("returns isActive false when stream is null", () => {
    const { result } = renderHook(() => useAudioLevel(null));
    expect(result.current.isActive).toBe(false);
  });

  test("returns isActive false when disabled", () => {
    const mockStream = { getAudioTracks: () => [{}] } as MediaStream;
    const { result } = renderHook(() => useAudioLevel(mockStream, { enabled: false }));
    expect(result.current.isActive).toBe(false);
  });

  test("returns isActive false when audio level is below threshold", async () => {
    const mockStream = {
      getAudioTracks: () => [{ enabled: true }],
    } as unknown as MediaStream;

    mockLevel = 5; // Below threshold

    const { result } = renderHook(() =>
      useAudioLevel(mockStream, { threshold: 10, enabled: true }),
    );

    await flushFrames();

    expect(result.current.isActive).toBe(false);
  });

  test("returns isActive true when audio level exceeds threshold", async () => {
    const mockStream = {
      getAudioTracks: () => [{ enabled: true }],
    } as unknown as MediaStream;

    mockLevel = 50; // Above threshold

    const { result } = renderHook(() =>
      useAudioLevel(mockStream, { threshold: 10, enabled: true }),
    );

    await flushFrames();

    expect(result.current.isActive).toBe(true);
  });

  test("cleans up AudioContext on unmount", async () => {
    const mockStream = {
      getAudioTracks: () => [{ enabled: true }],
    } as unknown as MediaStream;

    const { unmount } = renderHook(() => useAudioLevel(mockStream, { enabled: true }));

    await flushFrames();

    unmount();

    expect(mockContextState).toBe("closed");
  });

  test("respects custom threshold option", async () => {
    const mockStream = {
      getAudioTracks: () => [{ enabled: true }],
    } as unknown as MediaStream;

    mockLevel = 30;

    // With threshold 20, should be active
    const { result: result1, unmount: unmount1 } = renderHook(() =>
      useAudioLevel(mockStream, { threshold: 20, enabled: true }),
    );

    await flushFrames();
    expect(result1.current.isActive).toBe(true);

    unmount1();
    mockContextState = "running"; // Reset for next test

    // With threshold 50, should not be active
    const { result: result2 } = renderHook(() =>
      useAudioLevel(mockStream, { threshold: 50, enabled: true }),
    );

    await flushFrames();
    expect(result2.current.isActive).toBe(false);
  });

  test("returns isActive false when no audio tracks", async () => {
    const mockStream = {
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const { result } = renderHook(() => useAudioLevel(mockStream, { enabled: true }));

    expect(result.current.isActive).toBe(false);
  });
});
