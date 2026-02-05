/**
 * React hook for RecordingController.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/logic/recording-controller.ts, src/adapters/media-recorder.ts
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { RecordingControllerState } from "../logic/types";
import { createRecordingController } from "../logic/recording-controller";
import { createMediaRecorderAdapter } from "../adapters/media-recorder";

export interface UseRecordingControllerOptions {
  audioStream: MediaStream | null;
  hasPermission: boolean;
  isConnected: boolean;
  hasMeeting: boolean;
  onChunk: (data: ArrayBuffer) => void;
  onSessionStart: () => void;
  onSessionStop: () => void;
}

export interface UseRecordingControllerReturn extends RecordingControllerState {
  start(): void;
  stop(): void;
}

/**
 * Hook that provides recording control using the logic layer controller.
 */
export function useRecordingController(
  options: UseRecordingControllerOptions,
): UseRecordingControllerReturn {
  const {
    audioStream,
    hasPermission,
    isConnected,
    hasMeeting,
    onChunk,
    onSessionStart,
    onSessionStop,
  } = options;

  // Keep callbacks in refs to avoid recreating controller
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const onSessionStartRef = useRef(onSessionStart);
  onSessionStartRef.current = onSessionStart;
  const onSessionStopRef = useRef(onSessionStop);
  onSessionStopRef.current = onSessionStop;

  // Create controller with stable reference
  const controllerRef = useRef<ReturnType<typeof createRecordingController> | null>(null);
  const stateRef = useRef<RecordingControllerState>({
    isRecording: false,
    isPendingStart: false,
    error: null,
  });

  // Subscribers for external store
  const subscribersRef = useRef<Set<() => void>>(new Set());

  // Initialize controller once
  if (!controllerRef.current) {
    const mediaRecorder = createMediaRecorderAdapter();

    controllerRef.current = createRecordingController(
      { mediaRecorder },
      {
        onChunk: (data) => onChunkRef.current(data),
        onSessionStart: () => onSessionStartRef.current(),
        onSessionStop: () => onSessionStopRef.current(),
        onStateChange: (state) => {
          stateRef.current = state;
          subscribersRef.current.forEach((cb) => cb());
        },
      },
    );
  }

  // Use sync external store for state updates
  const subscribe = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Notify controller when conditions change
  useEffect(() => {
    controllerRef.current?.onConditionsChanged({
      audioStream,
      hasPermission,
      isConnected,
      hasMeeting,
    });
  }, [audioStream, hasPermission, isConnected, hasMeeting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
    };
  }, []);

  // Store current options in ref for start() to snapshot
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const start = useCallback(() => {
    const opts = optionsRef.current;
    controllerRef.current?.start({
      audioStream: opts.audioStream,
      hasPermission: opts.hasPermission,
      isConnected: opts.isConnected,
      hasMeeting: opts.hasMeeting,
    });
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.stop();
  }, []);

  return {
    ...state,
    start,
    stop,
  };
}
