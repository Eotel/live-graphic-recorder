/**
 * Tests for configuration constants.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/config/constants.ts
 */

import { describe, test, expect } from "bun:test";
import { DEEPGRAM_CONFIG, AUDIO_CONFIG, WS_CONFIG, UPLOAD_CONFIG } from "./constants";

describe("DEEPGRAM_CONFIG", () => {
  test("should have required model setting", () => {
    expect(DEEPGRAM_CONFIG.model).toBeDefined();
    expect(typeof DEEPGRAM_CONFIG.model).toBe("string");
  });

  test("should have language setting", () => {
    expect(DEEPGRAM_CONFIG.language).toBeDefined();
    expect(typeof DEEPGRAM_CONFIG.language).toBe("string");
  });

  test("should have interim_results enabled for real-time feedback", () => {
    expect(DEEPGRAM_CONFIG.interim_results).toBe(true);
  });

  test("should have vad_events enabled for speech detection", () => {
    expect(DEEPGRAM_CONFIG.vad_events).toBe(true);
  });

  test("should NOT specify encoding to allow Deepgram auto-detect WebM container", () => {
    // When streaming audio/webm;codecs=opus from browser MediaRecorder,
    // Deepgram should auto-detect the container format.
    // Specifying "opus" encoding causes issues because browser sends WebM container, not raw Opus.
    expect(DEEPGRAM_CONFIG).not.toHaveProperty("encoding");
  });
});

describe("AUDIO_CONFIG", () => {
  test("should have mimeType set to audio/webm;codecs=opus", () => {
    expect(AUDIO_CONFIG.mimeType).toBe("audio/webm;codecs=opus");
  });

  test("should have sampleRate set for speech recognition", () => {
    expect(AUDIO_CONFIG.sampleRate).toBe(16000);
  });

  test("should have single channel for mono audio", () => {
    expect(AUDIO_CONFIG.channelCount).toBe(1);
  });
});

describe("WS_CONFIG", () => {
  test("should keep pending audio chunk count limit", () => {
    expect(WS_CONFIG.maxPendingAudioChunks).toBe(100);
  });

  test("should define pending audio chunk size limit", () => {
    expect(WS_CONFIG.maxPendingAudioChunkBytes).toBe(256 * 1024);
  });

  test("should define pending audio total size limit", () => {
    expect(WS_CONFIG.maxPendingAudioTotalBytes).toBe(4 * 1024 * 1024);
  });
});

describe("UPLOAD_CONFIG", () => {
  test("should define maximum audio upload size for long meetings", () => {
    expect(UPLOAD_CONFIG.maxAudioUploadBytes).toBe(2 * 1024 * 1024 * 1024);
  });
});
