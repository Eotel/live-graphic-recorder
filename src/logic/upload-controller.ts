/**
 * Upload controller - manages audio file upload to server.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/adapters/opfs-storage.ts, src/hooks/useAudioUpload.ts
 */

import type { OPFSStorageAdapter } from "../adapters/opfs-storage";

export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  lastUploadedSessionId: string | null;
}

export interface UploadDeps {
  storage: OPFSStorageAdapter;
  baseUrl: string;
  fetchFn?: typeof fetch;
  xhrFactory?: () => XMLHttpRequest;
}

export interface UploadCallbacks {
  onStateChange: (state: UploadState) => void;
  onComplete: (sessionId: string) => void;
  onError: (error: Error) => void;
}

export function createUploadController(
  deps: UploadDeps,
  callbacks: UploadCallbacks,
): {
  upload(sessionId: string, meetingId: string): Promise<void>;
  cancel(): void;
  getState(): UploadState;
  dispose(): void;
} {
  const { storage, baseUrl, fetchFn = fetch, xhrFactory } = deps;

  let state: UploadState = {
    isUploading: false,
    progress: 0,
    error: null,
    lastUploadedSessionId: null,
  };

  let isDisposed = false;
  let abortController: AbortController | null = null;
  let activeXhr: XMLHttpRequest | null = null;

  function updateState(updates: Partial<UploadState>): void {
    state = { ...state, ...updates };
    if (!isDisposed) {
      callbacks.onStateChange({ ...state });
    }
  }

  async function upload(sessionId: string, meetingId: string): Promise<void> {
    if (isDisposed || state.isUploading) return;

    abortController = new AbortController();
    updateState({ isUploading: true, progress: 0, error: null });

    // Get file from OPFS
    const file = await storage.getAudioFile(sessionId);
    if (!file) {
      abortController = null;
      const error = new Error("Audio file not found");
      updateState({ isUploading: false, error: error.message });
      callbacks.onError(error);
      return;
    }

    try {
      const url = `${baseUrl}/api/meetings/${meetingId}/audio`;
      if (xhrFactory) {
        const xhr = xhrFactory();
        activeXhr = xhr;

        await new Promise<void>((resolve, reject) => {
          const signal = abortController!.signal;
          if (signal.aborted) {
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }

          signal.addEventListener(
            "abort",
            () => {
              xhr.abort();
            },
            { once: true },
          );

          xhr.open("POST", url, true);
          xhr.withCredentials = true;
          xhr.setRequestHeader("Content-Type", "audio/webm");
          xhr.setRequestHeader("X-Session-Id", sessionId);

          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable || event.total <= 0) return;
            const ratio = event.loaded / event.total;
            const percent = Math.floor(ratio * 95);
            updateState({ progress: Math.max(0, Math.min(95, percent)) });
          };

          xhr.onload = () => {
            const ok = xhr.status >= 200 && xhr.status < 300;
            if (!ok) {
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
              return;
            }
            resolve();
          };

          xhr.onerror = () => {
            reject(new Error("Network error"));
          };

          xhr.onabort = () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          };

          xhr.send(file);
        });
      } else {
        // Note: fetch() doesn't provide upload progress; keep progress at 0 until completion.
        const response = await fetchFn(url, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "audio/webm",
            "X-Session-Id": sessionId,
          },
          body: file,
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }
      }

      // Clean up local file after successful upload
      await storage.deleteAudioFile(sessionId);

      updateState({
        isUploading: false,
        progress: 100,
        lastUploadedSessionId: sessionId,
        error: null,
      });
      callbacks.onComplete(sessionId);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Cancelled — don't delete local file
        updateState({ isUploading: false, progress: 0, error: null });
        return;
      }
      const message = err instanceof Error ? err.message : "Upload failed";
      const error = err instanceof Error ? err : new Error(message);
      updateState({ isUploading: false, error: message });
      callbacks.onError(error);
    } finally {
      abortController = null;
      activeXhr = null;
    }
  }

  function cancel(): void {
    abortController?.abort();
    activeXhr?.abort();
  }

  function dispose(): void {
    if (isDisposed) return;
    isDisposed = true;
    cancel();
  }

  return {
    upload,
    cancel,
    getState: () => ({ ...state }),
    dispose,
  };
}
