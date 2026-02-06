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

describe("useAudioUpload", () => {
  test("initializes with idle state", () => {
    const { result } = renderHook(() => useAudioUpload());

    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.upload).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
  });

  test("upload with file transitions through states", async () => {
    const storage = createMockOPFSStorageAdapter();
    const writer = await storage.createAudioFile("session-1");
    await writer.write(new Uint8Array([1, 2, 3]).buffer);
    await writer.close();

    const mockFetch = mock(async () => new Response(JSON.stringify({ id: 1, url: "/audio/1" })));

    const { result } = renderHook(() =>
      useAudioUpload({ storage, fetchFn: mockFetch as unknown as typeof fetch }),
    );

    await act(async () => {
      await result.current.upload("session-1", "meeting-1");
    });

    expect(result.current.isUploading).toBe(false);
    expect(result.current.progress).toBe(100);
    expect(result.current.error).toBeNull();
  });

  test("upload without file sets error", async () => {
    const storage = createMockOPFSStorageAdapter();
    const mockFetch = mock(async () => new Response("ok"));

    const { result } = renderHook(() =>
      useAudioUpload({ storage, fetchFn: mockFetch as unknown as typeof fetch }),
    );

    await act(async () => {
      await result.current.upload("non-existent", "meeting-1");
    });

    expect(result.current.isUploading).toBe(false);
    expect(result.current.error).toBe("Audio file not found");
  });

  test("cleanup disposes controller on unmount", async () => {
    const { result, unmount } = renderHook(() => useAudioUpload());

    unmount();
    // Should not crash
  });
});
