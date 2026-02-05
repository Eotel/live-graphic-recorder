/**
 * Browser API adapters for dependency injection and testability.
 *
 * Design doc: plans/view-logic-separation-plan.md
 */

// Types
export type {
  MediaDevicesAdapter,
  MediaRecorderAdapter,
  MediaRecorderInstance,
  MediaRecorderOptions,
  WebSocketAdapter,
  WebSocketInstance,
  StreamUtils,
} from "./types";

export { WebSocketReadyState } from "./types";

// MediaDevices
export { createMediaDevicesAdapter, createMockMediaDevicesAdapter } from "./media-devices";

// MediaRecorder
export { createMediaRecorderAdapter } from "./media-recorder";

// WebSocket
export {
  createWebSocketAdapter,
  createMockWebSocketAdapter,
  createMockWebSocketInstance,
  createControllableMockWebSocket,
} from "./websocket";

// Stream Utils
export { createStreamUtils, createMockStreamUtils, stopTracks } from "./stream-utils";
