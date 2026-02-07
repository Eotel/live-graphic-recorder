/**
 * Local recording controller tests.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/logic/local-recording-controller.ts
 */

import { describe, test, expect, mock } from "bun:test";
import { createLocalRecordingController } from "./local-recording-controller";
import { createMockOPFSStorageAdapter } from "../adapters/opfs-storage";
import type { OPFSStorageAdapter } from "../adapters/opfs-storage";
import type { LocalRecordingState } from "./local-recording-controller";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestSetup(overrides?: { storage?: OPFSStorageAdapter }) {
  const storage = overrides?.storage ?? createMockOPFSStorageAdapter();
  const states: LocalRecordingState[] = [];
  const onStateChange = mock((state: LocalRecordingState) => {
    states.push(state);
  });

  const controller = createLocalRecordingController({ storage }, { onStateChange });

  return { controller, storage, states, onStateChange };
}

// ============================================================================
// Tests
// ============================================================================

describe("LocalRecordingController", () => {
  describe("initial state", () => {
    test("starts with idle state", () => {
      const { controller } = createTestSetup();
      const state = controller.getState();

      expect(state.isRecording).toBe(false);
      expect(state.sessionId).toBeNull();
      expect(state.totalChunks).toBe(0);
      expect(state.pendingRecordings).toEqual([]);
      expect(state.error).toBeNull();
    });
  });

  describe("start", () => {
    test("transitions to recording state", async () => {
      const { controller, onStateChange } = createTestSetup();

      await controller.start("session-1");

      const state = controller.getState();
      expect(state.isRecording).toBe(true);
      expect(state.sessionId).toBe("session-1");
      expect(state.totalChunks).toBe(0);
      expect(state.pendingRecordings).toEqual([]);
      expect(state.error).toBeNull();
      expect(onStateChange).toHaveBeenCalled();
    });

    test("start while already recording is a no-op", async () => {
      const { controller, onStateChange } = createTestSetup();

      await controller.start("session-1");
      const callCount = onStateChange.mock.calls.length;

      await controller.start("session-2");

      // Should not have emitted additional state changes
      expect(onStateChange.mock.calls.length).toBe(callCount);
      expect(controller.getState().sessionId).toBe("session-1");
    });

    test("records error if storage.createAudioFile fails", async () => {
      const storage = createMockOPFSStorageAdapter();
      storage.createAudioFile = async () => {
        throw new Error("OPFS not available");
      };
      const { controller } = createTestSetup({ storage });

      await controller.start("session-1");

      expect(controller.getState().isRecording).toBe(false);
      expect(controller.getState().error).toBe("OPFS not available");
    });
  });

  describe("writeChunk", () => {
    test("increments totalChunks", async () => {
      const { controller } = createTestSetup();
      await controller.start("session-1");

      await controller.writeChunk(new ArrayBuffer(100));
      expect(controller.getState().totalChunks).toBe(1);

      await controller.writeChunk(new ArrayBuffer(200));
      expect(controller.getState().totalChunks).toBe(2);
    });

    test("no-op when not recording", async () => {
      const { controller, onStateChange } = createTestSetup();
      const callCount = onStateChange.mock.calls.length;

      await controller.writeChunk(new ArrayBuffer(100));

      expect(onStateChange.mock.calls.length).toBe(callCount);
    });

    test("records error on write failure without stopping recording", async () => {
      const storage = createMockOPFSStorageAdapter();
      const { controller } = createTestSetup({ storage });
      await controller.start("session-1");

      // We rely on the controller's internal writer; since we can't easily inject a failing writer
      // after start, we verify the best-effort behavior: error is recorded but isRecording stays true.

      // For a proper test, we use a custom adapter that fails on write:
      let shouldFail = false;
      const customStorage: OPFSStorageAdapter = {
        ...createMockOPFSStorageAdapter(),
        async createAudioFile(sessionId: string) {
          const mockAdapter = createMockOPFSStorageAdapter();
          const writer = await mockAdapter.createAudioFile(sessionId);
          return {
            async write(chunk: ArrayBuffer) {
              if (shouldFail) throw new Error("Write failed");
              return writer.write(chunk);
            },
            async close() {
              return writer.close();
            },
          };
        },
      };

      const setup2 = createTestSetup({ storage: customStorage });
      await setup2.controller.start("session-1");
      shouldFail = true;

      await setup2.controller.writeChunk(new ArrayBuffer(100));

      // Best-effort: error recorded but still recording
      expect(setup2.controller.getState().isRecording).toBe(true);
      expect(setup2.controller.getState().error).toBe("Write failed");
    });
  });

  describe("stop", () => {
    test("transitions from recording to idle", async () => {
      const { controller } = createTestSetup();
      await controller.start("session-1");
      await controller.writeChunk(new ArrayBuffer(100));

      await controller.stop();

      const state = controller.getState();
      expect(state.isRecording).toBe(false);
      expect(state.sessionId).toBe("session-1");
      expect(state.totalChunks).toBe(1);
      expect(state.pendingRecordings).toHaveLength(1);
      expect(state.pendingRecordings[0]!.sessionId).toBe("session-1");
      expect(state.pendingRecordings[0]!.totalChunks).toBe(1);
      expect(state.error).toBeNull();
    });

    test("appends multiple stop-start recordings", async () => {
      const { controller } = createTestSetup();

      await controller.start("session-1");
      await controller.writeChunk(new ArrayBuffer(100));
      await controller.stop();

      await controller.start("session-1");
      await controller.writeChunk(new ArrayBuffer(100));
      await controller.writeChunk(new ArrayBuffer(100));
      await controller.stop();

      const state = controller.getState();
      expect(state.pendingRecordings).toHaveLength(2);
      expect(state.pendingRecordings[0]!.totalChunks).toBe(1);
      expect(state.pendingRecordings[1]!.totalChunks).toBe(2);
    });

    test("no-op when not recording", async () => {
      const { controller, onStateChange } = createTestSetup();
      const callCount = onStateChange.mock.calls.length;

      await controller.stop();

      expect(onStateChange.mock.calls.length).toBe(callCount);
    });

    test("file is accessible after stop", async () => {
      const { controller, storage } = createTestSetup();
      await controller.start("session-1");
      await controller.writeChunk(new Uint8Array([1, 2, 3]).buffer);
      await controller.stop();

      const recordingId = controller.getState().pendingRecordings[0]!.recordingId;
      const file = await storage.getAudioFile(recordingId);
      expect(file).not.toBeNull();
      expect(file!.size).toBe(3);
    });
  });

  describe("removePendingRecording", () => {
    test("removes only the specified pending recording", async () => {
      const { controller } = createTestSetup();

      await controller.start("session-1");
      await controller.writeChunk(new ArrayBuffer(100));
      await controller.stop();

      await controller.start("session-1");
      await controller.writeChunk(new ArrayBuffer(100));
      await controller.stop();

      const [first, second] = controller.getState().pendingRecordings;
      expect(first).toBeDefined();
      expect(second).toBeDefined();

      controller.removePendingRecording(first!.recordingId);

      const state = controller.getState();
      expect(state.pendingRecordings).toHaveLength(1);
      expect(state.pendingRecordings[0]!.recordingId).toBe(second!.recordingId);
    });
  });

  describe("reset", () => {
    test("clears sessionId and counters after recording", async () => {
      const { controller } = createTestSetup();

      await controller.start("session-1");
      await controller.writeChunk(new ArrayBuffer(100));
      await controller.stop();

      controller.reset();

      const state = controller.getState();
      expect(state.isRecording).toBe(false);
      expect(state.sessionId).toBeNull();
      expect(state.totalChunks).toBe(0);
      expect(state.pendingRecordings).toEqual([]);
      expect(state.error).toBeNull();
    });

    test("is safe to call while idle", () => {
      const { controller } = createTestSetup();

      controller.reset();

      const state = controller.getState();
      expect(state.isRecording).toBe(false);
      expect(state.sessionId).toBeNull();
      expect(state.totalChunks).toBe(0);
      expect(state.pendingRecordings).toEqual([]);
      expect(state.error).toBeNull();
    });
  });

  describe("dispose", () => {
    test("stops recording and prevents further operations", async () => {
      const { controller, onStateChange } = createTestSetup();
      await controller.start("session-1");

      controller.dispose();

      expect(controller.getState().isRecording).toBe(false);

      // Further operations should be no-ops
      const callCount = onStateChange.mock.calls.length;
      await controller.start("session-2");
      await controller.writeChunk(new ArrayBuffer(100));
      expect(onStateChange.mock.calls.length).toBe(callCount);
    });
  });
});
