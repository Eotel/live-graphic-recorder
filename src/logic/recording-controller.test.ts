/**
 * Tests for RecordingController.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/logic/recording-controller.ts, src/adapters/media-recorder.ts
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createRecordingController } from "./recording-controller";
import type { MediaRecorderAdapter, MediaRecorderInstance } from "../adapters/types";
import type {
  RecordingContext,
  RecordingControllerCallbacks,
  RecordingControllerState,
} from "./types";

// ============================================================================
// Test Helpers
// ============================================================================

interface ControllableMockRecorder extends MediaRecorderInstance {
  simulateData(data: Blob): void;
  simulateStop(): void;
  simulateError(error: Error): void;
}

function createControllableMockRecorder(): ControllableMockRecorder {
  let dataHandler: ((data: Blob) => void) | null = null;
  let stopHandler: (() => void) | null = null;
  let errorHandler: ((error: Error) => void) | null = null;
  let currentState: "inactive" | "recording" | "paused" = "inactive";

  return {
    get state() {
      return currentState;
    },
    start: mock(() => {
      currentState = "recording";
    }),
    stop: mock(() => {
      currentState = "inactive";
      stopHandler?.();
    }),
    pause: mock(() => {
      currentState = "paused";
    }),
    resume: mock(() => {
      currentState = "recording";
    }),
    onDataAvailable(handler: (data: Blob) => void) {
      dataHandler = handler;
    },
    onStop(handler: () => void) {
      stopHandler = handler;
    },
    onError(handler: (error: Error) => void) {
      errorHandler = handler;
    },
    simulateData(data: Blob) {
      dataHandler?.(data);
    },
    simulateStop() {
      currentState = "inactive";
      stopHandler?.();
    },
    simulateError(error: Error) {
      errorHandler?.(error);
    },
  };
}

function createTestSetup(
  overrides: {
    adapterOverrides?: Partial<MediaRecorderAdapter>;
    callbackOverrides?: Partial<RecordingControllerCallbacks>;
  } = {},
) {
  const mockRecorder = createControllableMockRecorder();
  const adapter: MediaRecorderAdapter = {
    isTypeSupported: () => true,
    create: () => mockRecorder,
    ...overrides.adapterOverrides,
  };

  const onChunk = mock(() => {});
  const onSessionStart = mock(() => {});
  const onSessionStop = mock(() => {});
  const onStateChange = mock(() => {});

  const callbacks: RecordingControllerCallbacks = {
    onChunk: overrides.callbackOverrides?.onChunk ?? onChunk,
    onSessionStart: overrides.callbackOverrides?.onSessionStart ?? onSessionStart,
    onSessionStop: overrides.callbackOverrides?.onSessionStop ?? onSessionStop,
    onStateChange: overrides.callbackOverrides?.onStateChange ?? onStateChange,
  };

  const controller = createRecordingController({ mediaRecorder: adapter }, callbacks);

  return {
    controller,
    mockRecorder,
    onChunk,
    onSessionStart,
    onSessionStop,
    onStateChange,
  };
}

/** Create a mock MediaStream (browser API not available in test env) */
function createMockMediaStream(): MediaStream {
  return {
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [],
    addTrack: () => {},
    removeTrack: () => {},
    clone: () => createMockMediaStream(),
    active: true,
    id: "mock-stream",
  } as unknown as MediaStream;
}

function validContext(): RecordingContext {
  return {
    audioStream: createMockMediaStream(),
    hasPermission: true,
    isConnected: true,
    hasMeeting: true,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("createRecordingController", () => {
  test("initializes with idle state", () => {
    const { controller } = createTestSetup();

    const state = controller.getState();
    expect(state.isRecording).toBe(false);
    expect(state.isPendingStart).toBe(false);
    expect(state.error).toBeNull();
  });

  test("start() with valid context transitions to recording and calls onSessionStart", () => {
    const { controller, mockRecorder, onSessionStart, onStateChange } = createTestSetup();

    controller.start(validContext());

    expect(controller.getState().isRecording).toBe(true);
    expect(controller.getState().isPendingStart).toBe(false);
    expect(controller.getState().error).toBeNull();
    expect(onSessionStart).toHaveBeenCalledTimes(1);
    expect(mockRecorder.start).toHaveBeenCalledTimes(1);
  });

  test("start() without audioStream sets error", () => {
    const { controller, onSessionStart } = createTestSetup();

    controller.start({ ...validContext(), audioStream: null });

    expect(controller.getState().isRecording).toBe(false);
    expect(controller.getState().error).not.toBeNull();
    expect(onSessionStart).not.toHaveBeenCalled();
  });

  test("start() without connection transitions to pending", () => {
    const { controller, onSessionStart } = createTestSetup();

    controller.start({ ...validContext(), isConnected: false });

    expect(controller.getState().isRecording).toBe(false);
    expect(controller.getState().isPendingStart).toBe(true);
    expect(onSessionStart).not.toHaveBeenCalled();
  });

  test("start() without meeting is a no-op", () => {
    const { controller, onSessionStart, onStateChange } = createTestSetup();

    const callCountBefore = onStateChange.mock.calls.length;
    controller.start({ ...validContext(), hasMeeting: false });

    expect(controller.getState().isRecording).toBe(false);
    expect(controller.getState().isPendingStart).toBe(false);
    expect(onSessionStart).not.toHaveBeenCalled();
    // No state change should occur
    expect(onStateChange.mock.calls.length).toBe(callCountBefore);
  });

  test("stop() in IDLE is a no-op and does NOT call onSessionStop", () => {
    const { controller, onSessionStop } = createTestSetup();

    controller.stop();

    expect(onSessionStop).not.toHaveBeenCalled();
  });

  test("stop() in PENDING clears pending and does NOT call onSessionStop", () => {
    const { controller, onSessionStop } = createTestSetup();

    controller.start({ ...validContext(), isConnected: false });
    expect(controller.getState().isPendingStart).toBe(true);

    controller.stop();

    expect(controller.getState().isPendingStart).toBe(false);
    expect(controller.getState().isRecording).toBe(false);
    expect(onSessionStop).not.toHaveBeenCalled();
  });

  test("stop() in RECORDING stops recorder and calls onSessionStop", () => {
    const { controller, mockRecorder, onSessionStop } = createTestSetup();

    controller.start(validContext());
    expect(controller.getState().isRecording).toBe(true);

    controller.stop();

    expect(controller.getState().isRecording).toBe(false);
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(onSessionStop).toHaveBeenCalledTimes(1);
  });

  test("conditionsChanged() resolves PENDING when all conditions met", () => {
    const { controller, onSessionStart } = createTestSetup();

    controller.start({ ...validContext(), isConnected: false });
    expect(controller.getState().isPendingStart).toBe(true);

    controller.onConditionsChanged(validContext());

    expect(controller.getState().isRecording).toBe(true);
    expect(controller.getState().isPendingStart).toBe(false);
    expect(onSessionStart).toHaveBeenCalledTimes(1);
  });

  test("conditionsChanged() clears PENDING on permission loss without calling onSessionStop", () => {
    const { controller, onSessionStop } = createTestSetup();

    controller.start({ ...validContext(), isConnected: false });
    expect(controller.getState().isPendingStart).toBe(true);

    controller.onConditionsChanged({ ...validContext(), hasPermission: false });

    expect(controller.getState().isPendingStart).toBe(false);
    expect(controller.getState().isRecording).toBe(false);
    expect(onSessionStop).not.toHaveBeenCalled();
  });

  test("conditionsChanged() clears PENDING on meeting loss without calling onSessionStop", () => {
    const { controller, onSessionStop } = createTestSetup();

    controller.start({ ...validContext(), isConnected: false });
    expect(controller.getState().isPendingStart).toBe(true);

    controller.onConditionsChanged({ ...validContext(), hasMeeting: false });

    expect(controller.getState().isPendingStart).toBe(false);
    expect(controller.getState().isRecording).toBe(false);
    expect(onSessionStop).not.toHaveBeenCalled();
  });

  test("conditionsChanged() auto-stops RECORDING on permission loss and calls onSessionStop", () => {
    const { controller, onSessionStop } = createTestSetup();

    controller.start(validContext());
    expect(controller.getState().isRecording).toBe(true);

    controller.onConditionsChanged({ ...validContext(), hasPermission: false });

    expect(controller.getState().isRecording).toBe(false);
    expect(onSessionStop).toHaveBeenCalledTimes(1);
  });

  test("conditionsChanged() auto-stops RECORDING on stream loss and calls onSessionStop", () => {
    const { controller, onSessionStop } = createTestSetup();

    controller.start(validContext());
    expect(controller.getState().isRecording).toBe(true);

    controller.onConditionsChanged({ ...validContext(), audioStream: null });

    expect(controller.getState().isRecording).toBe(false);
    expect(onSessionStop).toHaveBeenCalledTimes(1);
  });

  test("onChunk callback receives ArrayBuffer from MediaRecorder", async () => {
    const onChunk = mock((chunk: ArrayBuffer) => {
      void chunk;
    });
    const { controller, mockRecorder } = createTestSetup({
      callbackOverrides: { onChunk },
    });

    controller.start(validContext());

    // Simulate data from MediaRecorder
    const blob = new Blob(["audio-data"], { type: "audio/webm" });
    mockRecorder.simulateData(blob);

    // Wait for async arrayBuffer conversion
    await new Promise((r) => setTimeout(r, 10));

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk.mock.calls[0]![0]).toBeInstanceOf(ArrayBuffer);
  });

  test("dispose() in RECORDING stops recorder and calls onSessionStop", () => {
    const { controller, mockRecorder, onSessionStop } = createTestSetup();

    controller.start(validContext());
    expect(controller.getState().isRecording).toBe(true);

    controller.dispose();

    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(onSessionStop).toHaveBeenCalledTimes(1);
  });

  test("dispose() in PENDING clears pending without calling onSessionStop", () => {
    const { controller, onSessionStop } = createTestSetup();

    controller.start({ ...validContext(), isConnected: false });
    expect(controller.getState().isPendingStart).toBe(true);

    controller.dispose();

    expect(onSessionStop).not.toHaveBeenCalled();
  });

  test("start() then stop() then start() follows correct lifecycle", () => {
    const { controller, onSessionStart, onSessionStop, mockRecorder } = createTestSetup();

    // First start
    controller.start(validContext());
    expect(controller.getState().isRecording).toBe(true);
    expect(onSessionStart).toHaveBeenCalledTimes(1);

    // Stop
    controller.stop();
    expect(controller.getState().isRecording).toBe(false);
    expect(onSessionStop).toHaveBeenCalledTimes(1);

    // Second start
    controller.start(validContext());
    expect(controller.getState().isRecording).toBe(true);
    expect(onSessionStart).toHaveBeenCalledTimes(2);
  });

  test("start() without hasPermission sets error", () => {
    const { controller, onSessionStart } = createTestSetup();

    controller.start({ ...validContext(), hasPermission: false });

    expect(controller.getState().isRecording).toBe(false);
    expect(controller.getState().error).not.toBeNull();
    expect(onSessionStart).not.toHaveBeenCalled();
  });
});
