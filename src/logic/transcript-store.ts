/**
 * Transcript store - manages transcript segments.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/types/messages.ts, src/hooks/useWebSocket.ts
 */

import type { TranscriptSegment } from "../types/messages";
import type { TranscriptStoreState, TranscriptStoreActions, TranscriptStoreEvents } from "./types";

/**
 * Create a transcript store.
 */
export function createTranscriptStore(
  events: TranscriptStoreEvents,
): TranscriptStoreActions & { getState: () => TranscriptStoreState } {
  let state: TranscriptStoreState = {
    segments: [],
    interimText: "",
    interimSpeaker: undefined,
    interimStartTime: undefined,
  };

  function emit() {
    events.onStateChange({ ...state });
  }

  function updateState(updates: Partial<TranscriptStoreState>) {
    state = { ...state, ...updates };
    emit();
  }

  function addTranscript(data: {
    text: string;
    isFinal: boolean;
    timestamp: number;
    speaker?: number;
    startTime?: number;
  }): void {
    if (data.isFinal) {
      // Final transcript - add to segments and clear interim
      const segment: TranscriptSegment = {
        text: data.text,
        timestamp: data.timestamp,
        isFinal: true,
        speaker: data.speaker,
        startTime: data.startTime,
      };
      updateState({
        segments: [...state.segments, segment],
        interimText: "",
        interimSpeaker: undefined,
        interimStartTime: undefined,
      });
    } else {
      // Interim transcript - update interim state
      updateState({
        interimText: data.text,
        interimSpeaker: data.speaker,
        interimStartTime: data.startTime,
      });
    }
  }

  function markUtteranceEnd(_timestamp: number): void {
    // Add utterance end marker to the last segment
    const segments = [...state.segments];
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      segments[segments.length - 1] = {
        ...lastSegment,
        isUtteranceEnd: true,
      };
      updateState({ segments });
    }
  }

  function loadHistory(transcripts: TranscriptSegment[]): void {
    updateState({
      segments: transcripts,
      interimText: "",
      interimSpeaker: undefined,
      interimStartTime: undefined,
    });
  }

  function clear(): void {
    updateState({
      segments: [],
      interimText: "",
      interimSpeaker: undefined,
      interimStartTime: undefined,
    });
  }

  return {
    getState: () => ({ ...state }),
    addTranscript,
    markUtteranceEnd,
    loadHistory,
    clear,
  };
}
