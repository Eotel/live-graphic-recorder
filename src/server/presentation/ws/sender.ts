import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "@/types/messages";
import type { WSContext } from "@/server/types/context";

export function send(ws: ServerWebSocket<WSContext>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}
