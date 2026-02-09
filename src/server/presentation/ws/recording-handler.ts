import type { ServerWebSocket } from "bun";
import { createMeetingWsUsecase } from "@/server/application/ws/meeting-usecase";
import { createModelWsUsecase } from "@/server/application/ws/model-usecase";
import { createRecordingLockManager } from "@/server/application/ws/recording-lock-manager";
import { createSessionWsUsecase } from "@/server/application/ws/session-usecase";
import { createWsMessageRouter } from "@/server/presentation/ws/message-router";
import { buildImageModelStatusMessage } from "@/server/presentation/ws/context";
import { send } from "@/server/presentation/ws/sender";
import type { WSContext } from "@/server/types/context";
import type { PersistenceService } from "@/services/server/persistence";

interface CreateRecordingWebSocketHandlersInput {
  persistence: PersistenceService;
}

interface RecordingWebSocketHandlers {
  open: (ws: ServerWebSocket<WSContext>) => void;
  message: (
    ws: ServerWebSocket<WSContext>,
    message: string | Buffer | ArrayBuffer,
  ) => Promise<void>;
  close: (ws: ServerWebSocket<WSContext>, code: number, reason: string) => void;
}

export function createRecordingWebSocketHandlers(
  input: CreateRecordingWebSocketHandlersInput,
): RecordingWebSocketHandlers {
  const recordingLocks = createRecordingLockManager();
  const meeting = createMeetingWsUsecase({
    persistence: input.persistence,
    recordingLocks,
  });
  const session = createSessionWsUsecase({
    persistence: input.persistence,
    recordingLocks,
  });
  const model = createModelWsUsecase();
  const router = createWsMessageRouter({ meeting, session, model });

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
      await router.route(ws, message);
    },

    close(ws, code, reason) {
      const ctx = ws.data;
      session.cleanup(ctx);
      meeting.releaseRecordingLock(ctx);
      const reasonText = reason && reason.length > 0 ? reason : "(empty)";
      console.log(
        `[WS] Session closed: ${ctx.sessionId}, code=${code}, reason=${reasonText}, meeting=${ctx.meetingId ?? "n/a"}, mode=${ctx.meetingMode ?? "n/a"}, status=${ctx.session.status}`,
      );
    },
  };
}
