/**
 * Session state management for recording sessions.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/services/server/analysis.ts
 */

import type {
  SessionState,
  TranscriptSegment,
  AnalysisResult,
  SessionStatus,
  CameraFrame,
} from "@/types/messages";
import { ANALYSIS_WORD_THRESHOLD, CAMERA_FRAME_BUFFER_SIZE } from "@/config/constants";

export function createSession(id: string): SessionState {
  return {
    id,
    status: "idle",
    startedAt: 0,
    transcript: [],
    analyses: [],
    images: [],
    cameraFrames: [],
    lastAnalysisAt: 0,
    wordsSinceLastAnalysis: 0,
  };
}

export function startSession(session: SessionState): SessionState {
  return {
    ...session,
    status: "recording",
    startedAt: Date.now(),
    lastAnalysisAt: Date.now(),
  };
}

export function stopSession(session: SessionState): SessionState {
  return {
    ...session,
    status: "idle",
  };
}

export function setSessionStatus(session: SessionState, status: SessionStatus): SessionState {
  return {
    ...session,
    status,
  };
}

export function addTranscript(session: SessionState, segment: TranscriptSegment): SessionState {
  const wordCount = segment.isFinal ? segment.text.split(/\s+/).filter(Boolean).length : 0;

  return {
    ...session,
    transcript: [...session.transcript, segment],
    wordsSinceLastAnalysis: session.wordsSinceLastAnalysis + wordCount,
  };
}

export function markUtteranceEnd(session: SessionState): SessionState {
  if (session.transcript.length === 0) {
    return session;
  }

  // Find the last final segment and mark it as utterance end
  const transcriptCopy = [...session.transcript];
  for (let i = transcriptCopy.length - 1; i >= 0; i--) {
    const segment = transcriptCopy[i];
    if (segment && segment.isFinal) {
      transcriptCopy[i] = {
        text: segment.text,
        timestamp: segment.timestamp,
        isFinal: segment.isFinal,
        speaker: segment.speaker,
        startTime: segment.startTime,
        isUtteranceEnd: true,
      };
      break;
    }
  }

  return {
    ...session,
    transcript: transcriptCopy,
  };
}

export function getFullTranscript(session: SessionState): string {
  return session.transcript
    .filter((segment) => segment.isFinal)
    .map((segment) => segment.text)
    .join(" ");
}

export function getTranscriptSinceLastAnalysis(session: SessionState): string {
  const lastAnalysisTime = session.lastAnalysisAt;
  return session.transcript
    .filter((segment) => segment.isFinal && segment.timestamp >= lastAnalysisTime)
    .map((segment) => segment.text)
    .join(" ");
}

export function shouldTriggerAnalysis(session: SessionState, intervalMs: number): boolean {
  if (session.status !== "recording") return false;

  // Must have at least some words since last analysis
  if (session.wordsSinceLastAnalysis === 0) return false;
  // Must have final transcript content available for analysis
  if (!getTranscriptSinceLastAnalysis(session).trim()) return false;

  const timeSinceLastAnalysis = Date.now() - session.lastAnalysisAt;
  const hasEnoughTime = timeSinceLastAnalysis >= intervalMs;
  const hasEnoughWords = session.wordsSinceLastAnalysis >= ANALYSIS_WORD_THRESHOLD;

  return hasEnoughTime || hasEnoughWords;
}

export function markAnalysisComplete(
  session: SessionState,
  analysis: AnalysisResult,
): SessionState {
  return {
    ...session,
    analyses: [...session.analyses, analysis],
    lastAnalysisAt: Date.now(),
    wordsSinceLastAnalysis: 0,
  };
}

export function addImage(
  session: SessionState,
  image: { base64: string; prompt: string; timestamp: number },
): SessionState {
  return {
    ...session,
    images: [...session.images, image],
  };
}

export function getLatestAnalysis(session: SessionState): AnalysisResult | undefined {
  return session.analyses.at(-1);
}

export function getLatestTopics(session: SessionState): string[] {
  const latest = getLatestAnalysis(session);
  return latest?.topics ?? [];
}

export function addCameraFrame(session: SessionState, frame: CameraFrame): SessionState {
  const frames = [...session.cameraFrames, frame];
  // Keep only the latest N frames (ring buffer)
  const trimmedFrames =
    frames.length > CAMERA_FRAME_BUFFER_SIZE
      ? frames.slice(frames.length - CAMERA_FRAME_BUFFER_SIZE)
      : frames;

  return {
    ...session,
    cameraFrames: trimmedFrames,
  };
}

export function getCameraFrames(session: SessionState): CameraFrame[] {
  return session.cameraFrames;
}

export function getLatestImage(
  session: SessionState,
): { base64: string; prompt: string; timestamp: number } | undefined {
  return session.images.at(-1);
}
