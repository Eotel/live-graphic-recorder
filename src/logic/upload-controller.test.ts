/**
 * Upload controller tests.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/logic/upload-controller.ts
 */

import { describe, test, expect, mock } from "bun:test";
import { createUploadController } from "./upload-controller";
import { createMockOPFSStorageAdapter } from "../adapters/opfs-storage";
import type { OPFSStorageAdapter } from "../adapters/opfs-storage";
import type { PendingUploadRecording, UploadState } from "./upload-controller";

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

async function setupWithAudioFile(storage: OPFSStorageAdapter, recordingId: string): Promise<void> {
  const writer = await storage.createAudioFile(recordingId);
  await writer.write(new Uint8Array([1, 2, 3, 4]).buffer);
  await writer.close();
}

function createTestSetup(overrides?: {
  storage?: OPFSStorageAdapter;
  fetchFn?: typeof fetch;
  xhrFactory?: () => XMLHttpRequest;
}) {
  const storage = overrides?.storage ?? createMockOPFSStorageAdapter();
  const states: UploadState[] = [];
  const onStateChange = mock((state: UploadState) => {
    states.push(state);
  });
  const onComplete = mock((_recordingId: string) => {});
  const onError = mock((_error: Error) => {});

  const fetchFn =
    overrides?.fetchFn ??
    (mock(
      async () =>
        new Response(JSON.stringify({ id: 1, url: "/api/meetings/m1/audio/1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch);

  const controller = createUploadController(
    { storage, baseUrl: "http://localhost:3000", fetchFn, xhrFactory: overrides?.xhrFactory },
    { onStateChange, onComplete, onError },
  );

  return { controller, storage, states, onStateChange, onComplete, onError, fetchFn };
}

describe("UploadController", () => {
  test("starts with idle state", () => {
    const { controller } = createTestSetup();
    const state = controller.getState();

    expect(state.isUploading).toBe(false);
    expect(state.progress).toBe(0);
    expect(state.error).toBeNull();
    expect(state.lastUploadedSessionId).toBeNull();
    expect(state.lastUploadedAudioUrl).toBeNull();
    expect(state.uploadedCount).toBe(0);
    expect(state.totalCount).toBe(0);
  });

  test("uploads all recordings in createdAt order and updates counters", async () => {
    const { controller, storage, onComplete, fetchFn } = createTestSetup();
    await setupWithAudioFile(storage, "r-late");
    await setupWithAudioFile(storage, "r-early");

    const recordings = [
      buildRecording("r-late", "session-2", 200),
      buildRecording("r-early", "session-1", 100),
    ];

    await controller.upload(recordings, "meeting-1");

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenNthCalledWith(1, "r-early");
    expect(onComplete).toHaveBeenNthCalledWith(2, "r-late");

    const state = controller.getState();
    expect(state.isUploading).toBe(false);
    expect(state.progress).toBe(100);
    expect(state.error).toBeNull();
    expect(state.uploadedCount).toBe(2);
    expect(state.totalCount).toBe(2);
    expect(state.lastUploadedSessionId).toBe("session-2");
    expect(state.lastUploadedAudioUrl).toBe("/api/meetings/m1/audio/1");
  });

  test("sends each recording with matching X-Session-Id", async () => {
    const capturedRequests: Request[] = [];
    const customFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedRequests.push(new Request(input, init));
      return new Response(JSON.stringify({ id: 1, url: "/audio/1" }));
    });

    const { controller, storage } = createTestSetup({
      fetchFn: customFetch as unknown as typeof fetch,
    });

    await setupWithAudioFile(storage, "r-1");
    await setupWithAudioFile(storage, "r-2");

    await controller.upload(
      [buildRecording("r-1", "session-1", 1), buildRecording("r-2", "session-2", 2)],
      "meeting-1",
    );

    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests[0]!.url).toBe("http://localhost:3000/api/meetings/meeting-1/audio");
    expect(capturedRequests[0]!.headers.get("x-session-id")).toBe("session-1");
    expect(capturedRequests[1]!.headers.get("x-session-id")).toBe("session-2");
  });

  test("sets error when a recording file is missing", async () => {
    const { controller, onError } = createTestSetup();

    await controller.upload([buildRecording("missing", "session-1", 1)], "meeting-1");

    expect(controller.getState().isUploading).toBe(false);
    expect(controller.getState().error).toBe("Audio file not found");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  test("keeps remaining recordings when upload fails mid-batch", async () => {
    let callCount = 0;
    const flakyFetch = mock(async () => {
      callCount += 1;
      if (callCount === 2) {
        return new Response("Server error", { status: 500, statusText: "Internal Server Error" });
      }
      return new Response(JSON.stringify({ id: callCount, url: `/audio/${callCount}` }), {
        status: 200,
      });
    });

    const { controller, storage, onComplete } = createTestSetup({
      fetchFn: flakyFetch as unknown as typeof fetch,
    });
    await setupWithAudioFile(storage, "r-1");
    await setupWithAudioFile(storage, "r-2");

    await controller.upload(
      [buildRecording("r-1", "session-1", 1), buildRecording("r-2", "session-1", 2)],
      "meeting-1",
    );

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("r-1");
    expect(controller.getState().error).toContain("Upload failed");

    expect(await storage.getAudioFile("r-1")).toBeNull();
    expect(await storage.getAudioFile("r-2")).not.toBeNull();
  });

  test("does not start second upload while one is in progress", async () => {
    const slowFetch = mock(
      async () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify({ id: 1, url: "/audio/1" }))), 100),
        ),
    );

    const { controller, storage } = createTestSetup({
      fetchFn: slowFetch as unknown as typeof fetch,
    });
    await setupWithAudioFile(storage, "r-1");
    await setupWithAudioFile(storage, "r-2");

    const upload1 = controller.upload([buildRecording("r-1", "session-1", 1)], "meeting-1");
    await controller.upload([buildRecording("r-2", "session-1", 2)], "meeting-1");
    await upload1;

    expect(slowFetch).toHaveBeenCalledTimes(1);
    expect(await storage.getAudioFile("r-2")).not.toBeNull();
  });

  test("cancels an in-flight upload and keeps file", async () => {
    const abortedFetch = mock(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("The operation was aborted.", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const { controller, storage } = createTestSetup({
      fetchFn: abortedFetch as unknown as typeof fetch,
    });
    await setupWithAudioFile(storage, "r-1");

    const uploadPromise = controller.upload([buildRecording("r-1", "session-1", 1)], "meeting-1");
    await new Promise((r) => setTimeout(r, 10));
    controller.cancel();
    await uploadPromise;

    expect(controller.getState().isUploading).toBe(false);
    expect(await storage.getAudioFile("r-1")).not.toBeNull();
  });

  test("uses xhrFactory and reports incremental progress", async () => {
    class MockXhr {
      method: string | null = null;
      url: string | null = null;
      requestHeaders = new Map<string, string>();
      status = 0;
      statusText = "OK";
      responseText = JSON.stringify({ id: 1, url: "/audio/1" });
      withCredentials = false;
      upload: { onprogress: ((event: any) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      private aborted = false;

      open(method: string, url: string): void {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(name: string, value: string): void {
        this.requestHeaders.set(name, value);
      }

      send(_body: any): void {
        setTimeout(() => {
          if (this.aborted) return;
          this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 });
          this.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 });
          this.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 4 });
          this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 4 });
          this.status = 200;
          this.onload?.();
        }, 0);
      }

      abort(): void {
        if (this.aborted) return;
        this.aborted = true;
        this.onabort?.();
      }
    }

    const xhrInstances: MockXhr[] = [];
    const xhrFactory = () => {
      const xhr = new MockXhr();
      xhrInstances.push(xhr);
      return xhr as unknown as XMLHttpRequest;
    };

    const { controller, storage, states } = createTestSetup({ xhrFactory });
    await setupWithAudioFile(storage, "r-1");

    await controller.upload([buildRecording("r-1", "session-1", 1)], "meeting-1");

    expect(xhrInstances).toHaveLength(1);
    expect(xhrInstances[0]!.method).toBe("POST");
    expect(xhrInstances[0]!.url).toBe("http://localhost:3000/api/meetings/meeting-1/audio");
    expect(xhrInstances[0]!.withCredentials).toBe(true);
    expect(xhrInstances[0]!.requestHeaders.get("Content-Type")).toBe("audio/webm");
    expect(xhrInstances[0]!.requestHeaders.get("X-Session-Id")).toBe("session-1");
    expect(states.some((s) => s.progress > 0 && s.progress < 100)).toBe(true);
    expect(controller.getState().progress).toBe(100);
  });
});
