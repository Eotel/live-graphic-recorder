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
// Hierarchical Context Settings
// ============================================================================

/** Interval between meta-summary generations in milliseconds (30 minutes) */
export const META_SUMMARY_INTERVAL_MS = 30 * 60 * 1000;

/** Minimum number of sessions before triggering meta-summary generation */
export const META_SUMMARY_SESSION_THRESHOLD = 6;

/** Number of recent analyses to include in short-term context (Tier 1) */
export const RECENT_ANALYSES_COUNT = 3;

/** Number of recent images to include in short-term context (Tier 1) */
export const RECENT_IMAGES_COUNT = 3;

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
  diarize: true,
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
  aspectRatio: "16:9",
} as const;

// ============================================================================
// WebSocket Settings
// ============================================================================

export const WS_CONFIG = {
  path: "/ws/recording",
  pingInterval: 30000,
  /** Maximum pending audio chunks before Deepgram connection (prevents DoS) */
  maxPendingAudioChunks: 100,
  /** Maximum size per pending audio chunk before Deepgram connection */
  maxPendingAudioChunkBytes: 256 * 1024, // 256KB
  /** Maximum total bytes for all pending audio chunks before Deepgram connection */
  maxPendingAudioTotalBytes: 4 * 1024 * 1024, // 4MB
  reconnect: {
    connectTimeoutMs: 4000,
    initialBackoffMs: 250,
    maxBackoffMs: 10000,
    jitterRatio: 0.2,
  },
} as const;

// ============================================================================
// Audio Settings
// ============================================================================

export const AUDIO_CONFIG = {
  sampleRate: 16000,
  channelCount: 1,
  mimeType: "audio/webm;codecs=opus",
  timesliceMs: 250,
} as const;

// ============================================================================
// Upload Settings
// ============================================================================

export const UPLOAD_CONFIG = {
  /** Maximum audio upload size in bytes (2GB) */
  maxAudioUploadBytes: 2 * 1024 * 1024 * 1024,
} as const;

// ============================================================================
// Database Settings
// ============================================================================

export const DB_CONFIG = {
  defaultPath: "./data/live-graphic-recorder.db",
  defaultMediaPath: "./data/media",
} as const;
