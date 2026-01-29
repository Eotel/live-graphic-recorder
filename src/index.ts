/**
 * Main server entry point with WebSocket support for live recording.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/*, src/types/messages.ts
 */

import { type ServerWebSocket, type Server } from "bun";
import index from "./index.html";
import type {
  ClientMessage,
  ServerMessage,
  SessionState,
  TranscriptSegment,
  AnalysisResult,
  CameraFrame,
  GenerationPhase,
} from "./types/messages";
import {
  createSession,
  startSession,
  stopSession,
  addTranscript,
  markUtteranceEnd,
  markAnalysisComplete,
  addImage,
  addCameraFrame,
} from "./services/server/session";
import { createDeepgramService, type DeepgramService } from "./services/server/deepgram";
import { createOpenAIService } from "./services/server/openai";
import { createGeminiService, type GeneratedImage } from "./services/server/gemini";
import { createAnalysisService, type AnalysisService } from "./services/server/analysis";
import { PersistenceService } from "./services/server/persistence";
import {
  shouldTriggerMetaSummary,
  generateAndPersistMetaSummary,
} from "./services/server/meta-summary";
import type { OpenAIService } from "./services/server/openai";

// Initialize persistence service
const persistence = new PersistenceService();

/**
 * Check if a meta-summary should be generated and generate it if so.
 */
async function checkAndGenerateMetaSummary(
  meetingId: string,
  openaiService: OpenAIService,
): Promise<void> {
  if (!shouldTriggerMetaSummary(persistence, meetingId)) {
    return;
  }

  console.log(`[MetaSummary] Triggering meta-summary generation for meeting: ${meetingId}`);

  try {
    const result = await generateAndPersistMetaSummary(
      persistence,
      meetingId,
      async (input) => {
        return openaiService.generateMetaSummary({
          analyses: input.analyses.map((a) => ({
            summary: a.summary,
            topics: a.topics,
            timestamp: a.timestamp,
          })),
          startTime: input.startTime,
          endTime: input.endTime,
        });
      },
    );

    if (result) {
      console.log(
        `[MetaSummary] Generated meta-summary: ${result.summary.length} points, ${result.themes.length} themes`,
      );
    }
  } catch (error) {
    console.error("[MetaSummary] Failed to generate meta-summary:", error);
  }
}

// Session context per WebSocket connection
interface WSContext {
  sessionId: string;
  meetingId: string | null;
  session: SessionState;
  deepgram: DeepgramService | null;
  analysis: AnalysisService | null;
  checkInterval: ReturnType<typeof setInterval> | null;
  // Buffer for audio data received before Deepgram is ready
  pendingAudio: (ArrayBuffer | Buffer)[];
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function send(ws: ServerWebSocket<WSContext>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

// Server configuration
const PORT = Number(process.env["PORT"]) || 3000;
const HOST = process.env["HOST"] || "0.0.0.0";

// Create server with WebSocket support
const server = Bun.serve<WSContext>({
  port: PORT,
  hostname: HOST,
  routes: {
    "/": index,
    "/api/health": {
      GET: () => Response.json({ status: "ok", timestamp: Date.now() }),
    },
    "/ws/recording": (req: Request, server: Server<WSContext>) => {
      const sessionId = generateSessionId();
      const success = server.upgrade(req, {
        data: {
          sessionId,
          meetingId: null,
          session: createSession(sessionId),
          deepgram: null,
          analysis: null,
          checkInterval: null,
          pendingAudio: [],
        } satisfies WSContext,
      });
      if (success) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    },
    "/*": index, // Fallback for SPA routing
  },

  websocket: {
    open(ws) {
      send(ws, {
        type: "session:status",
        data: { status: "idle" },
      });
      console.log(`[WS] Session opened: ${ws.data.sessionId}`);
    },

    async message(ws, message) {
      const ctx = ws.data;

      // Handle binary audio data
      if (message instanceof ArrayBuffer || message instanceof Buffer) {
        if (ctx.deepgram?.isConnected()) {
          ctx.deepgram.sendAudio(message);
        } else {
          // Buffer audio until Deepgram is ready (preserves WebM header)
          ctx.pendingAudio.push(message);
        }
        return;
      }

      // Handle JSON control messages
      try {
        const parsed = JSON.parse(String(message)) as ClientMessage;

        switch (parsed.type) {
          case "meeting:start":
            handleMeetingStart(ws, ctx, parsed.data);
            break;

          case "meeting:stop":
            handleMeetingStop(ws, ctx);
            break;

          case "meeting:list:request":
            handleMeetingListRequest(ws);
            break;

          case "meeting:update":
            handleMeetingUpdate(ws, ctx, parsed.data);
            break;

          case "session:start":
            await handleSessionStart(ws, ctx);
            break;

          case "session:stop":
            handleSessionStop(ws, ctx);
            break;

          case "camera:frame":
            handleCameraFrame(ctx, parsed.data);
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
  },

  development: process.env["NODE_ENV"] !== "production" && {
    hmr: true,
    console: true,
  },
});

// UUID validation pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_PATTERN.test(id);
}

function handleMeetingStart(
  ws: ServerWebSocket<WSContext>,
  ctx: WSContext,
  data: { title?: string; meetingId?: string },
): void {
  try {
    let meetingId: string;
    let title: string | undefined;

    if (data.meetingId) {
      // Validate meetingId format
      if (!isValidUUID(data.meetingId)) {
        send(ws, {
          type: "error",
          data: { message: "Invalid meeting ID format", code: "INVALID_MEETING_ID" },
        });
        return;
      }

      // Join existing meeting
      const existing = persistence.getMeeting(data.meetingId);
      if (!existing) {
        send(ws, {
          type: "error",
          data: { message: "Meeting not found", code: "MEETING_NOT_FOUND" },
        });
        return;
      }
      meetingId = existing.id;
      title = existing.title ?? undefined;
    } else {
      // Create new meeting
      const meeting = persistence.createMeeting(data.title);
      meetingId = meeting.id;
      title = meeting.title ?? undefined;
    }

    ctx.meetingId = meetingId;

    // Create persistent session
    persistence.createSession(meetingId, ctx.sessionId);

    send(ws, {
      type: "meeting:status",
      data: { meetingId, title, sessionId: ctx.sessionId },
    });

    console.log(`[WS] Meeting started: ${meetingId}, session: ${ctx.sessionId}`);
  } catch (error) {
    console.error("[WS] Failed to start meeting:", error);
    send(ws, {
      type: "error",
      data: { message: "Failed to start meeting" },
    });
  }
}

function handleMeetingStop(ws: ServerWebSocket<WSContext>, ctx: WSContext): void {
  if (ctx.meetingId) {
    persistence.endMeeting(ctx.meetingId);
    console.log(`[WS] Meeting ended: ${ctx.meetingId}`);
    ctx.meetingId = null;
  }
}

function handleMeetingListRequest(ws: ServerWebSocket<WSContext>): void {
  const meetings = persistence.listMeetings(50);
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
): void {
  if (!ctx.meetingId) {
    send(ws, {
      type: "error",
      data: { message: "No active meeting to update", code: "NO_ACTIVE_MEETING" },
    });
    return;
  }

  try {
    persistence.updateMeetingTitle(ctx.meetingId, data.title);

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

async function handleSessionStart(ws: ServerWebSocket<WSContext>, ctx: WSContext): Promise<void> {
  try {
    // Create services
    const openaiService = createOpenAIService();
    const geminiService = createGeminiService();

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
          // Persist analysis
          if (ctx.meetingId) {
            persistence.persistAnalysis(ctx.sessionId, analysis).catch((err) => {
              console.error("[Persistence] Failed to persist analysis:", err);
            });

            // Check if we should generate a meta-summary
            checkAndGenerateMetaSummary(ctx.meetingId, openaiService);
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
        // Persist image
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
          data: { message: error.message },
        });
      },
      onPhaseChange(phase: GenerationPhase, retryAttempt?: number) {
          send(ws, {
            type: "generation:status",
            data: { phase, retryAttempt },
          });
        },
      },
      // Options for hierarchical context
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

        // Persist transcript (only final segments)
        if (ctx.meetingId && segment.isFinal) {
          persistence.persistTranscript(ctx.sessionId, segment);
        }

        // Check if we should trigger analysis
        ctx.analysis?.checkAndTrigger(ctx.session);
      },
      onUtteranceEnd(timestamp: number) {
        ctx.session = markUtteranceEnd(ctx.session);
        send(ws, {
          type: "utterance:end",
          data: { timestamp },
        });
      },
      onError(error: Error) {
        console.error("[Deepgram] Error:", error);
        send(ws, {
          type: "error",
          data: { message: error.message },
        });
      },
      onClose() {
        console.log("[Deepgram] Connection closed");
      },
    });

    await ctx.deepgram.start();

    // Flush any buffered audio data (including WebM header)
    if (ctx.pendingAudio.length > 0) {
      for (const audio of ctx.pendingAudio) {
        ctx.deepgram.sendAudio(audio);
      }
      ctx.pendingAudio.length = 0;
    }

    ctx.session = startSession(ctx.session);

    // Update persistence
    if (ctx.meetingId) {
      persistence.startSession(ctx.sessionId);
    }

    // Periodic analysis check (in case words are few but time has passed)
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
        error: error instanceof Error ? error.message : "Failed to start",
      },
    });
  }
}

function handleSessionStop(ws: ServerWebSocket<WSContext>, ctx: WSContext): void {
  cleanup(ctx);
  ctx.session = stopSession(ctx.session);

  // Update persistence
  if (ctx.meetingId) {
    persistence.stopSession(ctx.sessionId);
  }

  send(ws, {
    type: "session:status",
    data: { status: "idle" },
  });

  console.log(`[WS] Recording stopped: ${ctx.sessionId}`);
}

function handleCameraFrame(ctx: WSContext, frame: CameraFrame): void {
  ctx.session = addCameraFrame(ctx.session, frame);

  // Persist camera frame
  if (ctx.meetingId) {
    persistence.persistCameraFrame(ctx.sessionId, frame).catch((err) => {
      console.error("[Persistence] Failed to persist camera frame:", err);
    });
  }

  console.log(`[WS] Camera frame received: ${ctx.sessionId}, frames: ${ctx.session.cameraFrames.length}`);
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

console.log(`Server running at ${server.url}`);
