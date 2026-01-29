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

// Session context per WebSocket connection
interface WSContext {
  sessionId: string;
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

// Create server with WebSocket support
const server = Bun.serve<WSContext>({
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

async function handleSessionStart(ws: ServerWebSocket<WSContext>, ctx: WSContext): Promise<void> {
  try {
    // Create services
    const openaiService = createOpenAIService();
    const geminiService = createGeminiService();

    ctx.analysis = createAnalysisService(openaiService, geminiService, {
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
    });

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

  send(ws, {
    type: "session:status",
    data: { status: "idle" },
  });

  console.log(`[WS] Recording stopped: ${ctx.sessionId}`);
}

function handleCameraFrame(ctx: WSContext, frame: CameraFrame): void {
  ctx.session = addCameraFrame(ctx.session, frame);
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
