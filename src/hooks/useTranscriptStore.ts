/**
 * React hook for TranscriptStore.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/logic/transcript-store.ts
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { TranscriptSegment } from "../types/messages";
import type { TranscriptStoreState } from "../logic/types";
import { createTranscriptStore } from "../logic/transcript-store";

export interface UseTranscriptStoreReturn extends TranscriptStoreState {
  /**
   * Add a transcript (interim or final).
   */
  addTranscript: (data: {
    text: string;
    isFinal: boolean;
    timestamp: number;
    speaker?: number;
    startTime?: number;
  }) => void;

  /**
   * Mark the end of an utterance.
   */
  markUtteranceEnd: (timestamp: number) => void;

  /**
   * Load transcript history.
   */
  loadHistory: (transcripts: TranscriptSegment[]) => void;

  /**
   * Set one speaker alias.
   */
  setSpeakerAlias: (speaker: number, displayName: string) => void;

  /**
   * Replace all speaker aliases.
   */
  setSpeakerAliases: (aliases: Record<number, string>) => void;

  /**
   * Clear all transcripts.
   */
  clear: () => void;
}

/**
 * Hook that provides transcript state management.
 */
export function useTranscriptStore(): UseTranscriptStoreReturn {
  // Create store with stable reference
  const storeRef = useRef<ReturnType<typeof createTranscriptStore> | null>(null);
  const stateRef = useRef<TranscriptStoreState>({
    segments: [],
    interimText: "",
    interimSpeaker: undefined,
    interimStartTime: undefined,
    speakerAliases: {},
  });

  // Subscribers for external store
  const subscribersRef = useRef<Set<() => void>>(new Set());

  // Initialize store once
  if (!storeRef.current) {
    storeRef.current = createTranscriptStore({
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
  const addTranscript = useCallback(
    (data: {
      text: string;
      isFinal: boolean;
      timestamp: number;
      speaker?: number;
      startTime?: number;
    }) => {
      storeRef.current?.addTranscript(data);
    },
    [],
  );

  const markUtteranceEnd = useCallback((timestamp: number) => {
    storeRef.current?.markUtteranceEnd(timestamp);
  }, []);

  const loadHistory = useCallback((transcripts: TranscriptSegment[]) => {
    storeRef.current?.loadHistory(transcripts);
  }, []);

  const clear = useCallback(() => {
    storeRef.current?.clear();
  }, []);

  const setSpeakerAlias = useCallback((speaker: number, displayName: string) => {
    storeRef.current?.setSpeakerAlias(speaker, displayName);
  }, []);

  const setSpeakerAliases = useCallback((aliases: Record<number, string>) => {
    storeRef.current?.setSpeakerAliases(aliases);
  }, []);

  return {
    ...state,
    addTranscript,
    markUtteranceEnd,
    loadHistory,
    setSpeakerAlias,
    setSpeakerAliases,
    clear,
  };
}
