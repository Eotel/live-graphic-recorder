/**
 * Logic layer exports - pure TypeScript business logic.
 *
 * Design doc: plans/view-logic-separation-plan.md
 */

// Types
export type {
  MediaStreamControllerState,
  MediaStreamControllerActions,
  MediaStreamControllerDeps,
  MediaStreamControllerEvents,
  MediaStreamController,
  TranscriptStoreState,
  TranscriptStoreActions,
  TranscriptStoreEvents,
  TranscriptStore,
  SessionStoreState,
  SessionStoreActions,
  SessionStoreEvents,
  SessionStore,
  AnalysisData,
  ImageData,
  CaptureData,
  MetaSummaryData,
  MeetingState,
  MeetingInfo,
  MeetingControllerState,
  MeetingControllerActions,
  MeetingControllerCallbacks,
  MeetingControllerEvents,
  MeetingController,
  StateEmitter,
} from "./types";

// Media Stream Controller
export { createMediaStreamController, formatMediaError } from "./media-stream-controller";

// Transcript Store
export { createTranscriptStore } from "./transcript-store";

// Session Store
export { createSessionStore } from "./session-store";

// Meeting Controller
export { createMeetingController } from "./meeting-controller";
export type { MeetingControllerDeps } from "./meeting-controller";
