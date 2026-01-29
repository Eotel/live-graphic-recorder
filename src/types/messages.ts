/**
 * WebSocket message types for client-server communication.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/session.ts, src/hooks/useWebSocket.ts
 */

// ============================================================================
// Client → Server Messages
// ============================================================================

export interface SessionStartMessage {
  type: "session:start";
}

export interface SessionStopMessage {
  type: "session:stop";
}

export type ClientMessage = SessionStartMessage | SessionStopMessage;

// ============================================================================
// Server → Client Messages
// ============================================================================

export interface TranscriptMessage {
  type: "transcript";
  data: {
    text: string;
    isFinal: boolean;
    timestamp: number;
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

export type ServerMessage =
  | TranscriptMessage
  | AnalysisMessage
  | ImageMessage
  | SessionStatusMessage
  | ErrorMessage;

// ============================================================================
// Session State Types
// ============================================================================

export interface TranscriptSegment {
  text: string;
  timestamp: number;
  isFinal: boolean;
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
  lastAnalysisAt: number;
  wordsSinceLastAnalysis: number;
}
