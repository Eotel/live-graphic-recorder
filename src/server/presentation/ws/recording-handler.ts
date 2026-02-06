import type { ServerWebSocket } from "bun";
import { WS_CONFIG } from "@/config/constants";
import { checkAndGenerateMetaSummary } from "@/server/application/meta-summary";
import { sanitizeErrorMessage } from "@/server/domain/common/error-sanitizer";
import { isValidUUID } from "@/server/domain/common/id";
import { buildMeetingHistoryMessage } from "@/server/domain/meeting/history-mapper";
import { speakerAliasArrayToMap } from "@/server/domain/meeting/speaker-alias";
import { buildImageModelStatusMessage } from "@/server/presentation/ws/context";
import { send } from "@/server/presentation/ws/sender";
import { createAnalysisService } from "@/services/server/analysis";
import { createDeepgramService } from "@/services/server/deepgram";
import {
  createGeminiService,
  getGeminiImageModelConfig,
  resolveGeminiImageModel,
  type GeneratedImage,
} from "@/services/server/gemini";
import { createOpenAIService } from "@/services/server/openai";
import type { PersistenceService } from "@/services/server/persistence";
import { canBufferPendingAudio } from "@/services/server/pending-audio-guard";
import {
  addCameraFrame,
  addImage,
  addTranscript,
  markAnalysisComplete,
  markUtteranceEnd,
  startSession,
  stopSession,
} from "@/services/server/session";
import type { AnalysisResult, CameraFrame, ClientMessage, GenerationPhase } from "@/types/messages";
import type { WSContext } from "@/server/types/context";

interface CreateRecordingWebSocketHandlersInput {
  persistence: PersistenceService;
}

interface RecordingWebSocketHandlers {
  open: (ws: ServerWebSocket<WSContext>) => void;
  message: (
    ws: ServerWebSocket<WSContext>,
    message: string | Buffer | ArrayBuffer,
  ) => Promise<void>;
  close: (ws: ServerWebSocket<WSContext>) => void;
}

function sendSpeakerAliases(
  ws: ServerWebSocket<WSContext>,
  persistence: PersistenceService,
  meetingId: string,
  userId: string,
): void {
  const aliases = persistence.loadSpeakerAliases(meetingId, userId);
  send(ws, {
    type: "meeting:speaker-alias",
    data: {
      speakerAliases: speakerAliasArrayToMap(aliases),
    },
  });
}

function sendMeetingHistory(
  ws: ServerWebSocket<WSContext>,
  persistence: PersistenceService,
  meetingId: string,
  userId: string,
): void {
  try {
    const message = buildMeetingHistoryMessage(meetingId, {
      transcripts: persistence.loadMeetingTranscript(meetingId, userId),
      analyses: persistence.loadMeetingAnalyses(meetingId, userId),
      images: persistence.loadMeetingImages(meetingId, userId),
      captures: persistence.loadMeetingCaptures(meetingId, userId),
      metaSummaries: persistence.loadMetaSummaries(meetingId, userId),
      speakerAliases: persistence.loadSpeakerAliases(meetingId, userId),
    });

    send(ws, message);
    console.log(
      `[WS] Sent meeting history: ${message.data.transcripts.length} transcripts, ${message.data.analyses.length} analyses, ${message.data.images.length} images, ${message.data.captures.length} captures`,
    );
  } catch (error) {
    console.error("[WS] Failed to send meeting history:", error);
    send(ws, {
      type: "error",
      data: { message: "Failed to load meeting history" },
    });
  }
}

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

function handleMeetingStop(ctx: WSContext, persistence: PersistenceService): void {
  if (ctx.meetingId) {
    persistence.endMeeting(ctx.meetingId, ctx.userId);
    console.log(`[WS] Meeting ended: ${ctx.meetingId}`);
    ctx.meetingId = null;
  }
}

function handleMeetingListRequest(
  ws: ServerWebSocket<WSContext>,
  persistence: PersistenceService,
): void {
  const meetings = persistence.listMeetings(50, ws.data.userId);
  send(ws, {
    type: "meeting:list",
    data: {
      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        createdAt: m.createdAt,
      })),
    },
  });
}

function handleMeetingUpdate(
  ws: ServerWebSocket<WSContext>,
  ctx: WSContext,
  data: { title: string },
  persistence: PersistenceService,
): void {
  if (!ctx.meetingId) {
    send(ws, {
      type: "error",
      data: { message: "No active meeting to update", code: "NO_ACTIVE_MEETING" },
    });
    return;
  }

  try {
    const updated = persistence.updateMeetingTitle(ctx.meetingId, data.title, ctx.userId);
    if (!updated) {
      send(ws, {
        type: "error",
        data: { message: "Meeting not found", code: "MEETING_NOT_FOUND" },
      });
      return;
    }

    send(ws, {
      type: "meeting:status",
      data: {
        meetingId: ctx.meetingId,
        title: data.title,
        sessionId: ctx.sessionId,
      },
    });

    console.log(`[WS] Meeting title updated: ${ctx.meetingId} -> "${data.title}"`);
  } catch (error) {
    console.error("[WS] Failed to update meeting:", error);
    send(ws, {
      type: "error",
      data: { message: "Failed to update meeting" },
    });
  }
}

function handleSpeakerAliasUpdate(
  ws: ServerWebSocket<WSContext>,
  ctx: WSContext,
  data: { speaker?: unknown; displayName?: unknown },
  persistence: PersistenceService,
): void {
  if (!ctx.meetingId) {
    send(ws, {
      type: "error",
      data: { message: "No active meeting to update", code: "NO_ACTIVE_MEETING" },
    });
    return;
  }

  const speaker = Number(data.speaker);
  if (!Number.isInteger(speaker) || speaker < 0) {
    send(ws, {
      type: "error",
      data: { message: "Invalid speaker index", code: "INVALID_SPEAKER" },
    });
    return;
  }

  if (typeof data.displayName !== "string") {
    send(ws, {
      type: "error",
      data: { message: "Invalid display name", code: "INVALID_DISPLAY_NAME" },
    });
    return;
  }

  const displayName = data.displayName.trim();
  if (displayName) {
    const upserted = persistence.upsertSpeakerAlias(
      ctx.meetingId,
      speaker,
      displayName,
      ctx.userId,
    );
    if (!upserted) {
      send(ws, {
        type: "error",
        data: { message: "Meeting not found", code: "MEETING_NOT_FOUND" },
      });
      return;
    }
  } else {
    persistence.deleteSpeakerAlias(ctx.meetingId, speaker, ctx.userId);
  }

  sendSpeakerAliases(ws, persistence, ctx.meetingId, ctx.userId);
}

async function handleSessionStart(
  ws: ServerWebSocket<WSContext>,
  ctx: WSContext,
  persistence: PersistenceService,
): Promise<void> {
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
            checkAndGenerateMetaSummary(persistence, ctx.meetingId, openaiService);
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
      onTranscript(segment) {
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

function handleSessionStop(
  ws: ServerWebSocket<WSContext>,
  ctx: WSContext,
  persistence: PersistenceService,
): void {
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

function handleCameraFrame(
  ctx: WSContext,
  frame: CameraFrame,
  persistence: PersistenceService,
): void {
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

function handleImageModelSet(ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown): void {
  const preset =
    data && typeof data === "object" && "preset" in data
      ? (data as { preset?: unknown }).preset
      : undefined;

  if (preset !== "flash" && preset !== "pro") {
    send(ws, {
      type: "error",
      data: {
        message: "Invalid image model preset",
        code: "INVALID_IMAGE_MODEL_PRESET",
      },
    });
    send(ws, buildImageModelStatusMessage(ctx));
    return;
  }

  const config = getGeminiImageModelConfig();
  if (preset === "pro" && !config.pro) {
    send(ws, {
      type: "error",
      data: {
        message: "Pro image model is not configured (set GEMINI_IMAGE_MODEL_PRO)",
        code: "IMAGE_MODEL_NOT_CONFIGURED",
      },
    });
    send(ws, buildImageModelStatusMessage(ctx));
    return;
  }

  ctx.imageModelPreset = preset;
  send(ws, buildImageModelStatusMessage(ctx));
}

function handleMeetingStart(
  ws: ServerWebSocket<WSContext>,
  ctx: WSContext,
  data: { title?: string; meetingId?: string },
  persistence: PersistenceService,
): void {
  try {
    let meetingId: string;
    let title: string | undefined;
    let isExistingMeeting = false;

    if (data.meetingId) {
      if (!isValidUUID(data.meetingId)) {
        send(ws, {
          type: "error",
          data: { message: "Invalid meeting ID format", code: "INVALID_MEETING_ID" },
        });
        return;
      }

      const existing = persistence.getMeeting(data.meetingId, ctx.userId);
      if (!existing) {
        send(ws, {
          type: "error",
          data: { message: "Meeting not found", code: "MEETING_NOT_FOUND" },
        });
        return;
      }

      meetingId = existing.id;
      title = existing.title ?? undefined;
      isExistingMeeting = true;
    } else {
      const meeting = persistence.createMeeting(data.title, ctx.userId);
      meetingId = meeting.id;
      title = meeting.title ?? undefined;
    }

    ctx.meetingId = meetingId;
    persistence.createSession(meetingId, ctx.sessionId);

    send(ws, {
      type: "meeting:status",
      data: { meetingId, title, sessionId: ctx.sessionId },
    });

    if (isExistingMeeting) {
      sendMeetingHistory(ws, persistence, meetingId, ctx.userId);
    }

    console.log(`[WS] Meeting started: ${meetingId}, session: ${ctx.sessionId}`);
  } catch (error) {
    console.error("[WS] Failed to start meeting:", error);
    send(ws, {
      type: "error",
      data: { message: "Failed to start meeting" },
    });
  }
}

export function createRecordingWebSocketHandlers(
  input: CreateRecordingWebSocketHandlersInput,
): RecordingWebSocketHandlers {
  return {
    open(ws) {
      send(ws, {
        type: "session:status",
        data: { status: "idle" },
      });
      send(ws, buildImageModelStatusMessage(ws.data));
      console.log(`[WS] Session opened: ${ws.data.sessionId}`);
    },

    async message(ws, message) {
      const ctx = ws.data;

      if (message instanceof ArrayBuffer || message instanceof Buffer) {
        if (ctx.deepgram?.isConnected()) {
          ctx.deepgram.sendAudio(message);
        } else {
          const incomingBytes = message.byteLength;
          const guardResult = canBufferPendingAudio({
            incomingBytes,
            pendingChunks: ctx.pendingAudio.length,
            pendingBytes: ctx.pendingAudioBytes,
            limits: WS_CONFIG,
          });

          if (guardResult.canBuffer) {
            ctx.pendingAudio.push(message);
            ctx.pendingAudioBytes += incomingBytes;
          } else {
            console.warn(
              `[WS] Dropped pending audio chunk (${guardResult.reason}): session=${ctx.sessionId}, bytes=${incomingBytes}`,
            );
          }
        }
        return;
      }

      try {
        const parsed = JSON.parse(String(message)) as ClientMessage;

        switch (parsed.type) {
          case "meeting:start":
            handleMeetingStart(ws, ctx, parsed.data, input.persistence);
            break;
          case "meeting:stop":
            handleMeetingStop(ctx, input.persistence);
            break;
          case "meeting:list:request":
            handleMeetingListRequest(ws, input.persistence);
            break;
          case "meeting:update":
            handleMeetingUpdate(ws, ctx, parsed.data, input.persistence);
            break;
          case "meeting:speaker-alias:update":
            handleSpeakerAliasUpdate(ws, ctx, parsed.data, input.persistence);
            break;
          case "session:start":
            await handleSessionStart(ws, ctx, input.persistence);
            break;
          case "session:stop":
            handleSessionStop(ws, ctx, input.persistence);
            break;
          case "camera:frame":
            handleCameraFrame(ctx, parsed.data, input.persistence);
            break;
          case "image:model:set":
            handleImageModelSet(ws, ctx, parsed.data);
            break;
        }
      } catch (error) {
        console.error("[WS] Error parsing message:", error);
        send(ws, {
          type: "error",
          data: { message: "Invalid message format" },
        });
      }
    },

    close(ws) {
      const ctx = ws.data;
      cleanup(ctx);
      console.log(`[WS] Session closed: ${ctx.sessionId}`);
    },
  };
}
