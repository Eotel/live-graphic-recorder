import { UPLOAD_CONFIG } from "@/config/constants";
import { isValidUUID } from "@/server/domain/common/id";
import { buildContentDispositionAttachment } from "@/server/domain/http/content-disposition";
import { parseContentLengthHeader } from "@/server/domain/http/content-length";
import type { AuthService } from "@/server/application/auth";
import { serveMediaFile } from "@/server/presentation/http/media-file";
import { buildMeetingReportZipStream, ReportSizeLimitError } from "@/services/server/report";
import type { PersistenceService } from "@/services/server/persistence";
import {
  AudioUploadTooLargeError,
  EmptyAudioUploadError,
} from "@/services/server/db/storage/file-storage";

interface CreateMeetingRoutesInput {
  persistence: PersistenceService;
  auth: AuthService;
  mediaBasePath: string;
}

export function createMeetingRoutes(input: CreateMeetingRoutesInput): Record<string, unknown> {
  return {
    "/api/meetings/:meetingId/images/:imageId": async (req: Request) => {
      const auth = input.auth.requireAuthenticatedUser(req);
      if (auth instanceof Response) {
        return auth;
      }

      const url = new URL(req.url);
      const match = url.pathname.match(/^\/api\/meetings\/([^/]+)\/images\/(\d+)$/);
      if (!match) {
        return new Response("Bad Request", { status: 400 });
      }

      const [, meetingId, imageIdStr] = match;
      const imageId = Number.parseInt(imageIdStr!, 10);

      if (!meetingId || !isValidUUID(meetingId)) {
        return new Response("Invalid meeting ID", { status: 400 });
      }

      const image = input.persistence.getImageByIdAndMeetingId(imageId, meetingId, auth.userId);
      if (!image) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile(
        input.mediaBasePath,
        "images",
        image.filePath.replace(/^.*\/images\//, ""),
      );
    },

    "/api/meetings/:meetingId/captures/:captureId": async (req: Request) => {
      const auth = input.auth.requireAuthenticatedUser(req);
      if (auth instanceof Response) {
        return auth;
      }

      const url = new URL(req.url);
      const match = url.pathname.match(/^\/api\/meetings\/([^/]+)\/captures\/(\d+)$/);
      if (!match) {
        return new Response("Bad Request", { status: 400 });
      }

      const [, meetingId, captureIdStr] = match;
      const captureId = Number.parseInt(captureIdStr!, 10);

      if (!meetingId || !isValidUUID(meetingId)) {
        return new Response("Invalid meeting ID", { status: 400 });
      }

      const capture = input.persistence.getCaptureByIdAndMeetingId(
        captureId,
        meetingId,
        auth.userId,
      );
      if (!capture) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile(
        input.mediaBasePath,
        "captures",
        capture.filePath.replace(/^.*\/captures\//, ""),
      );
    },

    "/api/meetings/:meetingId/audio": {
      POST: async (req: Request) => {
        const auth = input.auth.requireAuthenticatedUser(req);
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

        const meeting = input.persistence.getMeeting(meetingId, auth.userId);
        if (!meeting) {
          return new Response("Meeting not found", { status: 404 });
        }

        const contentType = req.headers.get("content-type");
        if (!contentType || !contentType.includes("audio/webm")) {
          return new Response("Content-Type must be audio/webm", { status: 415 });
        }

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

        const sessionId = req.headers.get("x-session-id");
        if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
          return new Response("Invalid or missing X-Session-Id header", { status: 400 });
        }

        const persistedSession = input.persistence.getSessionByIdAndMeetingId(
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
          const recording = await input.persistence.persistAudioRecordingFromStream(
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
      const auth = input.auth.requireAuthenticatedUser(req);
      if (auth instanceof Response) {
        return auth;
      }

      const url = new URL(req.url);
      const match = url.pathname.match(/^\/api\/meetings\/([^/]+)\/audio\/(\d+)$/);
      if (!match) {
        return new Response("Bad Request", { status: 400 });
      }

      const [, meetingId, audioIdStr] = match;
      const audioId = Number.parseInt(audioIdStr!, 10);

      if (!meetingId || !isValidUUID(meetingId)) {
        return new Response("Invalid meeting ID", { status: 400 });
      }

      const recording = input.persistence.getAudioRecordingByIdAndMeetingId(
        audioId,
        meetingId,
        auth.userId,
      );
      if (!recording) {
        return new Response("Not Found", { status: 404 });
      }

      return serveMediaFile(
        input.mediaBasePath,
        "audio",
        recording.filePath.replace(/^.*\/audio\//, ""),
      );
    },

    "/api/meetings/:meetingId/report.zip": async (req: Request) => {
      const auth = input.auth.requireAuthenticatedUser(req);
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

      const meeting = input.persistence.getMeeting(meetingId, auth.userId);
      if (!meeting) {
        return new Response("Meeting not found", { status: 404 });
      }

      try {
        const mediaParam = (url.searchParams.get("media") ?? "auto").toLowerCase();
        const includeMedia = mediaParam !== "none";
        const onMediaLimit = mediaParam === "strict" || mediaParam === "error" ? "error" : "skip";
        const includeCaptures = url.searchParams.get("captures") === "1";

        const { stream, filename, mediaBundle } = await buildMeetingReportZipStream(
          input.persistence,
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
  };
}
