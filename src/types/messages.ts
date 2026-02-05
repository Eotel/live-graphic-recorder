/**
 * WebSocket message types for client-server communication.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/session.ts, src/hooks/useMeetingController.ts
 */

// ============================================================================
// Media Source Types
// ============================================================================

export type MediaSourceType = "camera" | "screen";

// ============================================================================
// Client → Server Messages
// ============================================================================

export interface SessionStartMessage {
  type: "session:start";
}

export interface SessionStopMessage {
  type: "session:stop";
}

export interface CameraFrame {
  base64: string;
  timestamp: number;
}

export interface CameraFrameMessage {
  type: "camera:frame";
  data: CameraFrame;
}

// ============================================================================
// Meeting Messages (Client → Server)
// ============================================================================

export interface MeetingStartMessage {
  type: "meeting:start";
  data: {
    title?: string;
    meetingId?: string; // Optional: join existing meeting
  };
}

export interface MeetingStopMessage {
  type: "meeting:stop";
}

export interface MeetingListRequestMessage {
  type: "meeting:list:request";
}

export interface MeetingUpdateMessage {
  type: "meeting:update";
  data: {
    title: string;
  };
}

export type ClientMessage =
  | SessionStartMessage
  | SessionStopMessage
  | CameraFrameMessage
  | MeetingStartMessage
  | MeetingStopMessage
  | MeetingListRequestMessage
  | MeetingUpdateMessage;

// ============================================================================
// Server → Client Messages
// ============================================================================

export interface TranscriptMessage {
  type: "transcript";
  data: {
    text: string;
    isFinal: boolean;
    timestamp: number;
    speaker?: number;
    startTime?: number;
  };
}

export interface AnalysisMessage {
  type: "analysis";
  data: {
    summary: string[];
    topics: string[];
    tags: string[];
    flow: number; // 0-100
    heat: number; // 0-100
  };
}

export interface ImageMessage {
  type: "image";
  data: {
    base64: string;
    prompt: string;
    timestamp: number;
  };
}

export type SessionStatus = "idle" | "recording" | "processing" | "error";

export interface SessionStatusMessage {
  type: "session:status";
  data: {
    status: SessionStatus;
    error?: string;
  };
}

export interface ErrorMessage {
  type: "error";
  data: {
    message: string;
    code?: string;
  };
}

// ============================================================================
// Generation Phase Types (for progress indicators)
// ============================================================================

export type GenerationPhase = "idle" | "analyzing" | "generating" | "retrying";

export interface GenerationStatusMessage {
  type: "generation:status";
  data: {
    phase: GenerationPhase;
    retryAttempt?: number;
  };
}

export interface UtteranceEndMessage {
  type: "utterance:end";
  data: {
    timestamp: number;
  };
}

// ============================================================================
// Meeting Messages (Server → Client)
// ============================================================================

export interface MeetingStatusMessage {
  type: "meeting:status";
  data: {
    meetingId: string;
    title?: string;
    sessionId: string;
  };
}

export interface MeetingInfo {
  id: string;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
}

export interface MeetingListMessage {
  type: "meeting:list";
  data: {
    meetings: MeetingInfo[];
  };
}

export interface MeetingHistoryMessage {
  type: "meeting:history";
  data: {
    transcripts: Array<{
      text: string;
      timestamp: number;
      isFinal: boolean;
      speaker?: number;
      startTime?: number;
      isUtteranceEnd?: boolean;
    }>;
    analyses: Array<{
      summary: string[];
      topics: string[];
      tags: string[];
      flow: number;
      heat: number;
      timestamp: number;
    }>;
    images: Array<{
      url: string;
      prompt: string;
      timestamp: number;
    }>;
    captures: Array<{
      url: string;
      timestamp: number;
    }>;
    metaSummaries: Array<{
      summary: string[];
      themes: string[];
      startTime: number;
      endTime: number;
    }>;
  };
}

export type ServerMessage =
  | TranscriptMessage
  | AnalysisMessage
  | ImageMessage
  | SessionStatusMessage
  | ErrorMessage
  | GenerationStatusMessage
  | UtteranceEndMessage
  | MeetingStatusMessage
  | MeetingListMessage
  | MeetingHistoryMessage;

// ============================================================================
// Session State Types
// ============================================================================

export interface TranscriptSegment {
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker?: number; // Speaker ID from diarization (0, 1, 2, ...)
  startTime?: number; // Audio start time in seconds
  isUtteranceEnd?: boolean; // Marks end of utterance (for line breaks)
}

export interface SummaryPage {
  points: string[];
  timestamp: number;
}

export interface AnalysisResult {
  summary: string[];
  topics: string[];
  tags: string[];
  flow: number;
  heat: number;
  imagePrompt: string;
}

export interface SessionState {
  id: string;
  status: SessionStatus;
  startedAt: number;
  transcript: TranscriptSegment[];
  analyses: AnalysisResult[];
  images: Array<{
    base64: string;
    prompt: string;
    timestamp: number;
  }>;
  cameraFrames: CameraFrame[];
  lastAnalysisAt: number;
  wordsSinceLastAnalysis: number;
}
