/**
 * React hook for audio upload to server.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/logic/upload-controller.ts, src/adapters/opfs-storage.ts
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { PendingUploadRecording, UploadState } from "../logic/upload-controller";
import { createUploadController } from "../logic/upload-controller";
import type { OPFSStorageAdapter } from "../adapters/opfs-storage";
import { createOPFSStorageAdapter, createMockOPFSStorageAdapter } from "../adapters/opfs-storage";

export interface UseAudioUploadOptions {
  storage?: OPFSStorageAdapter;
  fetchFn?: typeof fetch;
  onComplete?: (recordingId: string) => void;
}

export interface UseAudioUploadReturn extends UploadState {
  upload(recordings: PendingUploadRecording[], meetingId: string): Promise<void>;
  cancel(): void;
}

function detectStorage(override?: OPFSStorageAdapter): OPFSStorageAdapter {
  if (override) return override;
  if (typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function") {
    return createOPFSStorageAdapter();
  }
  return createMockOPFSStorageAdapter();
}

/**
 * Hook that provides audio upload functionality.
 * Uses real OPFS in supported browsers, mock storage in test/SSR.
 */
export function useAudioUpload(options?: UseAudioUploadOptions): UseAudioUploadReturn {
  const controllerRef = useRef<ReturnType<typeof createUploadController> | null>(null);
  const stateRef = useRef<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    lastUploadedSessionId: null,
    lastUploadedAudioUrl: null,
    uploadedCount: 0,
    totalCount: 0,
  });

  const subscribersRef = useRef<Set<() => void>>(new Set());

  // Use stable refs for options
  const optionsRef = useRef(options);
  optionsRef.current = options;

  if (!controllerRef.current) {
    const storage = detectStorage(options?.storage);
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    controllerRef.current = createUploadController(
      {
        storage,
        baseUrl,
        fetchFn: options?.fetchFn,
        xhrFactory: typeof XMLHttpRequest !== "undefined" ? () => new XMLHttpRequest() : undefined,
      },
      {
        onStateChange: (state) => {
          stateRef.current = state;
          subscribersRef.current.forEach((cb) => cb());
        },
        onComplete: (recordingId) => {
          optionsRef.current?.onComplete?.(recordingId);
        },
        onError: () => {},
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

  const upload = useCallback(async (recordings: PendingUploadRecording[], meetingId: string) => {
    await controllerRef.current?.upload(recordings, meetingId);
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.cancel();
  }, []);

  return {
    ...state,
    upload,
    cancel,
  };
}
