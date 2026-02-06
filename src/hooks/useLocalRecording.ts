/**
 * React hook for local audio recording via OPFS.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/logic/local-recording-controller.ts, src/adapters/opfs-storage.ts
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { LocalRecordingState } from "../logic/local-recording-controller";
import { createLocalRecordingController } from "../logic/local-recording-controller";
import type { OPFSStorageAdapter } from "../adapters/opfs-storage";
import { createOPFSStorageAdapter, createMockOPFSStorageAdapter } from "../adapters/opfs-storage";

export interface UseLocalRecordingReturn extends LocalRecordingState {
  start(sessionId: string): Promise<void>;
  writeChunk(chunk: ArrayBuffer): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
}

function detectStorage(override?: OPFSStorageAdapter): OPFSStorageAdapter {
  if (override) return override;
  // Use real OPFS in browsers that support it
  if (typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function") {
    return createOPFSStorageAdapter();
  }
  return createMockOPFSStorageAdapter();
}

/**
 * Hook that provides local audio recording using OPFS storage.
 * Uses real OPFS in supported browsers, mock storage in test/SSR.
 */
export function useLocalRecording(storageOverride?: OPFSStorageAdapter): UseLocalRecordingReturn {
  const controllerRef = useRef<ReturnType<typeof createLocalRecordingController> | null>(null);
  const stateRef = useRef<LocalRecordingState>({
    isRecording: false,
    sessionId: null,
    totalChunks: 0,
    error: null,
  });

  const subscribersRef = useRef<Set<() => void>>(new Set());

  if (!controllerRef.current) {
    const storage = detectStorage(storageOverride);

    controllerRef.current = createLocalRecordingController(
      { storage },
      {
        onStateChange: (state) => {
          stateRef.current = state;
          subscribersRef.current.forEach((cb) => cb());
        },
      },
    );
  }

  const subscribe = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Cleanup on unmount (or StrictMode effect remount)
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  const start = useCallback(async (sessionId: string) => {
    await controllerRef.current?.start(sessionId);
  }, []);

  const writeChunk = useCallback(async (chunk: ArrayBuffer) => {
    await controllerRef.current?.writeChunk(chunk);
  }, []);

  const stop = useCallback(async () => {
    await controllerRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.reset();
  }, []);

  return {
    ...state,
    start,
    writeChunk,
    stop,
    reset,
  };
}
