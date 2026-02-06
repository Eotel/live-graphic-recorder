/**
 * Composite hook for managing a complete meeting session.
 *
 * This hook combines transcript store, session store, and meeting controller
 * to provide a unified interface for the recording view.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/hooks/useTranscriptStore.ts, src/hooks/useSessionStore.ts, src/hooks/useMeetingController.ts
 */

import { useCallback, useMemo, useRef } from "react";
import { useTranscriptStore } from "./useTranscriptStore";
import { useSessionStore } from "./useSessionStore";
import { useMeetingController } from "./useMeetingController";
import type {
  CameraFrame,
  SummaryPage,
  TranscriptSegment,
  ImageModelPreset,
} from "../types/messages";

export interface UseMeetingSessionReturn {
  // Connection state
  isConnected: boolean;
  sessionStatus: "idle" | "recording" | "processing" | "error";
  generationPhase: "idle" | "analyzing" | "generating" | "retrying";
  error: string | null;

  // Meeting state
  meeting: {
    meetingId: string | null;
    meetingTitle: string | null;
    sessionId: string | null;
    meetingList: Array<{
      id: string;
      title: string | null;
      startedAt: number;
      endedAt: number | null;
      createdAt: number;
    }>;
  };

  // Transcript state
  transcriptSegments: TranscriptSegment[];
  interimText: string;
  interimSpeaker: number | undefined;
  interimStartTime: number | undefined;

  // Session state
  summaryPages: SummaryPage[];
  topics: string[];
  tags: string[];
  flow: number;
  heat: number;
  images: Array<{
    base64?: string;
    url?: string;
    prompt: string;
    timestamp: number;
  }>;

  // Image model state
  imageModel: {
    preset: ImageModelPreset;
    model: string;
    available: {
      flash: string;
      pro?: string;
    };
  };

  // Derived states
  isAnalyzing: boolean;
  isGenerating: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendAudio: (data: ArrayBuffer) => void;
  startMeeting: (title?: string, meetingId?: string) => void;
  stopMeeting: () => void;
  requestMeetingList: () => void;
  updateMeetingTitle: (title: string) => void;
  startSession: () => void;
  stopSession: () => void;
  sendCameraFrame: (data: CameraFrame) => void;
  setImageModelPreset: (preset: ImageModelPreset) => void;
  resetSession: () => void;
}

/**
 * Hook that provides complete meeting session management.
 */
export function useMeetingSession(): UseMeetingSessionReturn {
  // Stores for managing state
  const transcriptStore = useTranscriptStore();
  const sessionStore = useSessionStore();

  // Track latest analysis values (topics, tags, flow, heat)
  const latestAnalysisRef = useRef({
    topics: [] as string[],
    tags: [] as string[],
    flow: 50,
    heat: 50,
  });

  // Meeting controller callbacks
  const handleTranscript = useCallback(
    (data: {
      text: string;
      isFinal: boolean;
      timestamp: number;
      speaker?: number;
      startTime?: number;
    }) => {
      transcriptStore.addTranscript(data);
    },
    [transcriptStore],
  );

  const handleUtteranceEnd = useCallback(
    (timestamp: number) => {
      transcriptStore.markUtteranceEnd(timestamp);
    },
    [transcriptStore],
  );

  const handleAnalysis = useCallback(
    (data: { summary: string[]; topics: string[]; tags: string[]; flow: number; heat: number }) => {
      sessionStore.addAnalysis({
        summary: data.summary,
        topics: data.topics,
        tags: data.tags,
        flow: data.flow,
        heat: data.heat,
      });
      latestAnalysisRef.current = {
        topics: data.topics,
        tags: data.tags,
        flow: data.flow,
        heat: data.heat,
      };
    },
    [sessionStore],
  );

  const handleImage = useCallback(
    (data: { base64?: string; url?: string; prompt: string; timestamp: number }) => {
      sessionStore.addImage(data);
    },
    [sessionStore],
  );

  const handleMeetingHistory = useCallback(
    (data: {
      transcripts: TranscriptSegment[];
      analyses: Array<{
        summary: string[];
        topics: string[];
        tags: string[];
        flow: number;
        heat: number;
        timestamp?: number;
      }>;
      images: Array<{ url?: string; prompt: string; timestamp: number }>;
      captures: Array<{ url: string; timestamp: number }>;
      metaSummaries: Array<{
        summary: string[];
        themes: string[];
        startTime: number;
        endTime: number;
      }>;
    }) => {
      // Restore transcripts
      transcriptStore.loadHistory(data.transcripts);

      // Restore session data
      sessionStore.loadHistory({
        analyses: data.analyses,
        images: data.images,
        captures: data.captures,
        metaSummaries: data.metaSummaries,
      });

      // Update latest analysis metrics
      if (data.analyses.length > 0) {
        const latestAnalysis = data.analyses[data.analyses.length - 1];
        if (latestAnalysis) {
          latestAnalysisRef.current = {
            topics: latestAnalysis.topics,
            tags: latestAnalysis.tags,
            flow: latestAnalysis.flow,
            heat: latestAnalysis.heat,
          };
        }
      }
    },
    [transcriptStore, sessionStore],
  );

  // Meeting controller (replaces useWebSocket)
  const mc = useMeetingController({
    onTranscript: handleTranscript,
    onUtteranceEnd: handleUtteranceEnd,
    onAnalysis: handleAnalysis,
    onImage: handleImage,
    onMeetingHistory: handleMeetingHistory,
  });

  // Reset session data
  const resetSession = useCallback(() => {
    transcriptStore.clear();
    sessionStore.clear();
    latestAnalysisRef.current = {
      topics: [],
      tags: [],
      flow: 50,
      heat: 50,
    };
  }, [transcriptStore, sessionStore]);

  // Compute summary pages from analyses (memoized for stable identity)
  const summaryPages: SummaryPage[] = useMemo(
    () =>
      sessionStore.analyses.map((a) => ({
        points: a.summary,
        timestamp: a.timestamp ?? Date.now(),
      })),
    [sessionStore.analyses],
  );

  // Get latest analysis values (or defaults)
  const { topics, tags, flow, heat } =
    sessionStore.analyses.length > 0
      ? latestAnalysisRef.current
      : { topics: [], tags: [], flow: 50, heat: 50 };

  // Derived states
  const isAnalyzing = mc.generationPhase === "analyzing";
  const isGenerating = mc.generationPhase === "generating" || mc.generationPhase === "retrying";

  return {
    // Connection state
    isConnected: mc.isConnected,
    sessionStatus: mc.sessionStatus,
    generationPhase: mc.generationPhase,
    error: mc.error,

    // Meeting state
    meeting: mc.meeting,

    // Transcript state
    transcriptSegments: transcriptStore.segments,
    interimText: transcriptStore.interimText,
    interimSpeaker: transcriptStore.interimSpeaker,
    interimStartTime: transcriptStore.interimStartTime,

    // Session state
    summaryPages,
    topics,
    tags,
    flow,
    heat,
    images: sessionStore.images,

    imageModel: mc.imageModel,

    // Derived states
    isAnalyzing,
    isGenerating,

    // Actions
    connect: mc.connect,
    disconnect: mc.disconnect,
    sendAudio: mc.sendAudio,
    startMeeting: mc.startMeeting,
    stopMeeting: mc.stopMeeting,
    requestMeetingList: mc.requestMeetingList,
    updateMeetingTitle: mc.updateMeetingTitle,
    startSession: mc.startSession,
    stopSession: mc.stopSession,
    sendCameraFrame: mc.sendCameraFrame,
    setImageModelPreset: mc.setImageModelPreset,
    resetSession,
  };
}
