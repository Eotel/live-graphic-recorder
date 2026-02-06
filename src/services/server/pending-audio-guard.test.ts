import { describe, test, expect } from "bun:test";
import { canBufferPendingAudio, type PendingAudioLimits } from "./pending-audio-guard";

const limits: PendingAudioLimits = {
  maxPendingAudioChunks: 100,
  maxPendingAudioChunkBytes: 256 * 1024,
  maxPendingAudioTotalBytes: 4 * 1024 * 1024,
};

describe("canBufferPendingAudio", () => {
  test("allows buffering when all limits are within range", () => {
    const result = canBufferPendingAudio({
      incomingBytes: 32 * 1024,
      pendingChunks: 5,
      pendingBytes: 512 * 1024,
      limits,
    });

    expect(result).toEqual({ canBuffer: true });
  });

  test("rejects when pending chunk count limit is reached", () => {
    const result = canBufferPendingAudio({
      incomingBytes: 32 * 1024,
      pendingChunks: limits.maxPendingAudioChunks,
      pendingBytes: 512 * 1024,
      limits,
    });

    expect(result).toEqual({ canBuffer: false, reason: "chunk-count-limit" });
  });

  test("rejects when incoming chunk exceeds chunk byte limit", () => {
    const result = canBufferPendingAudio({
      incomingBytes: limits.maxPendingAudioChunkBytes + 1,
      pendingChunks: 1,
      pendingBytes: 0,
      limits,
    });

    expect(result).toEqual({ canBuffer: false, reason: "chunk-size-limit" });
  });

  test("rejects when incoming chunk exceeds total pending byte limit", () => {
    const result = canBufferPendingAudio({
      incomingBytes: 64 * 1024,
      pendingChunks: 10,
      pendingBytes: limits.maxPendingAudioTotalBytes - 32 * 1024,
      limits,
    });

    expect(result).toEqual({ canBuffer: false, reason: "total-size-limit" });
  });

  test("allows incoming chunk at exact chunk byte limit", () => {
    const result = canBufferPendingAudio({
      incomingBytes: limits.maxPendingAudioChunkBytes,
      pendingChunks: 10,
      pendingBytes: 0,
      limits,
    });

    expect(result).toEqual({ canBuffer: true });
  });

  test("allows incoming chunk when total pending bytes reaches exact limit", () => {
    const result = canBufferPendingAudio({
      incomingBytes: 32 * 1024,
      pendingChunks: 10,
      pendingBytes: limits.maxPendingAudioTotalBytes - 32 * 1024,
      limits,
    });

    expect(result).toEqual({ canBuffer: true });
  });
});
