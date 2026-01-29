/**
 * Logic layer type definitions.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/types.ts, src/types/messages.ts
 */

import type {
  MediaSourceType,
  TranscriptSegment,
  AnalysisMessage,
  ImageMessage,
} from "../types/messages";
import type { MediaDevicesAdapter, StreamUtils } from "../adapters/types";

// ============================================================================
// Media Stream Controller Types
// ============================================================================

export interface MediaStreamControllerState {
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  videoStream: MediaStream | null;
  error: string | null;
  isLoading: boolean;
  isSwitching: boolean;
  hasPermission: boolean;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string | null;
  selectedVideoDeviceId: string | null;
  sourceType: MediaSourceType;
}

export interface MediaStreamControllerActions {
  requestPermission(): Promise<boolean>;
  stopStream(): void;
  setAudioDevice(deviceId: string): Promise<void>;
  setVideoDevice(deviceId: string): Promise<void>;
  switchSourceType(type: MediaSourceType): void;
  switchVideoSource(type: MediaSourceType): Promise<boolean>;
  dispose(): void;
}

export interface MediaStreamControllerDeps {
  mediaDevices: MediaDevicesAdapter;
  streamUtils: StreamUtils;
}

export interface MediaStreamControllerEvents {
  onStateChange: (state: MediaStreamControllerState) => void;
  onScreenShareEnded?: () => void;
}

export type MediaStreamController = MediaStreamControllerState & MediaStreamControllerActions;

// ============================================================================
// Transcript Store Types
// ============================================================================

export interface TranscriptStoreState {
  segments: TranscriptSegment[];
  interimText: string;
  interimSpeaker: number | undefined;
  interimStartTime: number | undefined;
}

export interface TranscriptStoreActions {
  addTranscript(data: {
    text: string;
    isFinal: boolean;
    timestamp: number;
    speaker?: number;
    startTime?: number;
  }): void;
  markUtteranceEnd(timestamp: number): void;
  loadHistory(transcripts: TranscriptSegment[]): void;
  clear(): void;
}

export interface TranscriptStoreEvents {
  onStateChange: (state: TranscriptStoreState) => void;
}

export type TranscriptStore = TranscriptStoreState & TranscriptStoreActions;

// ============================================================================
// Session Store Types
// ============================================================================

export interface AnalysisData {
  summary: string[];
  topics: string[];
  tags: string[];
  flow: number;
  heat: number;
  timestamp?: number;
}

export interface ImageData {
  base64?: string;
  url?: string;
  prompt: string;
  timestamp: number;
}

export interface CaptureData {
  url: string;
  timestamp: number;
}

export interface MetaSummaryData {
  summary: string[];
  themes: string[];
  startTime: number;
  endTime: number;
}

export interface SessionStoreState {
  analyses: AnalysisData[];
  images: ImageData[];
  captures: CaptureData[];
  metaSummaries: MetaSummaryData[];
}

export interface SessionStoreActions {
  addAnalysis(data: AnalysisData): void;
  addImage(data: ImageData): void;
  addCapture(data: CaptureData): void;
  loadHistory(data: {
    analyses?: AnalysisData[];
    images?: ImageData[];
    captures?: CaptureData[];
    metaSummaries?: MetaSummaryData[];
  }): void;
  clear(): void;
}

export interface SessionStoreEvents {
  onStateChange: (state: SessionStoreState) => void;
}

export type SessionStore = SessionStoreState & SessionStoreActions;

// ============================================================================
// Meeting Controller Types
// ============================================================================

export interface MeetingState {
  meetingId: string | null;
  meetingTitle: string | null;
  sessionId: string | null;
  meetingList: MeetingInfo[];
}

export interface MeetingInfo {
  id: string;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
}

export interface MeetingControllerState {
  isConnected: boolean;
  sessionStatus: "idle" | "recording" | "processing" | "error";
  generationPhase: "idle" | "analyzing" | "generating" | "retrying";
  error: string | null;
  meeting: MeetingState;
}

export interface MeetingControllerActions {
  connect(): void;
  disconnect(): void;
  sendAudio(data: ArrayBuffer): void;
  startMeeting(title?: string, meetingId?: string): void;
  stopMeeting(): void;
  requestMeetingList(): void;
  updateMeetingTitle(title: string): void;
}

export interface MeetingControllerCallbacks {
  onTranscript?: (data: {
    text: string;
    isFinal: boolean;
    timestamp: number;
    speaker?: number;
    startTime?: number;
  }) => void;
  onAnalysis?: (data: AnalysisData) => void;
  onImage?: (data: ImageData) => void;
  onError?: (message: string) => void;
  onUtteranceEnd?: (timestamp: number) => void;
  onMeetingStatus?: (data: { meetingId: string; title?: string; sessionId: string }) => void;
  onMeetingList?: (meetings: MeetingInfo[]) => void;
  onMeetingHistory?: (data: {
    transcripts: TranscriptSegment[];
    analyses: AnalysisData[];
    images: ImageData[];
    captures: CaptureData[];
    metaSummaries: MetaSummaryData[];
  }) => void;
}

export interface MeetingControllerEvents {
  onStateChange: (state: MeetingControllerState) => void;
}

export type MeetingController = MeetingControllerState & MeetingControllerActions;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Generic event emitter for state changes.
 */
export interface StateEmitter<T> {
  getState(): T;
  subscribe(listener: (state: T) => void): () => void;
  emit(): void;
}
