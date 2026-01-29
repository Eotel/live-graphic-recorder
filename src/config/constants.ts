/**
 * Configuration constants for the Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 */

// ============================================================================
// Analysis Trigger Settings
// ============================================================================

/** Minimum time between analyses in milliseconds (3 minutes) */
export const ANALYSIS_INTERVAL_MS = 3 * 60 * 1000;

/** Minimum word count to trigger analysis */
export const ANALYSIS_WORD_THRESHOLD = 500;

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
} as const;

// ============================================================================
// OpenAI Settings
// ============================================================================

export const OPENAI_CONFIG = {
  model: "gpt-4o-mini",
  maxTokens: 1024,
} as const;

// ============================================================================
// Gemini Settings
// ============================================================================

export const GEMINI_CONFIG = {
  model: "gemini-2.5-flash-image",
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
