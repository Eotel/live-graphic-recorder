/**
 * Upload controller - manages audio file upload to server.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/adapters/opfs-storage.ts, src/hooks/useAudioUpload.ts
 */

import type { OPFSStorageAdapter } from "../adapters/opfs-storage";

export interface PendingUploadRecording {
  recordingId: string;
  sessionId: string;
  totalChunks: number;
  createdAt: number;
}

export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  lastUploadedSessionId: string | null;
  lastUploadedAudioUrl: string | null;
  uploadedCount: number;
  totalCount: number;
}

export interface UploadDeps {
  storage: OPFSStorageAdapter;
  baseUrl: string;
  fetchFn?: typeof fetch;
  xhrFactory?: () => XMLHttpRequest;
}

export interface UploadCallbacks {
  onStateChange: (state: UploadState) => void;
  onComplete: (recordingId: string) => void;
  onError: (error: Error) => void;
}

function parseUploadedAudioUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const url = (payload as { url?: unknown }).url;
  if (typeof url !== "string") {
    return null;
  }
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseUploadedAudioUrlFromText(responseText: string): string | null {
  if (!responseText) {
    return null;
  }
  try {
    return parseUploadedAudioUrl(JSON.parse(responseText));
  } catch {
    return null;
  }
}

async function parseUploadedAudioUrlFromResponse(response: Response): Promise<string | null> {
  try {
    const payload = await response.json();
    return parseUploadedAudioUrl(payload);
  } catch {
    return null;
  }
}

export function createUploadController(
  deps: UploadDeps,
  callbacks: UploadCallbacks,
): {
  upload(recordings: PendingUploadRecording[], meetingId: string): Promise<void>;
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
    lastUploadedAudioUrl: null,
    uploadedCount: 0,
    totalCount: 0,
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

  async function upload(recordings: PendingUploadRecording[], meetingId: string): Promise<void> {
    if (isDisposed || state.isUploading) return;

    const queue = [...recordings].sort((a, b) => a.createdAt - b.createdAt);
    if (queue.length === 0) {
      updateState({
        isUploading: false,
        progress: 0,
        error: null,
        uploadedCount: 0,
        totalCount: 0,
      });
      return;
    }

    abortController = new AbortController();
    const totalCount = queue.length;
    updateState({
      isUploading: true,
      progress: 0,
      error: null,
      uploadedCount: 0,
      totalCount,
    });

    try {
      let uploadedCount = 0;
      let lastUploadedSessionId: string | null = state.lastUploadedSessionId;
      let lastUploadedAudioUrl: string | null = state.lastUploadedAudioUrl;

      const updateBatchProgress = (index: number, fileProgressRatio: number): void => {
        const completedRatio = index / totalCount;
        const currentRatio = fileProgressRatio / totalCount;
        const ratio = Math.max(0, Math.min(1, completedRatio + currentRatio));
        updateState({ progress: Math.floor(ratio * 100) });
      };

      for (let index = 0; index < queue.length; index += 1) {
        const recording = queue[index]!;
        const file = await storage.getAudioFile(recording.recordingId);
        if (!file) {
          throw new Error("Audio file not found");
        }

        const url = `${baseUrl}/api/meetings/${meetingId}/audio`;
        let uploadedAudioUrl: string | null = null;

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
            xhr.setRequestHeader("X-Session-Id", recording.sessionId);

            xhr.upload.onprogress = (event) => {
              if (!event.lengthComputable || event.total <= 0) return;
              const ratio = event.loaded / event.total;
              updateBatchProgress(index, Math.max(0, Math.min(1, ratio * 0.95)));
            };

            xhr.onload = () => {
              const ok = xhr.status >= 200 && xhr.status < 300;
              if (!ok) {
                reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                return;
              }
              uploadedAudioUrl = parseUploadedAudioUrlFromText(xhr.responseText);
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
          const response = await fetchFn(url, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "audio/webm",
              "X-Session-Id": recording.sessionId,
            },
            body: file,
            signal: abortController.signal,
          });

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
          }
          uploadedAudioUrl = await parseUploadedAudioUrlFromResponse(response);
          updateBatchProgress(index, 0.95);
        }

        await storage.deleteAudioFile(recording.recordingId);

        uploadedCount += 1;
        lastUploadedSessionId = recording.sessionId;
        lastUploadedAudioUrl = uploadedAudioUrl;
        updateState({
          uploadedCount,
          lastUploadedSessionId,
          lastUploadedAudioUrl,
          progress: Math.floor((uploadedCount / totalCount) * 100),
        });
        callbacks.onComplete(recording.recordingId);
      }

      updateState({
        isUploading: false,
        progress: 100,
        error: null,
        uploadedCount: totalCount,
        totalCount,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        updateState({ isUploading: false, error: null });
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
