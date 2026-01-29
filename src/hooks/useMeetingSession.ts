/**
 * Composite hook for managing a complete meeting session.
 *
 * This hook combines transcript store, session store, and WebSocket
 * to provide a unified interface for the recording view.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/hooks/useTranscriptStore.ts, src/hooks/useSessionStore.ts, src/hooks/useWebSocket.ts
 */

import { useCallback, useEffect, useRef } from "react";
import { useTranscriptStore } from "./useTranscriptStore";
import { useSessionStore } from "./useSessionStore";
import { useWebSocket } from "./useWebSocket";
import type {
  ClientMessage,
  MeetingHistoryMessage,
  SummaryPage,
  TranscriptSegment,
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

  // Derived states
  isAnalyzing: boolean;
  isGenerating: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: ClientMessage) => void;
  sendAudio: (data: ArrayBuffer) => void;
  startMeeting: (title?: string, meetingId?: string) => void;
  stopMeeting: () => void;
  requestMeetingList: () => void;
  updateMeetingTitle: (title: string) => void;
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

  // WebSocket callbacks
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
    (data: MeetingHistoryMessage["data"]) => {
      // Restore transcripts
      transcriptStore.loadHistory(
        data.transcripts.map((t) => ({
          text: t.text,
          timestamp: t.timestamp,
          isFinal: t.isFinal,
          speaker: t.speaker,
          startTime: t.startTime,
          isUtteranceEnd: t.isUtteranceEnd,
        })),
      );

      // Restore session data
      sessionStore.loadHistory({
        analyses: data.analyses.map((a) => ({
          summary: a.summary,
          topics: a.topics,
          tags: a.tags,
          flow: a.flow,
          heat: a.heat,
          timestamp: a.timestamp,
        })),
        images: data.images.map((img) => ({
          url: img.url,
          prompt: img.prompt,
          timestamp: img.timestamp,
        })),
        captures: data.captures?.map((c) => ({
          url: c.url,
          timestamp: c.timestamp,
        })),
        metaSummaries: data.metaSummaries?.map((m) => ({
          summary: m.summary,
          themes: m.themes,
          startTime: m.startTime,
          endTime: m.endTime,
        })),
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

  // WebSocket connection
  const ws = useWebSocket({
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

  // Compute summary pages from analyses
  const summaryPages: SummaryPage[] = sessionStore.analyses.map((a) => ({
    points: a.summary,
    timestamp: a.timestamp ?? Date.now(),
  }));

  // Get latest analysis values (or defaults)
  const { topics, tags, flow, heat } =
    sessionStore.analyses.length > 0
      ? latestAnalysisRef.current
      : { topics: [], tags: [], flow: 50, heat: 50 };

  // Derived states
  const isAnalyzing = ws.generationPhase === "analyzing";
  const isGenerating = ws.generationPhase === "generating" || ws.generationPhase === "retrying";

  return {
    // Connection state
    isConnected: ws.isConnected,
    sessionStatus: ws.sessionStatus,
    generationPhase: ws.generationPhase,
    error: ws.error,

    // Meeting state
    meeting: ws.meeting,

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

    // Derived states
    isAnalyzing,
    isGenerating,

    // Actions
    connect: ws.connect,
    disconnect: ws.disconnect,
    sendMessage: ws.sendMessage,
    sendAudio: ws.sendAudio,
    startMeeting: ws.startMeeting,
    stopMeeting: ws.stopMeeting,
    requestMeetingList: ws.requestMeetingList,
    updateMeetingTitle: ws.updateMeetingTitle,
    resetSession,
  };
}
