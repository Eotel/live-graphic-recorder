import type { ServerWebSocket } from "bun";
import { isValidUUID } from "@/server/domain/common/id";
import { buildMeetingHistoryMessage } from "@/server/domain/meeting/history-mapper";
import { speakerAliasArrayToMap } from "@/server/domain/meeting/speaker-alias";
import { send } from "@/server/presentation/ws/sender";
import type { WSContext } from "@/server/types/context";
import type { PersistenceService } from "@/services/server/persistence";

interface CreateMeetingWsUsecaseInput {
  persistence: PersistenceService;
}

export interface MeetingWsUsecase {
  start: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
  stop: (ctx: WSContext) => void;
  list: (ws: ServerWebSocket<WSContext>) => void;
  update: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
  updateSpeakerAlias: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
}

function readMeetingStartData(data: unknown): {
  title?: string;
  meetingId?: string;
} | null {
  if (typeof data === "undefined") {
    return {};
  }
  if (!data || typeof data !== "object") {
    return null;
  }

  const title = (data as { title?: unknown }).title;
  const meetingId = (data as { meetingId?: unknown }).meetingId;
  if (typeof title !== "undefined" && typeof title !== "string") {
    return null;
  }
  if (typeof meetingId !== "undefined" && typeof meetingId !== "string") {
    return null;
  }

  return {
    title,
    meetingId,
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

export function createMeetingWsUsecase(input: CreateMeetingWsUsecaseInput): MeetingWsUsecase {
  const { persistence } = input;

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

      if (parsedData.meetingId) {
        if (!isValidUUID(parsedData.meetingId)) {
          send(ws, {
            type: "error",
            data: { message: "Invalid meeting ID format", code: "INVALID_MEETING_ID" },
          });
          return;
        }

        const existing = persistence.getMeeting(parsedData.meetingId, ctx.userId);
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

  function stop(ctx: WSContext): void {
    if (ctx.meetingId) {
      persistence.endMeeting(ctx.meetingId, ctx.userId);
      console.log(`[WS] Meeting ended: ${ctx.meetingId}`);
      ctx.meetingId = null;
    }
  }

  function list(ws: ServerWebSocket<WSContext>): void {
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

  function update(ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown): void {
    if (!ctx.meetingId) {
      send(ws, {
        type: "error",
        data: { message: "No active meeting to update", code: "NO_ACTIVE_MEETING" },
      });
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

      send(ws, {
        type: "meeting:status",
        data: {
          meetingId: ctx.meetingId,
          title: parsedData.title,
          sessionId: ctx.sessionId,
        },
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

  return {
    start,
    stop,
    list,
    update,
    updateSpeakerAlias,
  };
}
