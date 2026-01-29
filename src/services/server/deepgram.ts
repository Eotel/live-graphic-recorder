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
import type { TranscriptSegment } from "@/types/messages";

export interface DeepgramServiceEvents {
  onTranscript: (segment: TranscriptSegment) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export interface DeepgramService {
  start: () => Promise<void>;
  sendAudio: (audio: ArrayBuffer | Buffer) => void;
  stop: () => void;
  isConnected: () => boolean;
}

export function createDeepgramService(events: DeepgramServiceEvents): DeepgramService {
  const apiKey = process.env["DEEPGRAM_API_KEY"];
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY environment variable is required");
  }

  let client: DeepgramClient | null = null;
  let connection: ListenLiveClient | null = null;
  let connected = false;

  async function start(): Promise<void> {
    client = createClient(apiKey);

    connection = client.listen.live(DEEPGRAM_CONFIG);

    return new Promise((resolve, reject) => {
      if (!connection) {
        reject(new Error("Failed to create connection"));
        return;
      }

      connection.on(LiveTranscriptionEvents.Open, () => {
        connected = true;
        resolve();
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0];
        if (transcript?.transcript) {
          events.onTranscript({
            text: transcript.transcript,
            isFinal: data.is_final ?? false,
            timestamp: Date.now(),
          });
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        events.onError(error instanceof Error ? error : new Error(String(error)));
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        connected = false;
        events.onClose();
      });

      // Timeout for connection
      setTimeout(() => {
        if (!connected) {
          reject(new Error("Deepgram connection timeout"));
        }
      }, 10000);
    });
  }

  function sendAudio(audio: ArrayBuffer | Buffer): void {
    if (connection && connected) {
      const data =
        audio instanceof ArrayBuffer
          ? audio
          : audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
      connection.send(data);
    }
  }

  function stop(): void {
    if (connection) {
      connection.requestClose();
      connection = null;
    }
    connected = false;
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
