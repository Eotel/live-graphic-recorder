/**
 * Recording controller - manages recording lifecycle and state transitions.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/media-recorder.ts, src/hooks/useRecordingController.ts
 */

import type { MediaRecorderInstance } from "../adapters/types";
import type {
  RecordingContext,
  RecordingControllerState,
  RecordingControllerDeps,
  RecordingControllerCallbacks,
  RecordingControllerActions,
} from "./types";
import { AUDIO_CONFIG } from "../config/constants";

/**
 * Create a recording controller that manages MediaRecorder lifecycle.
 */
export function createRecordingController(
  deps: RecordingControllerDeps,
  callbacks: RecordingControllerCallbacks,
): RecordingControllerActions & { getState: () => RecordingControllerState } {
  const { mediaRecorder: mediaRecorderAdapter } = deps;

  let state: RecordingControllerState = {
    isRecording: false,
    isPendingStart: false,
    error: null,
  };

  let recorderInstance: MediaRecorderInstance | null = null;
  let isDisposed = false;
  let didEmitSessionStart = false;

  function updateState(updates: Partial<RecordingControllerState>): void {
    state = { ...state, ...updates };
    if (!isDisposed) {
      callbacks.onStateChange({ ...state });
    }
  }

  function startRecorder(audioStream: MediaStream): void {
    try {
      recorderInstance = mediaRecorderAdapter.create(audioStream, {
        mimeType: AUDIO_CONFIG.mimeType,
      });

      recorderInstance.onDataAvailable((data: Blob) => {
        if (data.size > 0) {
          void data.arrayBuffer().then((buffer) => {
            if (!isDisposed) {
              callbacks.onChunk(buffer);
            }
          });
        }
      });

      recorderInstance.onError(() => {
        updateState({ isRecording: false, error: "Recording error occurred" });
      });

      recorderInstance.start(AUDIO_CONFIG.timesliceMs);
      didEmitSessionStart = true;
      callbacks.onSessionStart();
      updateState({ isRecording: true, isPendingStart: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start recording";
      updateState({ error: message });
    }
  }

  function stopRecorder(): void {
    if (recorderInstance) {
      try {
        recorderInstance.stop();
      } catch {
        // Ignore errors during stop (e.g. already stopped)
      }
      recorderInstance = null;
    }

    if (didEmitSessionStart) {
      didEmitSessionStart = false;
      callbacks.onSessionStop();
    }

    updateState({ isRecording: false, isPendingStart: false, error: null });
  }

  function start(context: RecordingContext): void {
    if (isDisposed) return;
    if (state.isRecording || state.isPendingStart) return;

    // No meeting = no-op (silent)
    if (!context.hasMeeting) return;

    // No permission or no stream = error
    if (!context.hasPermission || !context.audioStream) {
      updateState({ error: "No audio stream available" });
      return;
    }

    // No connection = pending
    if (!context.isConnected) {
      updateState({ isPendingStart: true, error: null });
      return;
    }

    startRecorder(context.audioStream);
  }

  function stop(): void {
    if (isDisposed) return;

    if (state.isPendingStart) {
      // Was pending, never started recording, don't emit onSessionStop
      didEmitSessionStart = false;
      updateState({ isPendingStart: false });
      return;
    }

    if (!state.isRecording) return;

    stopRecorder();
  }

  function onConditionsChanged(context: RecordingContext): void {
    if (isDisposed) return;

    if (state.isPendingStart) {
      // Check if conditions invalidate the pending start
      if (!context.hasPermission || !context.audioStream || !context.hasMeeting) {
        didEmitSessionStart = false;
        updateState({ isPendingStart: false });
        return;
      }

      // All conditions met → start recording
      if (context.isConnected) {
        startRecorder(context.audioStream);
      }
      return;
    }

    if (state.isRecording) {
      // Check if conditions require stopping
      if (!context.hasPermission || !context.audioStream || !context.hasMeeting) {
        stopRecorder();
      }
    }
  }

  function dispose(): void {
    if (isDisposed) return;
    isDisposed = true;

    if (state.isRecording) {
      stopRecorder();
    } else if (state.isPendingStart) {
      // Pending, no session was started, just clean up
      state = { ...state, isPendingStart: false };
    }
  }

  return {
    getState: () => ({ ...state }),
    start,
    stop,
    onConditionsChanged,
    dispose,
  };
}
