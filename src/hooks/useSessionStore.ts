/**
 * React hook for SessionStore.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/logic/session-store.ts
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import type {
  SessionStoreState,
  AnalysisData,
  ImageData,
  CaptureData,
  MetaSummaryData,
} from "../logic/types";
import { createSessionStore } from "../logic/session-store";

export interface UseSessionStoreReturn extends SessionStoreState {
  /**
   * Add an analysis result.
   */
  addAnalysis: (data: AnalysisData) => void;

  /**
   * Add an image.
   */
  addImage: (data: ImageData) => void;

  /**
   * Add a capture.
   */
  addCapture: (data: CaptureData) => void;

  /**
   * Load session history.
   */
  loadHistory: (data: {
    analyses?: AnalysisData[];
    images?: ImageData[];
    captures?: CaptureData[];
    metaSummaries?: MetaSummaryData[];
  }) => void;

  /**
   * Clear all session data.
   */
  clear: () => void;
}

/**
 * Hook that provides session state management.
 */
export function useSessionStore(): UseSessionStoreReturn {
  // Create store with stable reference
  const storeRef = useRef<ReturnType<typeof createSessionStore> | null>(null);
  const stateRef = useRef<SessionStoreState>({
    analyses: [],
    images: [],
    captures: [],
    metaSummaries: [],
  });

  // Subscribers for external store
  const subscribersRef = useRef<Set<() => void>>(new Set());

  // Initialize store once
  if (!storeRef.current) {
    storeRef.current = createSessionStore({
      onStateChange: (state) => {
        stateRef.current = state;
        subscribersRef.current.forEach((cb) => cb());
      },
    });
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

  // Create stable action callbacks
  const addAnalysis = useCallback((data: AnalysisData) => {
    storeRef.current?.addAnalysis(data);
  }, []);

  const addImage = useCallback((data: ImageData) => {
    storeRef.current?.addImage(data);
  }, []);

  const addCapture = useCallback((data: CaptureData) => {
    storeRef.current?.addCapture(data);
  }, []);

  const loadHistory = useCallback(
    (data: {
      analyses?: AnalysisData[];
      images?: ImageData[];
      captures?: CaptureData[];
      metaSummaries?: MetaSummaryData[];
    }) => {
      storeRef.current?.loadHistory(data);
    },
    [],
  );

  const clear = useCallback(() => {
    storeRef.current?.clear();
  }, []);

  return {
    ...state,
    addAnalysis,
    addImage,
    addCapture,
    loadHistory,
    clear,
  };
}
