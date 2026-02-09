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
// Image Model Types
// ============================================================================

export type ImageModelPreset = "flash" | "pro";
export type MeetingMode = "record" | "view";

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
    mode?: MeetingMode;
  };
}

export interface MeetingModeSetMessage {
  type: "meeting:mode:set";
  data: {
    mode: MeetingMode;
  };
}

export interface MeetingHistoryCursor {
  transcriptTs?: number;
  analysisTs?: number;
  imageTs?: number;
  captureTs?: number;
  metaSummaryEndTs?: number;
}

export interface MeetingHistoryRequestMessage {
  type: "meeting:history:request";
  data: {
    meetingId: string;
    cursor?: MeetingHistoryCursor;
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

export interface SpeakerAliasUpdateMessage {
  type: "meeting:speaker-alias:update";
  data: {
    speaker: number;
    displayName: string;
  };
}

export interface ImageModelSetMessage {
  type: "image:model:set";
  data: {
    preset: ImageModelPreset;
  };
}

export type ClientMessage =
  | SessionStartMessage
  | SessionStopMessage
  | CameraFrameMessage
  | MeetingStartMessage
  | MeetingModeSetMessage
  | MeetingStopMessage
  | MeetingListRequestMessage
  | MeetingHistoryRequestMessage
  | MeetingUpdateMessage
  | SpeakerAliasUpdateMessage
  | ImageModelSetMessage;

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

export interface ImageModelStatusMessage {
  type: "image:model:status";
  data: {
    preset: ImageModelPreset;
    model: string;
    available: {
      flash: string;
      pro?: string;
    };
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

export type SttConnectionState = "connected" | "reconnecting" | "degraded" | "failed";

export interface SttStatusMessage {
  type: "stt:status";
  data: {
    state: SttConnectionState;
    retryAttempt?: number;
    message?: string;
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
    mode: MeetingMode;
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

export interface SpeakerAliasMessage {
  type: "meeting:speaker-alias";
  data: {
    speakerAliases: Record<string, string>;
  };
}

export interface MeetingHistoryMessage {
  type: "meeting:history";
  data: {
    transcripts: MeetingHistoryTranscripts;
    analyses: MeetingHistoryAnalyses;
    images: MeetingHistoryImages;
    captures: MeetingHistoryCaptures;
    metaSummaries: MeetingHistoryMetaSummaries;
    speakerAliases: Record<string, string>;
  };
}

export type MeetingHistoryTranscripts = Array<{
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker?: number;
  startTime?: number;
  isUtteranceEnd?: boolean;
}>;

export type MeetingHistoryAnalyses = Array<{
  summary: string[];
  topics: string[];
  tags: string[];
  flow: number;
  heat: number;
  timestamp: number;
}>;

export type MeetingHistoryImages = Array<{
  url: string;
  prompt: string;
  timestamp: number;
}>;

export type MeetingHistoryCaptures = Array<{
  url: string;
  timestamp: number;
}>;

export type MeetingHistoryMetaSummaries = Array<{
  summary: string[];
  themes: string[];
  startTime: number;
  endTime: number;
}>;

export interface MeetingHistoryDeltaMessage {
  type: "meeting:history:delta";
  data: {
    transcripts: MeetingHistoryTranscripts;
    analyses: MeetingHistoryAnalyses;
    images: MeetingHistoryImages;
    captures: MeetingHistoryCaptures;
    metaSummaries: MeetingHistoryMetaSummaries;
    speakerAliases: Record<string, string>;
  };
}

export type ServerMessage =
  | TranscriptMessage
  | AnalysisMessage
  | ImageMessage
  | SessionStatusMessage
  | ErrorMessage
  | ImageModelStatusMessage
  | GenerationStatusMessage
  | UtteranceEndMessage
  | SttStatusMessage
  | MeetingStatusMessage
  | MeetingListMessage
  | SpeakerAliasMessage
  | MeetingHistoryMessage
  | MeetingHistoryDeltaMessage;

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
