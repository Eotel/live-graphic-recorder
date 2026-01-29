/**
 * Client hooks barrel export.
 */

// Legacy hooks (still functional, delegates to new controllers internally)
export * from "./useMediaStream";
export * from "./useWebSocket";
export * from "./useRecording";
export * from "./useAutoScroll";
export * from "./useElapsedTime";

// New controller-based hooks
export * from "./useMediaStreamController";
export * from "./useMeetingController";
export * from "./useTranscriptStore";
export * from "./useSessionStore";
export * from "./useMeetingSession";
