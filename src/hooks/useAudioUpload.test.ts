/**
 * useAudioUpload hook tests.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/hooks/useAudioUpload.ts
 */

import { describe, test, expect, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useAudioUpload } from "./useAudioUpload";
import { createMockOPFSStorageAdapter } from "../adapters/opfs-storage";
import type { PendingUploadRecording } from "../logic/upload-controller";

function buildRecording(
  recordingId: string,
  sessionId: string,
  createdAt: number,
): PendingUploadRecording {
  return {
    recordingId,
    sessionId,
    totalChunks: 1,
    createdAt,
  };
}

describe("useAudioUpload", () => {
  test("initializes with idle state", () => {
    const { result } = renderHook(() => useAudioUpload());

    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.lastUploadedAudioUrl).toBeNull();
    expect(result.current.uploadedCount).toBe(0);
    expect(result.current.totalCount).toBe(0);
    expect(typeof result.current.upload).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
  });

  test("upload with recordings transitions through states", async () => {
    const storage = createMockOPFSStorageAdapter();
    const writer = await storage.createAudioFile("recording-1");
    await writer.write(new Uint8Array([1, 2, 3]).buffer);
    await writer.close();

    const mockFetch = mock(async () => new Response(JSON.stringify({ id: 1, url: "/audio/1" })));
    const onComplete = mock(() => {});

    const { result } = renderHook(() =>
      useAudioUpload({ storage, fetchFn: mockFetch as unknown as typeof fetch, onComplete }),
    );

    await act(async () => {
      await result.current.upload([buildRecording("recording-1", "session-1", 1)], "meeting-1");
    });

    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(100);
    expect(result.current.error).toBeNull();
    expect(result.current.lastUploadedAudioUrl).toBe("/audio/1");
    expect(result.current.uploadedCount).toBe(1);
    expect(result.current.totalCount).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("recording-1");
  });

  test("upload without recording file sets error", async () => {
    const storage = createMockOPFSStorageAdapter();
    const mockFetch = mock(async () => new Response("ok"));
    const onComplete = mock(() => {});

    const { result } = renderHook(() =>
      useAudioUpload({ storage, fetchFn: mockFetch as unknown as typeof fetch, onComplete }),
    );

    await act(async () => {
      await result.current.upload([buildRecording("missing", "session-1", 1)], "meeting-1");
    });

    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBe("Audio file not found");
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("cleanup disposes controller on unmount", () => {
    const { unmount } = renderHook(() => useAudioUpload());
    unmount();
  });
});
