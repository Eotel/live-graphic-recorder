/**
 * Main server entry point with WebSocket support for live recording.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/*, src/types/messages.ts
 */

import { type ServerWebSocket, type Server } from "bun";
import { resolve, relative, isAbsolute } from "node:path";
import index from "./index.html";
import { DB_CONFIG, WS_CONFIG } from "@/config/constants";
import type {
  ClientMessage,
  ServerMessage,
  SessionState,
  TranscriptSegment,
  AnalysisResult,
  CameraFrame,
  GenerationPhase,
  MeetingHistoryMessage,
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
    const result = await generateAndPersistMetaSummary(persistence, meetingId, async (input) => {
      return openaiService.generateMetaSummary({
        analyses: input.analyses.map((a) => ({
          summary: a.summary,
          topics: a.topics,
          timestamp: a.timestamp,
        })),
        startTime: input.startTime,
        endTime: input.endTime,
      });
    });

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
  // UtteranceEnd can arrive before the final transcript is persisted; buffer and apply later.
  pendingUtteranceEndCount: number;
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function send(ws: ServerWebSocket<WSContext>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

/**
 * Sanitize error message for client consumption.
 * Avoids leaking internal details like file paths, stack traces, or API keys.
 */
function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected error occurred";
  }
  const msg = error.message;
  // Strip potential sensitive patterns
  if (
    msg.includes("/") ||
    msg.includes("\\") ||
    msg.includes("ENOENT") ||
    msg.includes("EACCES") ||
    msg.includes("api_key") ||
    msg.includes("API key")
  ) {
    return "An internal error occurred";
  }
  // Truncate long messages
  return msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
}

// Server configuration
const PORT = Number(process.env["PORT"]) || 3000;
const HOST = process.env["HOST"] || "127.0.0.1";

// Resolved media path for security validation
const MEDIA_BASE_PATH = resolve(DB_CONFIG.defaultMediaPath);

/**
 * Validate that a file path is within the allowed media directory.
 * Prevents path traversal attacks.
 */
function isPathWithinMediaDir(requestedPath: string): boolean {
  const resolvedPath = resolve(requestedPath);
  const rel = relative(MEDIA_BASE_PATH, resolvedPath);
  // Reject anything that escapes the base directory
  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith("../") ||
    rel.startsWith("..\\") ||
    isAbsolute(rel)
  ) {
    return false;
  }
  return true;
}

/**
 * Serve a static media file from the media directory.
 */
async function serveMediaFile(subdir: string, filePath: string): Promise<Response> {
  // Decode URL-encoded characters and construct full path
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(filePath);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const fullPath = resolve(MEDIA_BASE_PATH, subdir, decodedPath);

  // Security check: ensure path is within media directory
  if (!isPathWithinMediaDir(fullPath)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  // Determine content type based on extension
  const ext = fullPath.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webm"
          ? "audio/webm"
          : "application/octet-stream";

  return new Response(file, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// Create server with WebSocket support
const server = Bun.serve<WSContext>({
  port: PORT,
  hostname: HOST,
  routes: {
    "/": index,
    "/api/health": {
      GET: () => Response.json({ status: "ok", timestamp: Date.now() }),
    },
    "/api/meetings/:meetingId/images/:imageId": async (req: Request) => {
      const url = new URL(req.url);
      const match = url.pathname.match(/^\/api\/meetings\/([^/]+)\/images\/(\d+)$/);
      if (!match) {
        return new Response("Bad Request", { status: 400 });
      }
      const [, meetingId, imageIdStr] = match;
      const imageId = parseInt(imageIdStr!, 10);

      // Validate meeting ID format
      if (!meetingId || !isValidUUID(meetingId)) {
        return new Response("Invalid meeting ID", { status: 400 });
      }

      // Get image with meeting ownership validation
      const image = persistence.getImageByIdAndMeetingId(imageId, meetingId);
      if (!image) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile("images", image.filePath.replace(/^.*\/images\//, ""));
    },
    "/api/meetings/:meetingId/captures/:captureId": async (req: Request) => {
      const url = new URL(req.url);
      const match = url.pathname.match(/^\/api\/meetings\/([^/]+)\/captures\/(\d+)$/);
      if (!match) {
        return new Response("Bad Request", { status: 400 });
      }
      const [, meetingId, captureIdStr] = match;
      const captureId = parseInt(captureIdStr!, 10);

      // Validate meeting ID format
      if (!meetingId || !isValidUUID(meetingId)) {
        return new Response("Invalid meeting ID", { status: 400 });
      }

      // Get capture with meeting ownership validation
      const capture = persistence.getCaptureByIdAndMeetingId(captureId, meetingId);
      if (!capture) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile("captures", capture.filePath.replace(/^.*\/captures\//, ""));
    },
    "/api/meetings/:meetingId/audio": {
      POST: async (req: Request) => {
        const url = new URL(req.url);
        const match = url.pathname.match(/^\/api\/meetings\/([^/]+)\/audio$/);
        if (!match) {
          return new Response("Bad Request", { status: 400 });
        }
        const [, meetingId] = match;

        if (!meetingId || !isValidUUID(meetingId)) {
          return new Response("Invalid meeting ID", { status: 400 });
        }

        // Verify meeting exists
        const meeting = persistence.getMeeting(meetingId);
        if (!meeting) {
          return new Response("Meeting not found", { status: 404 });
        }

        // Validate content type
        const contentType = req.headers.get("content-type");
        if (!contentType || !contentType.includes("audio/webm")) {
          return new Response("Content-Type must be audio/webm", { status: 415 });
        }

        // Check file size (100 MB limit)
        const MAX_AUDIO_SIZE = 100 * 1024 * 1024;
        const contentLength = req.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_SIZE) {
          return new Response("File too large", { status: 413 });
        }

        // Get session ID from header
        const sessionId = req.headers.get("x-session-id");
        if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
          return new Response("Invalid or missing X-Session-Id header", { status: 400 });
        }

        // Verify session exists and belongs to meeting
        const persistedSession = persistence.getSessionByIdAndMeetingId(sessionId, meetingId);
        if (!persistedSession) {
          return new Response("Session not found", { status: 404 });
        }

        try {
          const buffer = await req.arrayBuffer();
          if (buffer.byteLength === 0) {
            return new Response("Empty body", { status: 400 });
          }
          if (buffer.byteLength > MAX_AUDIO_SIZE) {
            return new Response("File too large", { status: 413 });
          }

          const recording = await persistence.persistAudioRecording(sessionId, meetingId, buffer);

          return Response.json({
            id: recording.id,
            url: `/api/meetings/${meetingId}/audio/${recording.id}`,
          });
        } catch (error) {
          console.error("[API] Failed to save audio:", error);
          return new Response("Failed to save audio recording", { status: 500 });
        }
      },
    },
    "/api/meetings/:meetingId/audio/:audioId": async (req: Request) => {
      const url = new URL(req.url);
      const match = url.pathname.match(/^\/api\/meetings\/([^/]+)\/audio\/(\d+)$/);
      if (!match) {
        return new Response("Bad Request", { status: 400 });
      }
      const [, meetingId, audioIdStr] = match;
      const audioId = parseInt(audioIdStr!, 10);

      if (!meetingId || !isValidUUID(meetingId)) {
        return new Response("Invalid meeting ID", { status: 400 });
      }

      const recording = persistence.getAudioRecordingByIdAndMeetingId(audioId, meetingId);
      if (!recording) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile("audio", recording.filePath.replace(/^.*\/audio\//, ""));
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
          pendingUtteranceEndCount: 0,
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
        } else if (ctx.pendingAudio.length < WS_CONFIG.maxPendingAudioChunks) {
          // Buffer audio until Deepgram is ready (preserves WebM header)
          // Limit buffer size to prevent memory exhaustion
          ctx.pendingAudio.push(message);
        }
        // Drop audio if buffer is full to prevent DoS
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

/**
 * Generate a meeting-scoped URL for an image.
 */
function imageToUrl(meetingId: string, imageId: number): string {
  return `/api/meetings/${meetingId}/images/${imageId}`;
}

/**
 * Generate a meeting-scoped URL for a capture.
 */
function captureToUrl(meetingId: string, captureId: number): string {
  return `/api/meetings/${meetingId}/captures/${captureId}`;
}

/**
 * Send meeting history data to the client when joining an existing meeting.
 */
function sendMeetingHistory(ws: ServerWebSocket<WSContext>, meetingId: string): void {
  try {
    // Load all historical data
    const transcripts = persistence.loadMeetingTranscript(meetingId);
    const analyses = persistence.loadMeetingAnalyses(meetingId);
    const images = persistence.loadMeetingImages(meetingId);
    const captures = persistence.loadMeetingCaptures(meetingId);
    const metaSummaries = persistence.loadMetaSummaries(meetingId);

    const historyMessage: MeetingHistoryMessage = {
      type: "meeting:history",
      data: {
        transcripts: transcripts.map((t) => ({
          text: t.text,
          timestamp: t.timestamp,
          isFinal: t.isFinal,
          speaker: t.speaker ?? undefined,
          startTime: t.startTime ?? undefined,
          isUtteranceEnd: t.isUtteranceEnd ?? undefined,
        })),
        analyses: analyses.map((a) => ({
          summary: a.summary,
          topics: a.topics,
          tags: a.tags,
          flow: a.flow,
          heat: a.heat,
          timestamp: a.timestamp,
        })),
        images: images.map((img) => ({
          url: imageToUrl(meetingId, img.id),
          prompt: img.prompt,
          timestamp: img.timestamp,
        })),
        captures: captures.map((cap) => ({
          url: captureToUrl(meetingId, cap.id),
          timestamp: cap.timestamp,
        })),
        metaSummaries: metaSummaries.map((ms) => ({
          summary: ms.summary,
          themes: ms.themes,
          startTime: ms.startTime,
          endTime: ms.endTime,
        })),
      },
    };

    send(ws, historyMessage);
    console.log(
      `[WS] Sent meeting history: ${transcripts.length} transcripts, ${analyses.length} analyses, ${images.length} images, ${captures.length} captures`,
    );
  } catch (error) {
    console.error("[WS] Failed to send meeting history:", error);
    send(ws, {
      type: "error",
      data: { message: "Failed to load meeting history" },
    });
  }
}

function handleMeetingStart(
  ws: ServerWebSocket<WSContext>,
  ctx: WSContext,
  data: { title?: string; meetingId?: string },
): void {
  try {
    let meetingId: string;
    let title: string | undefined;
    let isExistingMeeting = false;

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
      isExistingMeeting = true;
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

    // Send historical data for existing meetings
    if (isExistingMeeting) {
      sendMeetingHistory(ws, meetingId);
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

          // If an UtteranceEnd was received before we had any persisted final segment,
          // apply it now to the latest persisted final segment.
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

        // Check if we should trigger analysis
        ctx.analysis?.checkAndTrigger(ctx.session);
      },
      onUtteranceEnd(timestamp: number) {
        ctx.session = markUtteranceEnd(ctx.session);
        send(ws, {
          type: "utterance:end",
          data: { timestamp },
        });

        // Persist utterance end marker to database
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
        error: sanitizeErrorMessage(error),
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

  console.log(
    `[WS] Camera frame received: ${ctx.sessionId}, frames: ${ctx.session.cameraFrames.length}`,
  );
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
