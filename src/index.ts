/**
 * Main server entry point with WebSocket support for live recording.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/*, src/types/messages.ts
 */

import { serve, type ServerWebSocket } from "bun";
import index from "./index.html";
import type {
  ClientMessage,
  ServerMessage,
  SessionState,
  TranscriptSegment,
  AnalysisResult,
} from "./types/messages";
import {
  createSession,
  startSession,
  stopSession,
  addTranscript,
  markAnalysisComplete,
  addImage,
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
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function send(ws: ServerWebSocket<WSContext>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

const server = serve<WSContext>({
  routes: {
    // Serve index.html for all unmatched routes
    "/*": index,

    // API endpoints
    "/api/health": {
      GET: () => Response.json({ status: "ok", timestamp: Date.now() }),
    },
  },

  websocket: {
    open(ws) {
      const sessionId = generateSessionId();
      ws.data = {
        sessionId,
        session: createSession(sessionId),
        deepgram: null,
        analysis: null,
        checkInterval: null,
      };

      send(ws, {
        type: "session:status",
        data: { status: "idle" },
      });

      console.log(`[WS] Session opened: ${sessionId}`);
    },

    async message(ws, message) {
      const ctx = ws.data;

      // Handle binary audio data
      if (message instanceof ArrayBuffer || message instanceof Buffer) {
        if (ctx.deepgram?.isConnected()) {
          ctx.deepgram.sendAudio(message);
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
    });

    ctx.deepgram = createDeepgramService({
      onTranscript(segment: TranscriptSegment) {
        ctx.session = addTranscript(ctx.session, segment);
        send(ws, {
          type: "transcript",
          data: segment,
        });

        // Check if we should trigger analysis
        ctx.analysis?.checkAndTrigger(ctx.session);
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
