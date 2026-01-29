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

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
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

export interface DeepgramServiceEvents {
  onTranscript: (segment: TranscriptSegment) => void;
  onUtteranceEnd: (timestamp: number) => void;
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
  let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  // Buffer for audio data received before connection is ready
  const pendingAudioBuffer: (ArrayBuffer | Buffer)[] = [];

  async function start(): Promise<void> {
    client = createClient(apiKey);

    connection = client.listen.live(DEEPGRAM_CONFIG);

    return new Promise((resolve, reject) => {
      const conn = connection;
      if (!conn) {
        reject(new Error("Failed to create connection"));
        return;
      }

      conn.on(LiveTranscriptionEvents.Open, () => {
        console.log("[Deepgram] Connection opened");
        connected = true;

        // Flush any buffered audio data (including WebM header)
        if (pendingAudioBuffer.length > 0) {
          for (const bufferedAudio of pendingAudioBuffer) {
            const data =
              bufferedAudio instanceof ArrayBuffer
                ? bufferedAudio
                : bufferedAudio.buffer.slice(
                    bufferedAudio.byteOffset,
                    bufferedAudio.byteOffset + bufferedAudio.byteLength,
                  );
            conn.send(data);
          }
          pendingAudioBuffer.length = 0;
        }

        // Send keepalive every 8 seconds to prevent timeout during audio gaps
        keepAliveInterval = setInterval(() => {
          if (connection && connected) {
            connection.keepAlive();
          }
        }, 8000);

        resolve();
      });

      conn.on(LiveTranscriptionEvents.Transcript, (data) => {
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
        events.onUtteranceEnd(Date.now());
      });

      conn.on(LiveTranscriptionEvents.Error, (error) => {
        console.error("[Deepgram] Error:", error);
        events.onError(error instanceof Error ? error : new Error(String(error)));
      });

      conn.on(LiveTranscriptionEvents.Close, () => {
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
    } else if (connection && !connected) {
      // Connection is being established, buffer the audio (including WebM header)
      pendingAudioBuffer.push(audio);
    }
  }

  function stop(): void {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
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
