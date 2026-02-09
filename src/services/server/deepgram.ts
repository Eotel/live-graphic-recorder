/**
 * Deepgram WebSocket client for real-time speech-to-text.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/services/server/session.ts
 */

import {
  createClient,
  LiveTranscriptionEvents,
  type DeepgramClient,
  type ListenLiveClient,
} from "@deepgram/sdk";
import { DEEPGRAM_CONFIG } from "@/config/constants";
import type { SttConnectionState, TranscriptSegment } from "@/types/messages";

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

export interface DeepgramCloseInfo {
  code?: number;
  reason?: string;
  wasClean?: boolean;
}

export interface DeepgramStatusInfo {
  state: SttConnectionState;
  retryAttempt?: number;
  message?: string;
}

/**
 * Extracts speaker info from words array.
 * Returns speaker ID and start time from the first word with speaker info.
 */
function extractSpeakerInfo(words?: DeepgramWord[]): { speaker?: number; startTime?: number } {
  if (!words?.length) return {};
  const firstWord = words[0];
  return {
    speaker: firstWord?.speaker,
    startTime: firstWord?.start,
  };
}

function normalizeCloseInfo(event: unknown): DeepgramCloseInfo {
  if (!event || typeof event !== "object") {
    return {};
  }
  const code = (event as { code?: unknown }).code;
  const reason = (event as { reason?: unknown }).reason;
  const wasClean = (event as { wasClean?: unknown }).wasClean;
  return {
    code: typeof code === "number" ? code : undefined,
    reason: typeof reason === "string" ? reason : undefined,
    wasClean: typeof wasClean === "boolean" ? wasClean : undefined,
  };
}

function closeInfoMessage(info: DeepgramCloseInfo): string {
  const parts: string[] = [];
  if (typeof info.code === "number") {
    parts.push(`code=${info.code}`);
  }
  if (typeof info.reason === "string" && info.reason.length > 0) {
    parts.push(`reason=${info.reason}`);
  }
  if (typeof info.wasClean === "boolean") {
    parts.push(`wasClean=${info.wasClean}`);
  }
  return parts.length > 0 ? parts.join(", ") : "unknown";
}

export interface DeepgramServiceEvents {
  onTranscript: (segment: TranscriptSegment) => void;
  onUtteranceEnd: (timestamp: number) => void;
  onError: (error: Error) => void;
  onClose: (info: DeepgramCloseInfo) => void;
  onStatusChange?: (status: DeepgramStatusInfo) => void;
}

export interface DeepgramService {
  start: () => Promise<void>;
  sendAudio: (audio: ArrayBuffer | Buffer) => void;
  stop: () => void;
  isConnected: () => boolean;
}

const CONNECT_TIMEOUT_MS = 10000;
const KEEP_ALIVE_INTERVAL_MS = 8000;
const RECONNECT_INITIAL_BACKOFF_MS = 1000;
const RECONNECT_MAX_BACKOFF_MS = 8000;
const RECONNECT_JITTER_RATIO = 0.2;
const RECONNECT_MAX_ATTEMPTS = 10;

export function createDeepgramService(events: DeepgramServiceEvents): DeepgramService {
  const apiKey = process.env["DEEPGRAM_API_KEY"];
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY environment variable is required");
  }

  let client: DeepgramClient | null = null;
  let connection: ListenLiveClient | null = null;
  let connected = false;
  let started = false;
  let manuallyStopped = false;
  let reconnectAttempt = 0;
  let connectPromise: Promise<void> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  const pendingAudioBuffer: (ArrayBuffer | Buffer)[] = [];

  function emitStatus(status: DeepgramStatusInfo): void {
    events.onStatusChange?.(status);
  }

  function clearKeepAlive(): void {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function toSendableAudio(audio: ArrayBuffer | Buffer): ArrayBuffer {
    if (audio instanceof ArrayBuffer) {
      return audio;
    }
    const copied = new Uint8Array(audio.byteLength);
    copied.set(audio);
    return copied.buffer;
  }

  function flushPendingAudio(conn: ListenLiveClient): void {
    if (pendingAudioBuffer.length === 0) return;
    for (const bufferedAudio of pendingAudioBuffer) {
      conn.send(toSendableAudio(bufferedAudio));
    }
    pendingAudioBuffer.length = 0;
  }

  function computeReconnectDelayMs(attempt: number): number {
    const base = RECONNECT_INITIAL_BACKOFF_MS * Math.pow(2, Math.max(0, attempt - 1));
    const capped = Math.min(RECONNECT_MAX_BACKOFF_MS, base);
    const jitter = capped * RECONNECT_JITTER_RATIO;
    const delta = jitter > 0 ? (Math.random() * 2 - 1) * jitter : 0;
    return Math.max(0, Math.round(capped + delta));
  }

  function scheduleReconnect(reason?: string): void {
    if (!started || manuallyStopped) return;
    if (reconnectTimer) return;

    if (reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      const message =
        reason && reason.length > 0
          ? `Deepgram reconnect failed after ${RECONNECT_MAX_ATTEMPTS} attempts: ${reason}`
          : `Deepgram reconnect failed after ${RECONNECT_MAX_ATTEMPTS} attempts`;
      emitStatus({
        state: "failed",
        retryAttempt: reconnectAttempt,
        message,
      });
      events.onError(new Error(message));
      return;
    }

    reconnectAttempt += 1;
    const delayMs = computeReconnectDelayMs(reconnectAttempt);
    emitStatus({
      state: "reconnecting",
      retryAttempt: reconnectAttempt,
      message: reason,
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void openConnection().catch((err) => {
        if (!started || manuallyStopped) return;
        const message = err instanceof Error ? err.message : String(err);
        scheduleReconnect(message);
      });
    }, delayMs);
  }

  async function openConnection(): Promise<void> {
    if (!client) {
      client = createClient(apiKey);
    }

    const conn = client.listen.live(DEEPGRAM_CONFIG);
    connection = conn;

    return new Promise((resolve, reject) => {
      let settled = false;

      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const timeoutTimer = setTimeout(() => {
        if (settled || manuallyStopped || connection !== conn) return;
        const timeoutError = new Error("Deepgram connection timeout");
        events.onError(timeoutError);
        rejectOnce(timeoutError);
        scheduleReconnect(timeoutError.message);
        try {
          conn.requestClose();
        } catch {
          // no-op
        }
      }, CONNECT_TIMEOUT_MS);

      conn.on(LiveTranscriptionEvents.Open, () => {
        if (connection !== conn) return;
        clearTimeout(timeoutTimer);
        connected = true;
        reconnectAttempt = 0;
        clearKeepAlive();
        keepAliveInterval = setInterval(() => {
          if (connection === conn && connected && !manuallyStopped) {
            connection.keepAlive();
          }
        }, KEEP_ALIVE_INTERVAL_MS);

        flushPendingAudio(conn);
        emitStatus({ state: "connected" });
        resolveOnce();
      });

      conn.on(LiveTranscriptionEvents.Transcript, (data) => {
        if (connection !== conn) return;
        const transcript = data.channel?.alternatives?.[0];
        if (transcript?.transcript) {
          const { speaker, startTime } = extractSpeakerInfo(transcript.words as DeepgramWord[]);
          events.onTranscript({
            text: transcript.transcript,
            isFinal: data.is_final ?? false,
            timestamp: Date.now(),
            speaker,
            startTime,
          });
        }
      });

      conn.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        if (connection !== conn) return;
        events.onUtteranceEnd(Date.now());
      });

      conn.on(LiveTranscriptionEvents.Error, (error) => {
        if (connection !== conn) return;
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        events.onError(normalizedError);
        if (!connected) {
          clearTimeout(timeoutTimer);
          rejectOnce(normalizedError);
        }
      });

      conn.on(LiveTranscriptionEvents.Close, (event) => {
        if (connection === conn) {
          connection = null;
        } else {
          return;
        }

        clearTimeout(timeoutTimer);
        clearKeepAlive();
        const wasConnected = connected;
        connected = false;

        const closeInfo = normalizeCloseInfo(event);
        events.onClose(closeInfo);

        if (manuallyStopped || !started) {
          if (!wasConnected) {
            rejectOnce(
              new Error(`Deepgram connection closed before open (${closeInfoMessage(closeInfo)})`),
            );
          }
          return;
        }

        const reason = closeInfoMessage(closeInfo);
        if (!wasConnected) {
          rejectOnce(new Error(`Deepgram connection closed before open (${reason})`));
        }
        scheduleReconnect(reason);
      });
    });
  }

  async function start(): Promise<void> {
    manuallyStopped = false;
    started = true;
    clearReconnectTimer();

    if (!connectPromise) {
      connectPromise = openConnection().finally(() => {
        connectPromise = null;
      });
    }

    await connectPromise;
  }

  function sendAudio(audio: ArrayBuffer | Buffer): void {
    if (connection && connected) {
      connection.send(toSendableAudio(audio));
      return;
    }

    if (started && !manuallyStopped) {
      pendingAudioBuffer.push(audio);
    }
  }

  function stop(): void {
    manuallyStopped = true;
    started = false;
    connected = false;
    reconnectAttempt = 0;
    clearReconnectTimer();
    clearKeepAlive();
    pendingAudioBuffer.length = 0;

    if (connection) {
      const conn = connection;
      connection = null;
      try {
        conn.requestClose();
      } catch {
        // no-op
      }
    }
    client = null;
  }

  function isConnected(): boolean {
    return connected;
  }

  return {
    start,
    sendAudio,
    stop,
    isConnected,
  };
}
