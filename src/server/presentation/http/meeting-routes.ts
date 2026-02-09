import { UPLOAD_CONFIG } from "@/config/constants";
import type { AuthService } from "@/server/application/auth";
import {
  badRequest,
  internalServerError,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
} from "@/server/presentation/http/errors";
import {
  requireAuthUser,
  requireOwnedMeeting,
  resolveMeetingReadOwnerUserId,
} from "@/server/presentation/http/guards";
import { serveMediaFile } from "@/server/presentation/http/media-file";
import {
  requireIntParam,
  requirePathMatch,
  requireUuidParam,
} from "@/server/presentation/http/params";
import {
  AudioUploadTooLargeError,
  EmptyAudioUploadError,
} from "@/services/server/db/storage/file-storage";
import { buildMeetingReportZipStream, ReportSizeLimitError } from "@/services/server/report";
import type { PersistenceService } from "@/services/server/persistence";
import { buildContentDispositionAttachment } from "@/server/domain/http/content-disposition";
import { parseContentLengthHeader } from "@/server/domain/http/content-length";

interface CreateMeetingRoutesInput {
  persistence: PersistenceService;
  auth: AuthService;
  mediaBasePath: string;
}

const IMAGE_PATH_PATTERN = /^\/api\/meetings\/([^/]+)\/images\/(\d+)$/;
const CAPTURE_PATH_PATTERN = /^\/api\/meetings\/([^/]+)\/captures\/(\d+)$/;
const AUDIO_UPLOAD_PATH_PATTERN = /^\/api\/meetings\/([^/]+)\/audio$/;
const AUDIO_DOWNLOAD_PATH_PATTERN = /^\/api\/meetings\/([^/]+)\/audio\/(\d+)$/;
const REPORT_PATH_PATTERN = /^\/api\/meetings\/([^/]+)\/report\.zip$/;

function extractPathParams(pathname: string, pattern: RegExp): RegExpMatchArray | Response {
  return requirePathMatch(pathname, pattern);
}

function extractMeetingId(pathname: string, pattern: RegExp): string | Response {
  const match = extractPathParams(pathname, pattern);
  if (match instanceof Response) {
    return match;
  }
  return requireUuidParam(match[1], "meeting ID");
}

function extractMeetingAndNumericId(
  pathname: string,
  pattern: RegExp,
  numericLabel: string,
):
  | {
      meetingId: string;
      numericId: number;
    }
  | Response {
  const match = extractPathParams(pathname, pattern);
  if (match instanceof Response) {
    return match;
  }

  const meetingId = requireUuidParam(match[1], "meeting ID");
  if (meetingId instanceof Response) {
    return meetingId;
  }

  const numericId = requireIntParam(match[2], numericLabel);
  if (numericId instanceof Response) {
    return numericId;
  }

  return {
    meetingId,
    numericId,
  };
}

export function createMeetingRoutes(input: CreateMeetingRoutesInput): Record<string, unknown> {
  return {
    "/api/meetings/:meetingId/images/:imageId": async (req: Request) => {
      const auth = requireAuthUser(input.auth, req);
      if (auth instanceof Response) {
        return auth;
      }
      const readOwnerUserId = resolveMeetingReadOwnerUserId(input.persistence, auth.userId);

      const url = new URL(req.url);
      const params = extractMeetingAndNumericId(url.pathname, IMAGE_PATH_PATTERN, "image ID");
      if (params instanceof Response) {
        return params;
      }

      const image = input.persistence.getImageByIdAndMeetingId(
        params.numericId,
        params.meetingId,
        readOwnerUserId,
      );
      if (!image) {
        return notFound();
      }

      return serveMediaFile(
        input.mediaBasePath,
        "images",
        image.filePath.replace(/^.*\/images\//, ""),
      );
    },

    "/api/meetings/:meetingId/captures/:captureId": async (req: Request) => {
      const auth = requireAuthUser(input.auth, req);
      if (auth instanceof Response) {
        return auth;
      }
      const readOwnerUserId = resolveMeetingReadOwnerUserId(input.persistence, auth.userId);

      const url = new URL(req.url);
      const params = extractMeetingAndNumericId(url.pathname, CAPTURE_PATH_PATTERN, "capture ID");
      if (params instanceof Response) {
        return params;
      }

      const capture = input.persistence.getCaptureByIdAndMeetingId(
        params.numericId,
        params.meetingId,
        readOwnerUserId,
      );
      if (!capture) {
        return notFound();
      }

      return serveMediaFile(
        input.mediaBasePath,
        "captures",
        capture.filePath.replace(/^.*\/captures\//, ""),
      );
    },

    "/api/meetings/:meetingId/audio": {
      GET: async (req: Request) => {
        const auth = requireAuthUser(input.auth, req);
        if (auth instanceof Response) {
          return auth;
        }
        const readOwnerUserId = resolveMeetingReadOwnerUserId(input.persistence, auth.userId);

        const url = new URL(req.url);
        const meetingId = extractMeetingId(url.pathname, AUDIO_UPLOAD_PATH_PATTERN);
        if (meetingId instanceof Response) {
          return meetingId;
        }

        const visibleMeeting = requireOwnedMeeting(input.persistence, meetingId, readOwnerUserId);
        if (visibleMeeting instanceof Response) {
          return visibleMeeting;
        }

        const recordings = input.persistence.listAudioRecordingsByMeeting(
          visibleMeeting.id,
          readOwnerUserId,
        );

        return Response.json({
          recordings: recordings.map((recording) => ({
            id: recording.id,
            sessionId: recording.sessionId,
            fileSizeBytes: recording.fileSizeBytes,
            createdAt: recording.createdAt,
            url: `/api/meetings/${visibleMeeting.id}/audio/${recording.id}`,
          })),
        });
      },

      POST: async (req: Request) => {
        const auth = requireAuthUser(input.auth, req);
        if (auth instanceof Response) {
          return auth;
        }

        const url = new URL(req.url);
        const meetingId = extractMeetingId(url.pathname, AUDIO_UPLOAD_PATH_PATTERN);
        if (meetingId instanceof Response) {
          return meetingId;
        }

        const ownedMeeting = requireOwnedMeeting(input.persistence, meetingId, auth.userId);
        if (ownedMeeting instanceof Response) {
          return ownedMeeting;
        }

        const contentType = req.headers.get("content-type");
        if (!contentType || !contentType.includes("audio/webm")) {
          return unsupportedMediaType("Content-Type must be audio/webm");
        }

        const maxAudioSize = UPLOAD_CONFIG.maxAudioUploadBytes;
        const contentLengthHeader = req.headers.get("content-length");
        if (contentLengthHeader) {
          const contentLength = parseContentLengthHeader(contentLengthHeader);
          if (contentLength === null) {
            return badRequest("Invalid Content-Length header");
          }
          if (contentLength > maxAudioSize) {
            return payloadTooLarge("File too large");
          }
        }

        const sessionId = req.headers.get("x-session-id");
        if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
          return badRequest("Invalid or missing X-Session-Id header");
        }

        const persistedSession = input.persistence.getSessionByIdAndMeetingId(
          sessionId,
          ownedMeeting.id,
          auth.userId,
        );
        if (!persistedSession) {
          return notFound("Session not found");
        }

        if (!req.body) {
          return badRequest("Empty body");
        }

        try {
          const recording = await input.persistence.persistAudioRecordingFromStream(
            sessionId,
            ownedMeeting.id,
            req.body,
            maxAudioSize,
          );

          return Response.json({
            id: recording.id,
            url: `/api/meetings/${ownedMeeting.id}/audio/${recording.id}`,
          });
        } catch (error) {
          if (error instanceof EmptyAudioUploadError) {
            return badRequest("Empty body");
          }
          if (error instanceof AudioUploadTooLargeError) {
            return payloadTooLarge("File too large");
          }

          console.error("[API] Failed to save audio:", error);
          return internalServerError("Failed to save audio recording");
        }
      },
    },

    "/api/meetings/:meetingId/audio/:audioId": async (req: Request) => {
      const auth = requireAuthUser(input.auth, req);
      if (auth instanceof Response) {
        return auth;
      }
      const readOwnerUserId = resolveMeetingReadOwnerUserId(input.persistence, auth.userId);

      const url = new URL(req.url);
      const params = extractMeetingAndNumericId(
        url.pathname,
        AUDIO_DOWNLOAD_PATH_PATTERN,
        "audio ID",
      );
      if (params instanceof Response) {
        return params;
      }

      const recording = input.persistence.getAudioRecordingByIdAndMeetingId(
        params.numericId,
        params.meetingId,
        readOwnerUserId,
      );
      if (!recording) {
        return notFound();
      }

      return serveMediaFile(
        input.mediaBasePath,
        "audio",
        recording.filePath.replace(/^.*\/audio\//, ""),
      );
    },

    "/api/meetings/:meetingId/report.zip": async (req: Request) => {
      const auth = requireAuthUser(input.auth, req);
      if (auth instanceof Response) {
        return auth;
      }
      const readOwnerUserId = resolveMeetingReadOwnerUserId(input.persistence, auth.userId);

      const url = new URL(req.url);
      const meetingId = extractMeetingId(url.pathname, REPORT_PATH_PATTERN);
      if (meetingId instanceof Response) {
        return meetingId;
      }

      const visibleMeeting = requireOwnedMeeting(input.persistence, meetingId, readOwnerUserId);
      if (visibleMeeting instanceof Response) {
        return visibleMeeting;
      }

      try {
        const mediaParam = (url.searchParams.get("media") ?? "auto").toLowerCase();
        const includeMedia = mediaParam !== "none";
        const onMediaLimit = mediaParam === "strict" || mediaParam === "error" ? "error" : "skip";
        const includeCaptures = url.searchParams.get("captures") === "1";

        const { stream, filename, mediaBundle } = await buildMeetingReportZipStream(
          input.persistence,
          visibleMeeting.id,
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
            `[API] Report too large for meeting ${visibleMeeting.id}: ${error.totalBytes} > ${error.maxBytes}`,
          );
          return payloadTooLarge("Report too large to bundle media");
        }
        console.error("[API] Failed to generate report:", error);
        return internalServerError("Failed to generate report");
      }
    },
  };
}
