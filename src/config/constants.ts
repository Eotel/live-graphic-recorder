/**
 * Configuration constants for the Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 */

// ============================================================================
// Analysis Trigger Settings
// ============================================================================

/** Minimum time between analyses in milliseconds (5 minutes) */
export const ANALYSIS_INTERVAL_MS = 5 * 60 * 1000;

/** Minimum word count to trigger analysis */
export const ANALYSIS_WORD_THRESHOLD = 500;

/** Interval for capturing camera frames in milliseconds (60 seconds) */
export const CAMERA_CAPTURE_INTERVAL_MS = 60 * 1000;

/** Maximum number of camera frames to keep in buffer */
export const CAMERA_FRAME_BUFFER_SIZE = 5;

// ============================================================================
// Deepgram Settings
// ============================================================================

export const DEEPGRAM_CONFIG = {
  model: "nova-3",
  language: "ja",
  punctuate: true,
  interim_results: true,
  utterance_end_ms: 1000,
  vad_events: true,
  smart_format: true,
  // Note: Do not specify encoding when sending WebM container from browser
  // Deepgram will auto-detect the format
} as const;

// ============================================================================
// OpenAI Settings
// ============================================================================

export const OPENAI_CONFIG = {
  model: "gpt-5.2",
  maxTokens: 1024,
} as const;

// ============================================================================
// Gemini Settings
// ============================================================================

export const GEMINI_CONFIG = {
  model: "gemini-2.5-flash-image",
  maxRetries: 3,
  initialBackoffMs: 30000,
} as const;

// ============================================================================
// WebSocket Settings
// ============================================================================

export const WS_CONFIG = {
  path: "/ws/recording",
  pingInterval: 30000,
} as const;

// ============================================================================
// Audio Settings
// ============================================================================

export const AUDIO_CONFIG = {
  sampleRate: 16000,
  channelCount: 1,
  mimeType: "audio/webm;codecs=opus",
} as const;
