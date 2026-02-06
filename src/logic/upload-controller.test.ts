/**
 * Upload controller tests.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/logic/upload-controller.ts
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createUploadController } from "./upload-controller";
import { createMockOPFSStorageAdapter } from "../adapters/opfs-storage";
import type { OPFSStorageAdapter } from "../adapters/opfs-storage";
import type { UploadState } from "./upload-controller";

// ============================================================================
// Test Helpers
// ============================================================================

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
  const onComplete = mock((_sessionId: string) => {});
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

async function setupWithAudioFile(storage: OPFSStorageAdapter, sessionId: string): Promise<void> {
  const writer = await storage.createAudioFile(sessionId);
  await writer.write(new Uint8Array([1, 2, 3, 4]).buffer);
  await writer.close();
}

// ============================================================================
// Tests
// ============================================================================

describe("UploadController", () => {
  describe("initial state", () => {
    test("starts with idle state", () => {
      const { controller } = createTestSetup();
      const state = controller.getState();

      expect(state.isUploading).toBe(false);
      expect(state.progress).toBe(0);
      expect(state.error).toBeNull();
      expect(state.lastUploadedSessionId).toBeNull();
    });
  });

  describe("upload", () => {
    test("uploads file and transitions through states", async () => {
      const { controller, storage, onComplete, fetchFn } = createTestSetup();
      await setupWithAudioFile(storage, "session-1");

      await controller.upload("session-1", "meeting-1");

      expect(controller.getState().isUploading).toBe(false);
      expect(controller.getState().progress).toBe(100);
      expect(controller.getState().lastUploadedSessionId).toBe("session-1");
      expect(controller.getState().error).toBeNull();
      expect(onComplete).toHaveBeenCalledWith("session-1");
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    test("sends correct request", async () => {
      let capturedRequest: Request | null = null;
      const customFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        capturedRequest = new Request(input, init);
        return new Response(JSON.stringify({ id: 1, url: "/audio/1" }));
      });

      const { controller, storage } = createTestSetup({
        fetchFn: customFetch as unknown as typeof fetch,
      });
      await setupWithAudioFile(storage, "session-1");

      await controller.upload("session-1", "meeting-1");

      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.url).toBe("http://localhost:3000/api/meetings/meeting-1/audio");
      expect(capturedRequest!.method).toBe("POST");
      expect(capturedRequest!.headers.get("content-type")).toBe("audio/webm");
      expect(capturedRequest!.headers.get("x-session-id")).toBe("session-1");
    });

    test("sets error when file not found in OPFS", async () => {
      const { controller, onError } = createTestSetup();

      await controller.upload("non-existent", "meeting-1");

      expect(controller.getState().isUploading).toBe(false);
      expect(controller.getState().error).toBe("Audio file not found");
      expect(onError).toHaveBeenCalled();
    });

    test("sets error on fetch failure", async () => {
      const failingFetch = mock(async () => {
        throw new Error("Network error");
      });

      const { controller, storage, onError } = createTestSetup({
        fetchFn: failingFetch as unknown as typeof fetch,
      });
      await setupWithAudioFile(storage, "session-1");

      await controller.upload("session-1", "meeting-1");

      expect(controller.getState().isUploading).toBe(false);
      expect(controller.getState().error).toBe("Network error");
      expect(onError).toHaveBeenCalled();
    });

    test("sets error on non-ok response", async () => {
      const errorFetch = mock(async () => new Response("Server error", { status: 500 }));

      const { controller, storage, onError } = createTestSetup({
        fetchFn: errorFetch as unknown as typeof fetch,
      });
      await setupWithAudioFile(storage, "session-1");

      await controller.upload("session-1", "meeting-1");

      expect(controller.getState().isUploading).toBe(false);
      expect(controller.getState().error).toContain("Upload failed");
      expect(onError).toHaveBeenCalled();
    });

    test("deletes local file after successful upload", async () => {
      const { controller, storage } = createTestSetup();
      await setupWithAudioFile(storage, "session-1");

      await controller.upload("session-1", "meeting-1");

      const file = await storage.getAudioFile("session-1");
      expect(file).toBeNull();
    });

    test("does not upload while already uploading", async () => {
      const slowFetch = mock(
        async () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(new Response(JSON.stringify({ id: 1 }))), 100),
          ),
      );

      const { controller, storage } = createTestSetup({
        fetchFn: slowFetch as unknown as typeof fetch,
      });
      await setupWithAudioFile(storage, "session-1");
      await setupWithAudioFile(storage, "session-2");

      // Start first upload (don't await)
      const upload1 = controller.upload("session-1", "meeting-1");

      // Try second upload immediately
      await controller.upload("session-2", "meeting-1");

      await upload1;

      // Only one fetch call should have been made
      expect(slowFetch).toHaveBeenCalledTimes(1);
    });

    test("uses xhrFactory when provided and reports incremental progress", async () => {
      class MockXhr {
        method: string | null = null;
        url: string | null = null;
        requestHeaders = new Map<string, string>();
        status = 0;
        statusText = "OK";
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

      const fetchSpy = mock(async () => new Response("OK"));
      const xhrInstances: MockXhr[] = [];
      const xhrFactory = () => {
        const xhr = new MockXhr();
        xhrInstances.push(xhr);
        return xhr as unknown as XMLHttpRequest;
      };

      const { controller, storage, states } = createTestSetup({
        fetchFn: fetchSpy as unknown as typeof fetch,
        xhrFactory,
      });
      await setupWithAudioFile(storage, "session-1");

      await controller.upload("session-1", "meeting-1");

      expect(fetchSpy).toHaveBeenCalledTimes(0);
      expect(xhrInstances.length).toBe(1);
      expect(xhrInstances[0]!.method).toBe("POST");
      expect(xhrInstances[0]!.url).toBe("http://localhost:3000/api/meetings/meeting-1/audio");
      expect(xhrInstances[0]!.requestHeaders.get("Content-Type")).toBe("audio/webm");
      expect(xhrInstances[0]!.requestHeaders.get("X-Session-Id")).toBe("session-1");

      expect(states.some((s) => s.progress > 0 && s.progress < 95)).toBe(true);
      expect(controller.getState().progress).toBe(100);
    });
  });

  describe("cancel", () => {
    test("cancels an in-flight upload", async () => {
      let resolveFetch: (() => void) | null = null;
      const abortedFetch = mock(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((resolve, reject) => {
          // Check if already aborted
          if (signal?.aborted) {
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }
          resolveFetch = () => resolve(new Response(JSON.stringify({ id: 1 })));
          signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });

      const { controller, storage } = createTestSetup({
        fetchFn: abortedFetch as unknown as typeof fetch,
      });
      await setupWithAudioFile(storage, "session-1");

      const uploadPromise = controller.upload("session-1", "meeting-1");

      // Wait for fetch to be called
      await new Promise((r) => setTimeout(r, 10));

      controller.cancel();

      await uploadPromise;

      expect(controller.getState().isUploading).toBe(false);
      // File should NOT be deleted when cancelled
      const file = await storage.getAudioFile("session-1");
      expect(file).not.toBeNull();
    });

    test("cancels an in-flight xhr upload", async () => {
      class MockXhr {
        status = 0;
        statusText = "OK";
        upload: { onprogress: ((event: any) => void) | null } = { onprogress: null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        private aborted = false;

        open(_method: string, _url: string): void {}
        setRequestHeader(_name: string, _value: string): void {}

        send(_body: any): void {
          // Keep request in-flight until aborted
          setTimeout(() => {
            if (this.aborted) return;
            this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 });
          }, 0);
        }

        abort(): void {
          if (this.aborted) return;
          this.aborted = true;
          this.onabort?.();
        }
      }

      const { controller, storage } = createTestSetup({
        xhrFactory: () => new MockXhr() as unknown as XMLHttpRequest,
      });
      await setupWithAudioFile(storage, "session-1");

      const uploadPromise = controller.upload("session-1", "meeting-1");

      await new Promise((r) => setTimeout(r, 10));
      controller.cancel();

      await uploadPromise;

      expect(controller.getState().isUploading).toBe(false);
      const file = await storage.getAudioFile("session-1");
      expect(file).not.toBeNull();
    });
  });

  describe("dispose", () => {
    test("prevents further operations", async () => {
      const { controller, storage, onStateChange } = createTestSetup();
      await setupWithAudioFile(storage, "session-1");

      controller.dispose();

      const callCount = onStateChange.mock.calls.length;
      await controller.upload("session-1", "meeting-1");

      expect(onStateChange.mock.calls.length).toBe(callCount);
    });
  });
});
