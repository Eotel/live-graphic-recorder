import type { ServerWebSocket } from "bun";
import { isValidUUID } from "@/server/domain/common/id";
import {
  buildMeetingHistoryDeltaMessage,
  buildMeetingHistoryMessage,
} from "@/server/domain/meeting/history-mapper";
import { speakerAliasArrayToMap } from "@/server/domain/meeting/speaker-alias";
import { send } from "@/server/presentation/ws/sender";
import type { WSContext } from "@/server/types/context";
import type { RecordingLockManager } from "@/server/application/ws/recording-lock-manager";
import type { PersistenceService } from "@/services/server/persistence";
import type { MeetingHistoryCursor, MeetingMode } from "@/types/messages";

interface CreateMeetingWsUsecaseInput {
  persistence: PersistenceService;
  recordingLocks: RecordingLockManager;
}

export interface MeetingWsUsecase {
  start: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
  stop: (ctx: WSContext) => void;
  list: (ws: ServerWebSocket<WSContext>) => void;
  update: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
  updateSpeakerAlias: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
  setMode: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
  requestHistoryDelta: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
  releaseRecordingLock: (ctx: WSContext) => void;
}

function readMeetingStartData(data: unknown): {
  title?: string;
  meetingId?: string;
  mode?: MeetingMode;
} | null {
  if (typeof data === "undefined") {
    return {};
  }
  if (!data || typeof data !== "object") {
    return null;
  }

  const title = (data as { title?: unknown }).title;
  const meetingId = (data as { meetingId?: unknown }).meetingId;
  const mode = (data as { mode?: unknown }).mode;
  if (typeof title !== "undefined" && typeof title !== "string") {
    return null;
  }
  if (typeof meetingId !== "undefined" && typeof meetingId !== "string") {
    return null;
  }
  if (typeof mode !== "undefined" && mode !== "record" && mode !== "view") {
    return null;
  }

  return {
    title,
    meetingId,
    mode,
  };
}

function readMeetingUpdateData(data: unknown): {
  title: string;
} | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const title = (data as { title?: unknown }).title;
  if (typeof title !== "string") {
    return null;
  }
  return { title };
}

function readMeetingModeSetData(data: unknown): {
  mode: MeetingMode;
} | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const mode = (data as { mode?: unknown }).mode;
  if (mode !== "record" && mode !== "view") {
    return null;
  }
  return { mode };
}

function readMeetingHistoryCursor(data: unknown): MeetingHistoryCursor | null {
  if (typeof data === "undefined") {
    return {};
  }
  if (!data || typeof data !== "object") {
    return null;
  }

  const cursorValue = (data as { cursor?: unknown }).cursor;
  if (typeof cursorValue === "undefined") {
    return {};
  }
  if (!cursorValue || typeof cursorValue !== "object") {
    return null;
  }

  const cursor = cursorValue as {
    transcriptTs?: unknown;
    analysisTs?: unknown;
    imageTs?: unknown;
    captureTs?: unknown;
    metaSummaryEndTs?: unknown;
  };

  const parsed: MeetingHistoryCursor = {};
  const numericKeys: Array<keyof MeetingHistoryCursor> = [
    "transcriptTs",
    "analysisTs",
    "imageTs",
    "captureTs",
    "metaSummaryEndTs",
  ];

  for (const key of numericKeys) {
    const value = cursor[key];
    if (typeof value === "undefined") continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    parsed[key] = value;
  }

  return parsed;
}

function readMeetingHistoryRequestData(data: unknown): {
  meetingId: string;
  cursor: MeetingHistoryCursor;
} | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const meetingId = (data as { meetingId?: unknown }).meetingId;
  if (typeof meetingId !== "string") {
    return null;
  }

  const cursor = readMeetingHistoryCursor(data);
  if (!cursor) {
    return null;
  }

  return {
    meetingId,
    cursor,
  };
}

function resolveMeetingReadOwnerUserId(
  persistence: PersistenceService,
  userId: string,
): string | undefined {
  const user = persistence.getUserById(userId);
  if (user?.role === "admin") {
    return undefined;
  }
  return userId;
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
  ownerUserId?: string,
): void {
  try {
    const message = buildMeetingHistoryMessage(meetingId, {
      transcripts: persistence.loadMeetingTranscript(meetingId, ownerUserId),
      analyses: persistence.loadMeetingAnalyses(meetingId, ownerUserId),
      images: persistence.loadMeetingImages(meetingId, ownerUserId),
      captures: persistence.loadMeetingCaptures(meetingId, ownerUserId),
      metaSummaries: persistence.loadMetaSummaries(meetingId, ownerUserId),
      speakerAliases: persistence.loadSpeakerAliases(meetingId, ownerUserId),
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

function sendMeetingHistoryDelta(
  ws: ServerWebSocket<WSContext>,
  persistence: PersistenceService,
  meetingId: string,
  ownerUserId: string | undefined,
  cursor: MeetingHistoryCursor,
): void {
  try {
    const transcripts = persistence
      .loadMeetingTranscript(meetingId, ownerUserId)
      .filter(
        (item) => typeof cursor.transcriptTs !== "number" || item.timestamp > cursor.transcriptTs,
      );
    const analyses = persistence
      .loadMeetingAnalyses(meetingId, ownerUserId)
      .filter(
        (item) => typeof cursor.analysisTs !== "number" || item.timestamp > cursor.analysisTs,
      );
    const images = persistence
      .loadMeetingImages(meetingId, ownerUserId)
      .filter((item) => typeof cursor.imageTs !== "number" || item.timestamp > cursor.imageTs);
    const captures = persistence
      .loadMeetingCaptures(meetingId, ownerUserId)
      .filter((item) => typeof cursor.captureTs !== "number" || item.timestamp > cursor.captureTs);
    const metaSummaries = persistence
      .loadMetaSummaries(meetingId, ownerUserId)
      .filter(
        (item) =>
          typeof cursor.metaSummaryEndTs !== "number" || item.endTime > cursor.metaSummaryEndTs,
      );

    const message = buildMeetingHistoryDeltaMessage(meetingId, {
      transcripts,
      analyses,
      images,
      captures,
      metaSummaries,
      speakerAliases: persistence.loadSpeakerAliases(meetingId, ownerUserId),
    });

    send(ws, message);
  } catch (error) {
    console.error("[WS] Failed to send meeting history delta:", error);
    send(ws, {
      type: "error",
      data: { message: "Failed to load meeting history delta" },
    });
  }
}

function sendMeetingStatus(
  ws: ServerWebSocket<WSContext>,
  data: { meetingId: string; title?: string; sessionId: string; mode: MeetingMode },
): void {
  send(ws, {
    type: "meeting:status",
    data,
  });
}

function resolveMeetingMode(isExistingMeeting: boolean, requestedMode?: MeetingMode): MeetingMode {
  if (requestedMode === "record" || requestedMode === "view") {
    return requestedMode;
  }
  return isExistingMeeting ? "view" : "record";
}

function sendReadOnlyError(ws: ServerWebSocket<WSContext>): void {
  send(ws, {
    type: "error",
    data: {
      message: "This meeting is in read-only mode",
      code: "READ_ONLY_MEETING",
    },
  });
}

export function createMeetingWsUsecase(input: CreateMeetingWsUsecaseInput): MeetingWsUsecase {
  const { persistence, recordingLocks } = input;

  function start(ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown): void {
    const parsedData = readMeetingStartData(data);
    if (!parsedData) {
      send(ws, {
        type: "error",
        data: { message: "Invalid meeting payload", code: "INVALID_MEETING_PAYLOAD" },
      });
      return;
    }

    try {
      let meetingId: string;
      let title: string | undefined;
      let isExistingMeeting = false;
      let readOwnerUserId: string | undefined = ctx.userId;

      if (parsedData.meetingId) {
        if (!isValidUUID(parsedData.meetingId)) {
          send(ws, {
            type: "error",
            data: { message: "Invalid meeting ID format", code: "INVALID_MEETING_ID" },
          });
          return;
        }

        readOwnerUserId = resolveMeetingReadOwnerUserId(persistence, ctx.userId);
        const existing = persistence.getMeeting(parsedData.meetingId, readOwnerUserId);
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
        const meeting = persistence.createMeeting(parsedData.title, ctx.userId);
        meetingId = meeting.id;
        title = meeting.title ?? undefined;
      }

      const mode = resolveMeetingMode(isExistingMeeting, parsedData.mode);
      if (mode === "record" && recordingLocks.isLockedByAnother(meetingId, ctx.sessionId)) {
        send(ws, {
          type: "error",
          data: {
            message: "Another user is already recording this meeting",
            code: "MEETING_ALREADY_RECORDING",
          },
        });
        return;
      }

      ctx.meetingId = meetingId;
      ctx.meetingMode = mode;
      persistence.createSession(meetingId, ctx.sessionId);

      sendMeetingStatus(ws, {
        meetingId,
        title,
        sessionId: ctx.sessionId,
        mode,
      });

      if (isExistingMeeting) {
        sendMeetingHistory(ws, persistence, meetingId, readOwnerUserId);
      }

      console.log(`[WS] Meeting started: ${meetingId}, mode: ${mode}, session: ${ctx.sessionId}`);
    } catch (error) {
      console.error("[WS] Failed to start meeting:", error);
      send(ws, {
        type: "error",
        data: { message: "Failed to start meeting" },
      });
    }
  }

  function stop(ctx: WSContext): void {
    if (ctx.meetingId) {
      recordingLocks.release(ctx.meetingId, ctx.sessionId);
      persistence.endMeeting(ctx.meetingId, ctx.userId);
      console.log(`[WS] Meeting ended: ${ctx.meetingId}`);
      ctx.meetingId = null;
      ctx.meetingMode = null;
    }
  }

  function list(ws: ServerWebSocket<WSContext>): void {
    const readOwnerUserId = resolveMeetingReadOwnerUserId(persistence, ws.data.userId);
    const meetings = persistence.listMeetings(50, readOwnerUserId);
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

  function update(ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown): void {
    if (!ctx.meetingId) {
      send(ws, {
        type: "error",
        data: { message: "No active meeting to update", code: "NO_ACTIVE_MEETING" },
      });
      return;
    }

    if (ctx.meetingMode !== "record") {
      sendReadOnlyError(ws);
      return;
    }

    const parsedData = readMeetingUpdateData(data);
    if (!parsedData) {
      send(ws, {
        type: "error",
        data: { message: "Invalid meeting update payload", code: "INVALID_MEETING_PAYLOAD" },
      });
      return;
    }

    try {
      const updated = persistence.updateMeetingTitle(ctx.meetingId, parsedData.title, ctx.userId);
      if (!updated) {
        send(ws, {
          type: "error",
          data: { message: "Meeting not found", code: "MEETING_NOT_FOUND" },
        });
        return;
      }

      sendMeetingStatus(ws, {
        meetingId: ctx.meetingId,
        title: parsedData.title,
        sessionId: ctx.sessionId,
        mode: ctx.meetingMode ?? "record",
      });

      console.log(`[WS] Meeting title updated: ${ctx.meetingId} -> "${parsedData.title}"`);
    } catch (error) {
      console.error("[WS] Failed to update meeting:", error);
      send(ws, {
        type: "error",
        data: { message: "Failed to update meeting" },
      });
    }
  }

  function updateSpeakerAlias(ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown): void {
    if (!ctx.meetingId) {
      send(ws, {
        type: "error",
        data: { message: "No active meeting to update", code: "NO_ACTIVE_MEETING" },
      });
      return;
    }

    if (ctx.meetingMode !== "record") {
      sendReadOnlyError(ws);
      return;
    }

    if (!data || typeof data !== "object") {
      send(ws, {
        type: "error",
        data: { message: "Invalid alias payload", code: "INVALID_ALIAS_PAYLOAD" },
      });
      return;
    }

    const speaker = Number((data as { speaker?: unknown }).speaker);
    if (!Number.isInteger(speaker) || speaker < 0) {
      send(ws, {
        type: "error",
        data: { message: "Invalid speaker index", code: "INVALID_SPEAKER" },
      });
      return;
    }

    const displayNameRaw = (data as { displayName?: unknown }).displayName;
    if (typeof displayNameRaw !== "string") {
      send(ws, {
        type: "error",
        data: { message: "Invalid display name", code: "INVALID_DISPLAY_NAME" },
      });
      return;
    }

    const displayName = displayNameRaw.trim();
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

  function setMode(ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown): void {
    if (!ctx.meetingId) {
      send(ws, {
        type: "error",
        data: { message: "No active meeting to update", code: "NO_ACTIVE_MEETING" },
      });
      return;
    }

    const parsedData = readMeetingModeSetData(data);
    if (!parsedData) {
      send(ws, {
        type: "error",
        data: { message: "Invalid meeting mode payload", code: "INVALID_MEETING_MODE" },
      });
      return;
    }

    if (
      parsedData.mode === "record" &&
      recordingLocks.isLockedByAnother(ctx.meetingId, ctx.sessionId)
    ) {
      send(ws, {
        type: "error",
        data: {
          message: "Another user is already recording this meeting",
          code: "MEETING_ALREADY_RECORDING",
        },
      });
      return;
    }

    if (parsedData.mode === "view" && ctx.session.status === "recording") {
      send(ws, {
        type: "error",
        data: {
          message: "Stop recording before switching to view mode",
          code: "RECORDING_IN_PROGRESS",
        },
      });
      return;
    }

    ctx.meetingMode = parsedData.mode;
    if (parsedData.mode === "view") {
      recordingLocks.release(ctx.meetingId, ctx.sessionId);
    }

    const readOwnerUserId = resolveMeetingReadOwnerUserId(persistence, ctx.userId);
    const meeting = persistence.getMeeting(ctx.meetingId, readOwnerUserId);
    sendMeetingStatus(ws, {
      meetingId: ctx.meetingId,
      title: meeting?.title ?? undefined,
      sessionId: ctx.sessionId,
      mode: parsedData.mode,
    });
  }

  function requestHistoryDelta(
    ws: ServerWebSocket<WSContext>,
    ctx: WSContext,
    data: unknown,
  ): void {
    const parsedData = readMeetingHistoryRequestData(data);
    if (!parsedData) {
      send(ws, {
        type: "error",
        data: {
          message: "Invalid history request payload",
          code: "INVALID_MEETING_HISTORY_REQUEST",
        },
      });
      return;
    }

    if (!isValidUUID(parsedData.meetingId)) {
      send(ws, {
        type: "error",
        data: { message: "Invalid meeting ID format", code: "INVALID_MEETING_ID" },
      });
      return;
    }

    if (!ctx.meetingId || ctx.meetingId !== parsedData.meetingId) {
      send(ws, {
        type: "error",
        data: {
          message: "No active meeting context",
          code: "NO_ACTIVE_MEETING",
        },
      });
      return;
    }

    const readOwnerUserId = resolveMeetingReadOwnerUserId(persistence, ctx.userId);
    if (!persistence.getMeeting(parsedData.meetingId, readOwnerUserId)) {
      send(ws, {
        type: "error",
        data: { message: "Meeting not found", code: "MEETING_NOT_FOUND" },
      });
      return;
    }

    sendMeetingHistoryDelta(
      ws,
      persistence,
      parsedData.meetingId,
      readOwnerUserId,
      parsedData.cursor,
    );
  }

  function releaseRecordingLock(ctx: WSContext): void {
    if (!ctx.meetingId) {
      return;
    }
    recordingLocks.release(ctx.meetingId, ctx.sessionId);
  }

  return {
    start,
    stop,
    list,
    update,
    updateSpeakerAlias,
    setMode,
    requestHistoryDelta,
    releaseRecordingLock,
  };
}
