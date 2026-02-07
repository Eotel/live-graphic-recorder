import type { AnalysisService } from "@/services/server/analysis";
import type { DeepgramService } from "@/services/server/deepgram";
import type { ImageModelPreset, MeetingMode, SessionState } from "@/types/messages";

export interface WSContext {
  userId: string;
  sessionId: string;
  meetingId: string | null;
  meetingMode: MeetingMode | null;
  session: SessionState;
  deepgram: DeepgramService | null;
  analysis: AnalysisService | null;
  checkInterval: ReturnType<typeof setInterval> | null;
  imageModelPreset: ImageModelPreset;
  // Buffer for audio data received before Deepgram is ready
  pendingAudio: (ArrayBuffer | Buffer)[];
  pendingAudioBytes: number;
  // UtteranceEnd can arrive before the final transcript is persisted; buffer and apply later.
  pendingUtteranceEndCount: number;
}

export interface AuthUser {
  userId: string;
}

export interface AuthRequestBody {
  email?: unknown;
  password?: unknown;
}
