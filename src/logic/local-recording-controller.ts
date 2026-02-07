/**
 * Local recording controller - manages OPFS audio file lifecycle.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/adapters/opfs-storage.ts, src/hooks/useLocalRecording.ts
 */

import type { OPFSStorageAdapter, OPFSAudioWriter } from "../adapters/opfs-storage";

export interface PendingLocalRecording {
  recordingId: string;
  sessionId: string;
  totalChunks: number;
  createdAt: number;
}

export interface LocalRecordingState {
  isRecording: boolean;
  /**
   * Current recording session id (while recording) or the last recorded session id (after stop).
   * Kept after `stop()` so callers can reliably locate the OPFS file for upload.
   */
  sessionId: string | null;
  totalChunks: number;
  pendingRecordings: PendingLocalRecording[];
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
  removePendingRecording(recordingId: string): void;
  reset(): void;
  getState(): LocalRecordingState;
  dispose(): void;
} {
  const { storage } = deps;

  let state: LocalRecordingState = {
    isRecording: false,
    sessionId: null,
    totalChunks: 0,
    pendingRecordings: [],
    error: null,
  };

  let writer: OPFSAudioWriter | null = null;
  let activeRecordingId: string | null = null;
  let activeRecordingStartedAt: number | null = null;
  let isDisposed = false;

  function updateState(updates: Partial<LocalRecordingState>): void {
    state = { ...state, ...updates };
    if (!isDisposed) {
      callbacks.onStateChange({ ...state });
    }
  }

  function createRecordingId(sessionId: string): string {
    const nonce = Math.random().toString(36).slice(2, 10);
    return `${sessionId}-${Date.now()}-${nonce}`;
  }

  async function start(sessionId: string): Promise<void> {
    if (isDisposed || state.isRecording) return;

    try {
      activeRecordingId = createRecordingId(sessionId);
      activeRecordingStartedAt = Date.now();
      writer = await storage.createAudioFile(activeRecordingId);
      updateState({
        isRecording: true,
        sessionId,
        totalChunks: 0,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create audio file";
      activeRecordingId = null;
      activeRecordingStartedAt = null;
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

    const completedRecordingId = activeRecordingId;
    const completedStartedAt = activeRecordingStartedAt;
    const completedSessionId = state.sessionId;
    const completedChunks = state.totalChunks;

    try {
      await writer?.close();
    } catch {
      // Ignore close errors
    }

    writer = null;
    activeRecordingId = null;
    activeRecordingStartedAt = null;

    const shouldQueue =
      completedRecordingId !== null &&
      completedStartedAt !== null &&
      completedSessionId !== null &&
      completedChunks > 0;

    updateState({
      isRecording: false,
      pendingRecordings: shouldQueue
        ? [
            ...state.pendingRecordings,
            {
              recordingId: completedRecordingId!,
              sessionId: completedSessionId!,
              totalChunks: completedChunks,
              createdAt: completedStartedAt!,
            },
          ]
        : state.pendingRecordings,
      error: null,
    });
  }

  function removePendingRecording(recordingId: string): void {
    if (isDisposed) return;
    if (!recordingId) return;
    const next = state.pendingRecordings.filter(
      (recording) => recording.recordingId !== recordingId,
    );
    if (next.length === state.pendingRecordings.length) return;
    updateState({ pendingRecordings: next });
  }

  function reset(): void {
    if (isDisposed) return;

    const recordingIdsToDelete = state.pendingRecordings.map((recording) => recording.recordingId);
    if (activeRecordingId) {
      recordingIdsToDelete.push(activeRecordingId);
    }

    if (state.isRecording || writer) {
      writer?.close().catch(() => {});
      writer = null;
    }
    activeRecordingId = null;
    activeRecordingStartedAt = null;

    for (const recordingId of recordingIdsToDelete) {
      storage.deleteAudioFile(recordingId).catch(() => {});
    }

    updateState({
      isRecording: false,
      sessionId: null,
      totalChunks: 0,
      pendingRecordings: [],
      error: null,
    });
  }

  function dispose(): void {
    if (isDisposed) return;

    if (state.isRecording || writer) {
      writer?.close().catch(() => {});
      writer = null;
      state = {
        ...state,
        isRecording: false,
        sessionId: null,
        totalChunks: 0,
        pendingRecordings: [],
      };
      callbacks.onStateChange({ ...state });
    }
    activeRecordingId = null;
    activeRecordingStartedAt = null;

    isDisposed = true;
  }

  return {
    start,
    writeChunk,
    stop,
    removePendingRecording,
    reset,
    getState: () => ({ ...state }),
    dispose,
  };
}
