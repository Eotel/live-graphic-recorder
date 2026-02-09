/**
 * Composite hook for managing a complete meeting session.
 *
 * This hook combines transcript store, session store, and meeting controller
 * to provide a unified interface for the recording view.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/hooks/useTranscriptStore.ts, src/hooks/useSessionStore.ts, src/hooks/useMeetingController.ts
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranscriptStore } from "./useTranscriptStore";
import { useSessionStore } from "./useSessionStore";
import { useMeetingController } from "./useMeetingController";
import type {
  CameraFrame,
  SummaryPage,
  TranscriptSegment,
  ImageModelPreset,
  MeetingMode,
  MeetingHistoryCursor,
  SttConnectionState,
} from "../types/messages";

export interface UseMeetingSessionReturn {
  // Connection state
  isConnected: boolean;
  sessionStatus: "idle" | "recording" | "processing" | "error";
  generationPhase: "idle" | "analyzing" | "generating" | "retrying";
  sttStatus: {
    state: SttConnectionState;
    retryAttempt?: number;
    message?: string;
  } | null;
  error: string | null;

  // Meeting state
  meeting: {
    meetingId: string | null;
    meetingTitle: string | null;
    sessionId: string | null;
    mode: MeetingMode | null;
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
  speakerAliases: Record<number, string>;

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
  startMeeting: (title?: string, meetingId?: string, mode?: MeetingMode) => void;
  stopMeeting: () => void;
  requestMeetingList: () => void;
  requestMeetingHistoryDelta: (meetingId: string, cursor?: MeetingHistoryCursor) => void;
  setMeetingMode: (mode: MeetingMode) => void;
  updateMeetingTitle: (title: string) => void;
  updateSpeakerAlias: (speaker: number, displayName: string) => void;
  startSession: () => void;
  stopSession: () => void;
  sendCameraFrame: (data: CameraFrame) => void;
  setImageModelPreset: (preset: ImageModelPreset) => void;
  resetSession: () => void;
}

const VIEW_HISTORY_POLL_INTERVAL_MS = 5000;

function uniqueAppend<T>(current: T[], incoming: T[], keyOf: (item: T) => string): T[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map(keyOf));
  const merged = [...current];
  for (const item of incoming) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function maxTimestamp(values: Array<number | undefined>): number | undefined {
  let max: number | undefined;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (typeof max === "undefined" || (value as number) > max) {
      max = value as number;
    }
  }
  return max;
}

/**
 * Hook that provides complete meeting session management.
 *
 * @deprecated `src/app/view-model/app-store.ts` と `src/app/usecases/*` への移行を進めるため、
 * 新規実装では container/view-model 経由のオーケストレーションを利用してください。
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
      speakerAliases: Record<number, string>;
    }) => {
      // Restore transcripts
      transcriptStore.loadHistory(data.transcripts);
      transcriptStore.setSpeakerAliases(data.speakerAliases);

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

  const handleMeetingHistoryDelta = useCallback(
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
      speakerAliases: Record<number, string>;
    }) => {
      const mergedTranscripts = uniqueAppend(transcriptStore.segments, data.transcripts, (t) =>
        JSON.stringify([
          t.timestamp,
          t.text,
          t.isFinal,
          t.speaker ?? null,
          t.startTime ?? null,
          t.isUtteranceEnd ?? false,
        ]),
      );
      transcriptStore.loadHistory(mergedTranscripts);

      const mergedAnalyses = uniqueAppend(sessionStore.analyses, data.analyses, (a) =>
        JSON.stringify([a.timestamp ?? null, a.flow, a.heat, a.summary, a.topics, a.tags]),
      );
      const mergedImages = uniqueAppend(sessionStore.images, data.images, (i) =>
        JSON.stringify([i.timestamp, i.url ?? null, i.prompt]),
      );
      const mergedCaptures = uniqueAppend(sessionStore.captures, data.captures, (c) =>
        JSON.stringify([c.timestamp, c.url]),
      );
      const mergedMetaSummaries = uniqueAppend(
        sessionStore.metaSummaries,
        data.metaSummaries,
        (m) => JSON.stringify([m.startTime, m.endTime, m.summary, m.themes]),
      );

      sessionStore.loadHistory({
        analyses: mergedAnalyses,
        images: mergedImages,
        captures: mergedCaptures,
        metaSummaries: mergedMetaSummaries,
      });

      transcriptStore.setSpeakerAliases(data.speakerAliases);

      if (mergedAnalyses.length > 0) {
        const latestAnalysis = mergedAnalyses[mergedAnalyses.length - 1];
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
    [sessionStore, transcriptStore],
  );

  const handleSpeakerAliases = useCallback(
    (speakerAliases: Record<number, string>) => {
      transcriptStore.setSpeakerAliases(speakerAliases);
    },
    [transcriptStore],
  );

  // Meeting controller (replaces useWebSocket)
  const mc = useMeetingController({
    onTranscript: handleTranscript,
    onUtteranceEnd: handleUtteranceEnd,
    onAnalysis: handleAnalysis,
    onImage: handleImage,
    onMeetingHistory: handleMeetingHistory,
    onMeetingHistoryDelta: handleMeetingHistoryDelta,
    onSpeakerAliases: handleSpeakerAliases,
  });

  useEffect(() => {
    if (mc.meeting.mode !== "view") return;
    const meetingId = mc.meeting.meetingId;
    if (!meetingId) return;

    const requestDelta = () => {
      const cursor: MeetingHistoryCursor = {
        transcriptTs: maxTimestamp(transcriptStore.segments.map((segment) => segment.timestamp)),
        analysisTs: maxTimestamp(sessionStore.analyses.map((analysis) => analysis.timestamp)),
        imageTs: maxTimestamp(sessionStore.images.map((image) => image.timestamp)),
        captureTs: maxTimestamp(sessionStore.captures.map((capture) => capture.timestamp)),
        metaSummaryEndTs: maxTimestamp(
          sessionStore.metaSummaries.map((metaSummary) => metaSummary.endTime),
        ),
      };
      mc.requestMeetingHistoryDelta(meetingId, cursor);
    };

    requestDelta();
    const intervalId = setInterval(requestDelta, VIEW_HISTORY_POLL_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
    };
  }, [
    mc.meeting.meetingId,
    mc.meeting.mode,
    mc.requestMeetingHistoryDelta,
    sessionStore.analyses,
    sessionStore.captures,
    sessionStore.images,
    sessionStore.metaSummaries,
    transcriptStore.segments,
  ]);

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
    sttStatus: mc.sttStatus,
    error: mc.error,

    // Meeting state
    meeting: mc.meeting,

    // Transcript state
    transcriptSegments: transcriptStore.segments,
    interimText: transcriptStore.interimText,
    interimSpeaker: transcriptStore.interimSpeaker,
    interimStartTime: transcriptStore.interimStartTime,
    speakerAliases: transcriptStore.speakerAliases,

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
    requestMeetingHistoryDelta: mc.requestMeetingHistoryDelta,
    setMeetingMode: mc.setMeetingMode,
    updateMeetingTitle: mc.updateMeetingTitle,
    updateSpeakerAlias: mc.updateSpeakerAlias,
    startSession: mc.startSession,
    stopSession: mc.stopSession,
    sendCameraFrame: mc.sendCameraFrame,
    setImageModelPreset: mc.setImageModelPreset,
    resetSession,
  };
}
