/**
 * Browser API adapter interfaces for dependency injection and testability.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/media-devices.ts, src/adapters/websocket.ts
 */

// ============================================================================
// MediaDevices Adapter
// ============================================================================

export interface MediaDevicesAdapter {
  /**
   * Check if getUserMedia API is available.
   */
  hasGetUserMedia(): boolean;

  /**
   * Check if getDisplayMedia API is available.
   */
  hasGetDisplayMedia(): boolean;

  /**
   * Request access to camera and/or microphone.
   */
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;

  /**
   * Request access to screen capture.
   */
  getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStream>;

  /**
   * Enumerate available media devices.
   */
  enumerateDevices(): Promise<MediaDeviceInfo[]>;

  /**
   * Add listener for device change events.
   */
  onDeviceChange(handler: () => void): () => void;
}

// ============================================================================
// MediaRecorder Adapter
// ============================================================================

export interface MediaRecorderOptions {
  mimeType?: string;
  audioBitsPerSecond?: number;
  videoBitsPerSecond?: number;
}

export interface MediaRecorderAdapter {
  /**
   * Check if a MIME type is supported.
   */
  isTypeSupported(mimeType: string): boolean;

  /**
   * Create a new MediaRecorder instance for the given stream.
   */
  create(stream: MediaStream, options: MediaRecorderOptions): MediaRecorderInstance;
}

export type RecordingState = "inactive" | "recording" | "paused";

export interface MediaRecorderInstance {
  /**
   * Current state of the recorder.
   */
  readonly state: RecordingState;

  /**
   * Start recording.
   */
  start(timeslice?: number): void;

  /**
   * Stop recording.
   */
  stop(): void;

  /**
   * Pause recording.
   */
  pause(): void;

  /**
   * Resume recording.
   */
  resume(): void;

  /**
   * Set handler for data available events.
   */
  onDataAvailable(handler: (data: Blob) => void): void;

  /**
   * Set handler for stop events.
   */
  onStop(handler: () => void): void;

  /**
   * Set handler for error events.
   */
  onError(handler: (error: Error) => void): void;
}

// ============================================================================
// WebSocket Adapter
// ============================================================================

export interface WebSocketAdapter {
  /**
   * Create a new WebSocket connection.
   */
  create(url: string): WebSocketInstance;

  /**
   * Build WebSocket URL from current location.
   */
  buildUrl(path: string): string;
}

export interface WebSocketInstance {
  /**
   * Current connection state.
   */
  readonly readyState: WebSocketReadyState;

  /**
   * Send a string message.
   */
  send(data: string | ArrayBuffer): void;

  /**
   * Close the connection.
   */
  close(code?: number, reason?: string): void;

  /**
   * Set handler for open events.
   */
  onOpen(handler: () => void): void;

  /**
   * Set handler for close events.
   */
  onClose(handler: (event: CloseEvent) => void): void;

  /**
   * Set handler for message events.
   */
  onMessage(handler: (data: string | ArrayBuffer) => void): void;

  /**
   * Set handler for error events.
   */
  onError(handler: (error: Event) => void): void;
}

export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

// ============================================================================
// Stream Utilities
// ============================================================================

export interface StreamUtils {
  /**
   * Stop all tracks in a stream.
   */
  stopTracks(stream: MediaStream | null): void;

  /**
   * Create a new MediaStream from tracks.
   */
  createStream(tracks: MediaStreamTrack[]): MediaStream;
}
