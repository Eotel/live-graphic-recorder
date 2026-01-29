/**
 * Session store - manages analysis results, images, and captures.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/types/messages.ts, src/App.tsx
 */

import type {
  SessionStoreState,
  SessionStoreActions,
  SessionStoreEvents,
  AnalysisData,
  ImageData,
  CaptureData,
  MetaSummaryData,
} from "./types";

/**
 * Create a session store.
 */
export function createSessionStore(
  events: SessionStoreEvents,
): SessionStoreActions & { getState: () => SessionStoreState } {
  let state: SessionStoreState = {
    analyses: [],
    images: [],
    captures: [],
    metaSummaries: [],
  };

  function emit() {
    events.onStateChange({ ...state });
  }

  function updateState(updates: Partial<SessionStoreState>) {
    state = { ...state, ...updates };
    emit();
  }

  function addAnalysis(data: AnalysisData): void {
    const analysis: AnalysisData = {
      summary: data.summary,
      topics: data.topics,
      tags: data.tags,
      flow: data.flow,
      heat: data.heat,
      timestamp: data.timestamp ?? Date.now(),
    };
    updateState({
      analyses: [...state.analyses, analysis],
    });
  }

  function addImage(data: ImageData): void {
    updateState({
      images: [...state.images, data],
    });
  }

  function addCapture(data: CaptureData): void {
    updateState({
      captures: [...state.captures, data],
    });
  }

  function loadHistory(data: {
    analyses?: AnalysisData[];
    images?: ImageData[];
    captures?: CaptureData[];
    metaSummaries?: MetaSummaryData[];
  }): void {
    updateState({
      analyses: data.analyses ?? [],
      images: data.images ?? [],
      captures: data.captures ?? [],
      metaSummaries: data.metaSummaries ?? [],
    });
  }

  function clear(): void {
    updateState({
      analyses: [],
      images: [],
      captures: [],
      metaSummaries: [],
    });
  }

  return {
    getState: () => ({ ...state }),
    addAnalysis,
    addImage,
    addCapture,
    loadHistory,
    clear,
  };
}
