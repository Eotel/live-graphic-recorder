/**
 * Local recording controller - manages OPFS audio file lifecycle.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/adapters/opfs-storage.ts, src/hooks/useLocalRecording.ts
 */

import type { OPFSStorageAdapter, OPFSAudioWriter } from "../adapters/opfs-storage";

export interface LocalRecordingState {
  isRecording: boolean;
  /**
   * Current recording session id (while recording) or the last recorded session id (after stop).
   * Kept after `stop()` so callers can reliably locate the OPFS file for upload.
   */
  sessionId: string | null;
  totalChunks: number;
  error: string | null;
}

export interface LocalRecordingDeps {
  storage: OPFSStorageAdapter;
}

export interface LocalRecordingCallbacks {
  onStateChange: (state: LocalRecordingState) => void;
}

export function createLocalRecordingController(
  deps: LocalRecordingDeps,
  callbacks: LocalRecordingCallbacks,
): {
  start(sessionId: string): Promise<void>;
  writeChunk(chunk: ArrayBuffer): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
  getState(): LocalRecordingState;
  dispose(): void;
} {
  const { storage } = deps;

  let state: LocalRecordingState = {
    isRecording: false,
    sessionId: null,
    totalChunks: 0,
    error: null,
  };

  let writer: OPFSAudioWriter | null = null;
  let isDisposed = false;

  function updateState(updates: Partial<LocalRecordingState>): void {
    state = { ...state, ...updates };
    if (!isDisposed) {
      callbacks.onStateChange({ ...state });
    }
  }

  async function start(sessionId: string): Promise<void> {
    if (isDisposed || state.isRecording) return;

    try {
      writer = await storage.createAudioFile(sessionId);
      updateState({
        isRecording: true,
        sessionId,
        totalChunks: 0,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create audio file";
      updateState({ error: message });
    }
  }

  async function writeChunk(chunk: ArrayBuffer): Promise<void> {
    if (isDisposed || !state.isRecording || !writer) return;

    try {
      await writer.write(chunk);
      updateState({ totalChunks: state.totalChunks + 1 });
    } catch (err) {
      // Best-effort: record error but don't stop recording
      const message = err instanceof Error ? err.message : "Failed to write audio chunk";
      updateState({ error: message });
    }
  }

  async function stop(): Promise<void> {
    if (isDisposed || !state.isRecording) return;

    try {
      await writer?.close();
    } catch {
      // Ignore close errors
    }

    writer = null;
    updateState({
      isRecording: false,
      error: null,
    });
  }

  function reset(): void {
    if (isDisposed) return;

    if (state.isRecording) {
      writer?.close().catch(() => {});
      writer = null;
    }

    updateState({
      isRecording: false,
      sessionId: null,
      totalChunks: 0,
      error: null,
    });
  }

  function dispose(): void {
    if (isDisposed) return;

    if (state.isRecording) {
      writer?.close().catch(() => {});
      writer = null;
      state = { ...state, isRecording: false, sessionId: null, totalChunks: 0 };
      callbacks.onStateChange({ ...state });
    }

    isDisposed = true;
  }

  return {
    start,
    writeChunk,
    stop,
    reset,
    getState: () => ({ ...state }),
    dispose,
  };
}
