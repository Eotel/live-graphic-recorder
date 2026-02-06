/**
 * Main server entry point with WebSocket support for live recording.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/*, src/types/messages.ts
 */

import { type ServerWebSocket, type Server } from "bun";
import { resolve, relative, isAbsolute } from "node:path";
import index from "./index.html";
import { DB_CONFIG, WS_CONFIG, UPLOAD_CONFIG } from "@/config/constants";
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
import {
  createGeminiService,
  getGeminiImageModelConfig,
  resolveGeminiImageModel,
  type GeneratedImage,
} from "./services/server/gemini";
import { createAnalysisService, type AnalysisService } from "./services/server/analysis";
import { PersistenceService } from "./services/server/persistence";
import { buildMeetingReportZipStream, ReportSizeLimitError } from "./services/server/report";
import { canBufferPendingAudio } from "./services/server/pending-audio-guard";
import {
  shouldTriggerMetaSummary,
  generateAndPersistMetaSummary,
} from "./services/server/meta-summary";
import {
  AudioUploadTooLargeError,
  EmptyAudioUploadError,
} from "./services/server/db/storage/file-storage";
import type { OpenAIService } from "./services/server/openai";
import { parseAllowedOrigins, validateWebSocketOrigin } from "./services/server/ws-origin";
import {
  buildSetCookie,
  createAccessToken,
  createRefreshToken,
  hashToken,
  normalizeEmail,
  parseCookies,
  resolveAuthSecret,
  validatePasswordComplexity,
  verifyToken,
} from "./services/server/auth";
import type { ImageModelPreset, ImageModelStatusMessage } from "./types/messages";

// Initialize persistence service
const persistence = new PersistenceService();

function buildContentDispositionAttachment(filename: string): string {
  const fallback =
    filename
      .replace(/[^\x20-\x7E]+/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "meeting-report.zip";

  const encoded = encodeURIComponent(filename).replace(/\*/g, "%2A");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

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
  userId: string;
  sessionId: string;
  meetingId: string | null;
  session: SessionState;
  deepgram: DeepgramService | null;
  analysis: AnalysisService | null;
  checkInterval: ReturnType<typeof setInterval> | null;
  imageModelPreset: ImageModelPreset;
  // Buffer for audio data received before Deepgram is ready
  pendingAudio: (ArrayBuffer | Buffer)[];
  pendingAudioBytes: number;
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

function parseContentLengthHeader(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

// Server configuration
const PORT = Number(process.env["PORT"]) || 3000;
const HOST = process.env["HOST"] || "127.0.0.1";
const WS_ALLOWED_ORIGINS = parseAllowedOrigins(process.env["WS_ALLOWED_ORIGINS"]);
const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

const { secret: AUTH_SECRET, usesFallback: isUsingFallbackAuthSecret } = resolveAuthSecret({
  AUTH_JWT_SECRET: process.env["AUTH_JWT_SECRET"],
  NODE_ENV: process.env["NODE_ENV"],
});

if (isUsingFallbackAuthSecret) {
  console.warn("[Auth] AUTH_JWT_SECRET is not set. Using an insecure development fallback secret.");
}

interface AuthUser {
  userId: string;
}

interface AuthRequestBody {
  email?: unknown;
  password?: unknown;
}

function shouldUseSecureCookies(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === "https:") {
    return true;
  }
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto && forwardedProto.split(",")[0]?.trim() === "https") {
    return true;
  }
  return process.env["NODE_ENV"] === "production";
}

function unauthorizedResponse(message = "Unauthorized"): Response {
  return new Response(message, { status: 401 });
}

async function parseAuthRequestBody(req: Request): Promise<{
  email: string;
  password: string;
} | null> {
  let body: AuthRequestBody;
  try {
    body = (await req.json()) as AuthRequestBody;
  } catch {
    return null;
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return null;
  }

  const email = normalizeEmail(body.email);
  if (!email || !email.includes("@")) {
    return null;
  }

  return {
    email,
    password: body.password,
  };
}

function getAuthenticatedUser(req: Request): AuthUser | null {
  const cookies = parseCookies(req.headers.get("cookie"));
  const accessToken = cookies[ACCESS_TOKEN_COOKIE];
  if (!accessToken) {
    return null;
  }

  const payload = verifyToken(accessToken, AUTH_SECRET);
  if (!payload || payload.type !== "access") {
    return null;
  }

  return { userId: payload.sub };
}

function requireAuthenticatedUser(req: Request): AuthUser | Response {
  const auth = getAuthenticatedUser(req);
  if (!auth) {
    return unauthorizedResponse();
  }
  return auth;
}

function setAuthCookies(
  headers: Headers,
  req: Request,
  accessToken: string,
  refreshToken: string,
): void {
  const secure = shouldUseSecureCookies(req);
  headers.append(
    "Set-Cookie",
    buildSetCookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: ACCESS_TOKEN_TTL_SEC,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildSetCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/api/auth",
      maxAge: REFRESH_TOKEN_TTL_SEC,
    }),
  );
}

function clearAuthCookies(headers: Headers, req: Request): void {
  const secure = shouldUseSecureCookies(req);
  headers.append(
    "Set-Cookie",
    buildSetCookie(ACCESS_TOKEN_COOKIE, "", {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: 0,
    }),
  );
  headers.append(
    "Set-Cookie",
    buildSetCookie(REFRESH_TOKEN_COOKIE, "", {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/api/auth",
      maxAge: 0,
    }),
  );
}

function issueSessionTokens(req: Request, userId: string): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const accessToken = createAccessToken(userId, AUTH_SECRET, ACCESS_TOKEN_TTL_SEC);
  const refresh = createRefreshToken(userId, AUTH_SECRET, REFRESH_TOKEN_TTL_SEC);
  persistence.createRefreshToken(userId, hashToken(refresh.token), refresh.expiresAtMs);
  setAuthCookies(headers, req, accessToken, refresh.token);
  return headers;
}

function buildAuthUserResponse(
  userId: string,
  email: string,
): { user: { id: string; email: string } } {
  return { user: { id: userId, email } };
}

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
    "/api/auth/signup": {
      POST: async (req: Request) => {
        const parsed = await parseAuthRequestBody(req);
        if (!parsed) {
          return new Response("Invalid request body", { status: 400 });
        }

        const passwordValidation = validatePasswordComplexity(parsed.password);
        if (!passwordValidation.valid) {
          return new Response(passwordValidation.reason ?? "Invalid password", { status: 400 });
        }

        const existing = persistence.getUserByEmail(parsed.email);
        if (existing) {
          return new Response("Email already in use", { status: 409 });
        }

        try {
          const passwordHash = await Bun.password.hash(parsed.password);
          const user = persistence.createUser(parsed.email, passwordHash);
          persistence.claimLegacyMeetingsForUser(user.id);

          const headers = issueSessionTokens(req, user.id);
          return new Response(JSON.stringify(buildAuthUserResponse(user.id, user.email)), {
            status: 201,
            headers,
          });
        } catch (error) {
          console.error("[Auth] Failed to sign up:", error);
          return new Response("Failed to create user", { status: 500 });
        }
      },
    },
    "/api/auth/login": {
      POST: async (req: Request) => {
        const parsed = await parseAuthRequestBody(req);
        if (!parsed) {
          return new Response("Invalid request body", { status: 400 });
        }

        const user = persistence.getUserByEmail(parsed.email);
        if (!user) {
          return new Response("Invalid credentials", { status: 401 });
        }

        const ok = await Bun.password.verify(parsed.password, user.passwordHash);
        if (!ok) {
          return new Response("Invalid credentials", { status: 401 });
        }

        persistence.claimLegacyMeetingsForUser(user.id);
        const headers = issueSessionTokens(req, user.id);
        return new Response(JSON.stringify(buildAuthUserResponse(user.id, user.email)), {
          status: 200,
          headers,
        });
      },
    },
    "/api/auth/refresh": {
      POST: (req: Request) => {
        const cookies = parseCookies(req.headers.get("cookie"));
        const refreshToken = cookies[REFRESH_TOKEN_COOKIE];
        if (!refreshToken) {
          const headers = new Headers();
          clearAuthCookies(headers, req);
          return new Response("Unauthorized", { status: 401, headers });
        }

        const payload = verifyToken(refreshToken, AUTH_SECRET);
        if (!payload || payload.type !== "refresh") {
          const headers = new Headers();
          clearAuthCookies(headers, req);
          return new Response("Unauthorized", { status: 401, headers });
        }

        const stored = persistence.getActiveRefreshTokenByHash(hashToken(refreshToken));
        if (!stored || stored.userId !== payload.sub) {
          const headers = new Headers();
          clearAuthCookies(headers, req);
          return new Response("Unauthorized", { status: 401, headers });
        }

        persistence.revokeRefreshToken(stored.id);
        const user = persistence.getUserById(stored.userId);
        if (!user) {
          const headers = new Headers();
          clearAuthCookies(headers, req);
          return new Response("Unauthorized", { status: 401, headers });
        }

        const headers = issueSessionTokens(req, user.id);
        return new Response(JSON.stringify(buildAuthUserResponse(user.id, user.email)), {
          status: 200,
          headers,
        });
      },
    },
    "/api/auth/logout": {
      POST: (req: Request) => {
        const cookies = parseCookies(req.headers.get("cookie"));
        const refreshToken = cookies[REFRESH_TOKEN_COOKIE];
        if (refreshToken) {
          const stored = persistence.getActiveRefreshTokenByHash(hashToken(refreshToken));
          if (stored) {
            persistence.revokeRefreshToken(stored.id);
          }
        }

        const headers = new Headers({ "Content-Type": "application/json" });
        clearAuthCookies(headers, req);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      },
    },
    "/api/auth/me": {
      GET: (req: Request) => {
        const auth = requireAuthenticatedUser(req);
        if (auth instanceof Response) {
          return auth;
        }

        const user = persistence.getUserById(auth.userId);
        if (!user) {
          return unauthorizedResponse();
        }

        return Response.json(buildAuthUserResponse(user.id, user.email));
      },
    },
    "/api/meetings/:meetingId/images/:imageId": async (req: Request) => {
      const auth = requireAuthenticatedUser(req);
      if (auth instanceof Response) {
        return auth;
      }

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
      const image = persistence.getImageByIdAndMeetingId(imageId, meetingId, auth.userId);
      if (!image) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile("images", image.filePath.replace(/^.*\/images\//, ""));
    },
    "/api/meetings/:meetingId/captures/:captureId": async (req: Request) => {
      const auth = requireAuthenticatedUser(req);
      if (auth instanceof Response) {
        return auth;
      }

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
      const capture = persistence.getCaptureByIdAndMeetingId(captureId, meetingId, auth.userId);
      if (!capture) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile("captures", capture.filePath.replace(/^.*\/captures\//, ""));
    },
    "/api/meetings/:meetingId/audio": {
      POST: async (req: Request) => {
        const auth = requireAuthenticatedUser(req);
        if (auth instanceof Response) {
          return auth;
        }

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
        const meeting = persistence.getMeeting(meetingId, auth.userId);
        if (!meeting) {
          return new Response("Meeting not found", { status: 404 });
        }

        // Validate content type
        const contentType = req.headers.get("content-type");
        if (!contentType || !contentType.includes("audio/webm")) {
          return new Response("Content-Type must be audio/webm", { status: 415 });
        }

        // Check file size (2 GB limit). Content-Length is optional; actual stream size is enforced.
        const maxAudioSize = UPLOAD_CONFIG.maxAudioUploadBytes;
        const contentLengthHeader = req.headers.get("content-length");
        if (contentLengthHeader) {
          const contentLength = parseContentLengthHeader(contentLengthHeader);
          if (contentLength === null) {
            return new Response("Invalid Content-Length header", { status: 400 });
          }
          if (contentLength > maxAudioSize) {
            return new Response("File too large", { status: 413 });
          }
        }

        // Get session ID from header
        const sessionId = req.headers.get("x-session-id");
        if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
          return new Response("Invalid or missing X-Session-Id header", { status: 400 });
        }

        // Verify session exists and belongs to meeting
        const persistedSession = persistence.getSessionByIdAndMeetingId(
          sessionId,
          meetingId,
          auth.userId,
        );
        if (!persistedSession) {
          return new Response("Session not found", { status: 404 });
        }

        if (!req.body) {
          return new Response("Empty body", { status: 400 });
        }

        try {
          const recording = await persistence.persistAudioRecordingFromStream(
            sessionId,
            meetingId,
            req.body,
            maxAudioSize,
          );

          return Response.json({
            id: recording.id,
            url: `/api/meetings/${meetingId}/audio/${recording.id}`,
          });
        } catch (error) {
          if (error instanceof EmptyAudioUploadError) {
            return new Response("Empty body", { status: 400 });
          }
          if (error instanceof AudioUploadTooLargeError) {
            return new Response("File too large", { status: 413 });
          }
          console.error("[API] Failed to save audio:", error);
          return new Response("Failed to save audio recording", { status: 500 });
        }
      },
    },
    "/api/meetings/:meetingId/audio/:audioId": async (req: Request) => {
      const auth = requireAuthenticatedUser(req);
      if (auth instanceof Response) {
        return auth;
      }

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

      const recording = persistence.getAudioRecordingByIdAndMeetingId(
        audioId,
        meetingId,
        auth.userId,
      );
      if (!recording) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile("audio", recording.filePath.replace(/^.*\/audio\//, ""));
    },
    "/api/meetings/:meetingId/report.zip": async (req: Request) => {
      const auth = requireAuthenticatedUser(req);
      if (auth instanceof Response) {
        return auth;
      }

      const url = new URL(req.url);
      const match = url.pathname.match(/^\/api\/meetings\/([^/]+)\/report\.zip$/);
      if (!match) {
        return new Response("Bad Request", { status: 400 });
      }
      const [, meetingId] = match;

      if (!meetingId || !isValidUUID(meetingId)) {
        return new Response("Invalid meeting ID", { status: 400 });
      }

      // Verify meeting exists
      const meeting = persistence.getMeeting(meetingId, auth.userId);
      if (!meeting) {
        return new Response("Meeting not found", { status: 404 });
      }

      try {
        const mediaParam = (url.searchParams.get("media") ?? "auto").toLowerCase();
        const includeMedia = mediaParam !== "none";
        const onMediaLimit = mediaParam === "strict" || mediaParam === "error" ? "error" : "skip";
        const includeCaptures = url.searchParams.get("captures") === "1";

        const { stream, filename, mediaBundle } = await buildMeetingReportZipStream(
          persistence,
          meetingId,
          {
            includeMedia,
            includeCaptures,
            onMediaLimit,
          },
        );
        return new Response(stream, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": buildContentDispositionAttachment(filename),
            "Cache-Control": "no-store",
            "X-Report-Media-Mode": mediaBundle.mode,
          },
        });
      } catch (error) {
        if (error instanceof ReportSizeLimitError) {
          console.warn(
            `[API] Report too large for meeting ${meetingId}: ${error.totalBytes} > ${error.maxBytes}`,
          );
          return new Response("Report too large to bundle media", { status: 413 });
        }
        console.error("[API] Failed to generate report:", error);
        return new Response("Failed to generate report", { status: 500 });
      }
    },
    "/ws/recording": (req: Request, server: Server<WSContext>) => {
      const originValidationResult = validateWebSocketOrigin(req, WS_ALLOWED_ORIGINS);
      if (!originValidationResult.ok) {
        console.warn(
          `[WS] Rejected upgrade by Origin validation (${originValidationResult.reason}): origin=${req.headers.get("origin") ?? "(missing)"}, url=${req.url}`,
        );
        return new Response("Forbidden", { status: 403 });
      }

      const auth = requireAuthenticatedUser(req);
      if (auth instanceof Response) {
        return auth;
      }

      const sessionId = generateSessionId();
      const success = server.upgrade(req, {
        data: {
          userId: auth.userId,
          sessionId,
          meetingId: null,
          session: createSession(sessionId),
          deepgram: null,
          analysis: null,
          checkInterval: null,
          imageModelPreset: "flash",
          pendingAudio: [],
          pendingAudioBytes: 0,
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
      send(ws, buildImageModelStatusMessage(ws.data));
      console.log(`[WS] Session opened: ${ws.data.sessionId}`);
    },

    async message(ws, message) {
      const ctx = ws.data;

      // Handle binary audio data
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
            // Buffer audio until Deepgram is ready (preserves WebM header)
            ctx.pendingAudio.push(message);
            ctx.pendingAudioBytes += incomingBytes;
          } else {
            console.warn(
              `[WS] Dropped pending audio chunk (${guardResult.reason}): session=${ctx.sessionId}, bytes=${incomingBytes}`,
            );
          }
        }
        // Drop audio if limits are exceeded to prevent DoS
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

          case "meeting:speaker-alias:update":
            handleSpeakerAliasUpdate(ws, ctx, parsed.data);
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

function speakerAliasArrayToMap(
  aliases: Array<{ speaker: number; displayName: string }>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const alias of aliases) {
    if (!Number.isInteger(alias.speaker) || alias.speaker < 0) continue;
    const displayName = alias.displayName.trim();
    if (!displayName) continue;
    result[String(alias.speaker)] = displayName;
  }
  return result;
}

function sendSpeakerAliases(
  ws: ServerWebSocket<WSContext>,
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

/**
 * Send meeting history data to the client when joining an existing meeting.
 */
function sendMeetingHistory(
  ws: ServerWebSocket<WSContext>,
  meetingId: string,
  userId: string,
): void {
  try {
    // Load all historical data
    const transcripts = persistence.loadMeetingTranscript(meetingId, userId);
    const analyses = persistence.loadMeetingAnalyses(meetingId, userId);
    const images = persistence.loadMeetingImages(meetingId, userId);
    const captures = persistence.loadMeetingCaptures(meetingId, userId);
    const metaSummaries = persistence.loadMetaSummaries(meetingId, userId);
    const speakerAliases = persistence.loadSpeakerAliases(meetingId, userId);

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
        speakerAliases: speakerAliasArrayToMap(speakerAliases),
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
      // Create new meeting
      const meeting = persistence.createMeeting(data.title, ctx.userId);
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
      sendMeetingHistory(ws, meetingId, ctx.userId);
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
    persistence.endMeeting(ctx.meetingId, ctx.userId);
    console.log(`[WS] Meeting ended: ${ctx.meetingId}`);
    ctx.meetingId = null;
  }
}

function handleMeetingListRequest(ws: ServerWebSocket<WSContext>): void {
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

  sendSpeakerAliases(ws, ctx.meetingId, ctx.userId);
}

async function handleSessionStart(ws: ServerWebSocket<WSContext>, ctx: WSContext): Promise<void> {
  try {
    // Create services
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
      ctx.pendingAudioBytes = 0;
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

function buildImageModelStatusMessage(ctx: WSContext): ImageModelStatusMessage {
  const config = getGeminiImageModelConfig();
  const model = resolveGeminiImageModel(ctx.imageModelPreset, config);
  return {
    type: "image:model:status",
    data: {
      preset: ctx.imageModelPreset,
      model,
      available: config,
    },
  };
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
    // Keep client in sync with current selection
    send(ws, buildImageModelStatusMessage(ctx));
    return;
  }

  ctx.imageModelPreset = preset;
  send(ws, buildImageModelStatusMessage(ctx));
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
