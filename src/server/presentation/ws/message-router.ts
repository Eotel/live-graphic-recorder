import type { ServerWebSocket } from "bun";
import type { MeetingWsUsecase } from "@/server/application/ws/meeting-usecase";
import type { ModelWsUsecase } from "@/server/application/ws/model-usecase";
import type { SessionWsUsecase } from "@/server/application/ws/session-usecase";
import { send } from "@/server/presentation/ws/sender";
import type { WSContext } from "@/server/types/context";
import { parseWsMessage } from "@/server/presentation/ws/message-validator";

interface CreateWsMessageRouterInput {
  meeting: MeetingWsUsecase;
  session: SessionWsUsecase;
  model: ModelWsUsecase;
}

export interface WsMessageRouter {
  route: (ws: ServerWebSocket<WSContext>, message: string | Buffer | ArrayBuffer) => Promise<void>;
}

export function createWsMessageRouter(input: CreateWsMessageRouterInput): WsMessageRouter {
  async function route(
    ws: ServerWebSocket<WSContext>,
    message: string | Buffer | ArrayBuffer,
  ): Promise<void> {
    const ctx = ws.data;

    if (message instanceof ArrayBuffer || message instanceof Buffer) {
      if (ctx.meetingMode !== "record") {
        send(ws, {
          type: "error",
          data: {
            message: "This meeting is in read-only mode",
            code: "READ_ONLY_MEETING",
          },
        });
        return;
      }
      input.session.handleAudioChunk(ctx, message);
      return;
    }

    const parsed = parseWsMessage(String(message));
    if (!parsed) {
      send(ws, {
        type: "error",
        data: { message: "Invalid message format" },
      });
      return;
    }

    switch (parsed.type) {
      case "meeting:start":
        input.meeting.start(ws, ctx, parsed.data);
        break;
      case "meeting:stop":
        input.meeting.stop(ctx);
        break;
      case "meeting:mode:set":
        input.meeting.setMode(ws, ctx, parsed.data);
        break;
      case "meeting:list:request":
        input.meeting.list(ws);
        break;
      case "meeting:history:request":
        input.meeting.requestHistoryDelta(ws, ctx, parsed.data);
        break;
      case "meeting:update":
        input.meeting.update(ws, ctx, parsed.data);
        break;
      case "meeting:speaker-alias:update":
        input.meeting.updateSpeakerAlias(ws, ctx, parsed.data);
        break;
      case "session:start":
        await input.session.start(ws, ctx);
        break;
      case "session:stop":
        input.session.stop(ws, ctx);
        break;
      case "camera:frame":
        input.session.handleCameraFrame(ws, ctx, parsed.data);
        break;
      case "image:model:set":
        input.model.setImageModelPreset(ws, ctx, parsed.data);
        break;
      default:
        console.warn(`[WS] Ignored unsupported message type: ${parsed.type}`);
        break;
    }
  }

  return {
    route,
  };
}
