import type { ServerWebSocket } from "bun";
import { WS_CONFIG } from "@/config/constants";
import { checkAndGenerateMetaSummary } from "@/server/application/meta-summary";
import { sanitizeErrorMessage } from "@/server/domain/common/error-sanitizer";
import { send } from "@/server/presentation/ws/sender";
import type { WSContext } from "@/server/types/context";
import { createAnalysisService } from "@/services/server/analysis";
import { createDeepgramService } from "@/services/server/deepgram";
import {
  createGeminiService,
  resolveGeminiImageModel,
  type GeneratedImage,
} from "@/services/server/gemini";
import { createOpenAIService } from "@/services/server/openai";
import { canBufferPendingAudio } from "@/services/server/pending-audio-guard";
import type { PersistenceService } from "@/services/server/persistence";
import {
  addCameraFrame,
  addImage,
  addTranscript,
  markAnalysisComplete,
  markUtteranceEnd,
  startSession,
  stopSession,
} from "@/services/server/session";
import type {
  AnalysisResult,
  CameraFrame,
  GenerationPhase,
  TranscriptSegment,
} from "@/types/messages";

interface CreateSessionWsUsecaseInput {
  persistence: PersistenceService;
}

export interface SessionWsUsecase {
  cleanup: (ctx: WSContext) => void;
  handleAudioChunk: (ctx: WSContext, chunk: ArrayBuffer | Buffer) => void;
  start: (ws: ServerWebSocket<WSContext>, ctx: WSContext) => Promise<void>;
  stop: (ws: ServerWebSocket<WSContext>, ctx: WSContext) => void;
  handleCameraFrame: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
}

function readCameraFrame(data: unknown): CameraFrame | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const base64 = (data as { base64?: unknown }).base64;
  const timestamp = (data as { timestamp?: unknown }).timestamp;
  if (typeof base64 !== "string" || typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return null;
  }
  return { base64, timestamp };
}

export function createSessionWsUsecase(input: CreateSessionWsUsecaseInput): SessionWsUsecase {
  const { persistence } = input;

  function cleanup(ctx: WSContext): void {
    if (ctx.checkInterval) {
      clearInterval(ctx.checkInterval);
      ctx.checkInterval = null;
    }
    if (ctx.deepgram) {
      ctx.deepgram.stop();
      ctx.deepgram = null;
    }
    if (ctx.analysis) {
      ctx.analysis.dispose();
      ctx.analysis = null;
    }
  }

  function handleAudioChunk(ctx: WSContext, chunk: ArrayBuffer | Buffer): void {
    if (ctx.deepgram?.isConnected()) {
      ctx.deepgram.sendAudio(chunk);
      return;
    }

    const incomingBytes = chunk.byteLength;
    const guardResult = canBufferPendingAudio({
      incomingBytes,
      pendingChunks: ctx.pendingAudio.length,
      pendingBytes: ctx.pendingAudioBytes,
      limits: WS_CONFIG,
    });

    if (guardResult.canBuffer) {
      ctx.pendingAudio.push(chunk);
      ctx.pendingAudioBytes += incomingBytes;
      return;
    }

    console.warn(
      `[WS] Dropped pending audio chunk (${guardResult.reason}): session=${ctx.sessionId}, bytes=${incomingBytes}`,
    );
  }

  async function start(ws: ServerWebSocket<WSContext>, ctx: WSContext): Promise<void> {
    try {
      const openaiService = createOpenAIService();
      const geminiService = createGeminiService({
        getModel: () => resolveGeminiImageModel(ctx.imageModelPreset),
      });

      ctx.analysis = createAnalysisService(
        openaiService,
        geminiService,
        {
          onAnalysisComplete(analysis: AnalysisResult) {
            ctx.session = markAnalysisComplete(ctx.session, analysis);
            send(ws, {
              type: "analysis",
              data: {
                summary: analysis.summary,
                topics: analysis.topics,
                tags: analysis.tags,
                flow: analysis.flow,
                heat: analysis.heat,
              },
            });

            if (ctx.meetingId) {
              persistence.persistAnalysis(ctx.sessionId, analysis).catch((err) => {
                console.error("[Persistence] Failed to persist analysis:", err);
              });
              void checkAndGenerateMetaSummary(persistence, ctx.meetingId, openaiService);
            }
          },
          onImageComplete(image: GeneratedImage) {
            ctx.session = addImage(ctx.session, image);
            send(ws, {
              type: "image",
              data: {
                base64: image.base64,
                prompt: image.prompt,
                timestamp: image.timestamp,
              },
            });

            if (ctx.meetingId) {
              persistence.persistImage(ctx.sessionId, image).catch((err) => {
                console.error("[Persistence] Failed to persist image:", err);
              });
            }
          },
          onError(error: Error) {
            console.error("[Analysis] Error:", error);
            send(ws, {
              type: "error",
              data: { message: sanitizeErrorMessage(error) },
            });
          },
          onPhaseChange(phase: GenerationPhase, retryAttempt?: number) {
            send(ws, {
              type: "generation:status",
              data: { phase, retryAttempt },
            });
          },
        },
        ctx.meetingId
          ? {
              persistence,
              meetingId: ctx.meetingId,
            }
          : undefined,
      );

      ctx.deepgram = createDeepgramService({
        onTranscript(segment: TranscriptSegment) {
          ctx.session = addTranscript(ctx.session, segment);
          send(ws, {
            type: "transcript",
            data: {
              text: segment.text,
              isFinal: segment.isFinal,
              timestamp: segment.timestamp,
              speaker: segment.speaker,
              startTime: segment.startTime,
            },
          });

          if (ctx.meetingId && segment.isFinal) {
            persistence.persistTranscript(ctx.sessionId, segment);

            if (ctx.pendingUtteranceEndCount > 0) {
              try {
                const marked = persistence.markUtteranceEnd(ctx.sessionId);
                if (marked) {
                  ctx.pendingUtteranceEndCount = Math.max(0, ctx.pendingUtteranceEndCount - 1);
                }
              } catch (err) {
                console.error("[Persistence] Failed to persist buffered utterance end:", err);
              }
            }
          }

          ctx.analysis?.checkAndTrigger(ctx.session);
        },
        onUtteranceEnd(timestamp: number) {
          ctx.session = markUtteranceEnd(ctx.session);
          send(ws, {
            type: "utterance:end",
            data: { timestamp },
          });

          if (ctx.meetingId) {
            try {
              const marked = persistence.markUtteranceEnd(ctx.sessionId);
              if (!marked) {
                ctx.pendingUtteranceEndCount += 1;
              }
            } catch (err) {
              console.error("[Persistence] Failed to persist utterance end:", err);
            }
          }
        },
        onError(error: Error) {
          console.error("[Deepgram] Error:", error);
          send(ws, {
            type: "error",
            data: { message: sanitizeErrorMessage(error) },
          });
        },
        onClose() {
          console.log("[Deepgram] Connection closed");
        },
      });

      await ctx.deepgram.start();

      if (ctx.pendingAudio.length > 0) {
        for (const audio of ctx.pendingAudio) {
          ctx.deepgram.sendAudio(audio);
        }
        ctx.pendingAudio.length = 0;
        ctx.pendingAudioBytes = 0;
      }

      ctx.session = startSession(ctx.session);
      if (ctx.meetingId) {
        persistence.startSession(ctx.sessionId);
      }

      ctx.checkInterval = setInterval(() => {
        ctx.analysis?.checkAndTrigger(ctx.session);
      }, 30000);

      send(ws, {
        type: "session:status",
        data: { status: "recording" },
      });

      console.log(`[WS] Recording started: ${ctx.sessionId}`);
    } catch (error) {
      console.error("[WS] Failed to start session:", error);
      send(ws, {
        type: "session:status",
        data: {
          status: "error",
          error: sanitizeErrorMessage(error),
        },
      });
    }
  }

  function stop(ws: ServerWebSocket<WSContext>, ctx: WSContext): void {
    cleanup(ctx);
    ctx.session = stopSession(ctx.session);

    if (ctx.meetingId) {
      persistence.stopSession(ctx.sessionId);
    }

    send(ws, {
      type: "session:status",
      data: { status: "idle" },
    });

    console.log(`[WS] Recording stopped: ${ctx.sessionId}`);
  }

  function handleCameraFrame(ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown): void {
    const frame = readCameraFrame(data);
    if (!frame) {
      send(ws, {
        type: "error",
        data: { message: "Invalid camera frame payload", code: "INVALID_CAMERA_FRAME" },
      });
      return;
    }

    ctx.session = addCameraFrame(ctx.session, frame);

    if (ctx.meetingId) {
      persistence.persistCameraFrame(ctx.sessionId, frame).catch((err) => {
        console.error("[Persistence] Failed to persist camera frame:", err);
      });
    }

    console.log(
      `[WS] Camera frame received: ${ctx.sessionId}, frames: ${ctx.session.cameraFrames.length}`,
    );
  }

  return {
    cleanup,
    handleAudioChunk,
    start,
    stop,
    handleCameraFrame,
  };
}
