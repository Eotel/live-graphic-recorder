import type { ServerWebSocket } from "bun";
import { buildImageModelStatusMessage } from "@/server/presentation/ws/context";
import { send } from "@/server/presentation/ws/sender";
import type { WSContext } from "@/server/types/context";
import { getGeminiImageModelConfig } from "@/services/server/gemini";

export interface ModelWsUsecase {
  setImageModelPreset: (ws: ServerWebSocket<WSContext>, ctx: WSContext, data: unknown) => void;
}

export function createModelWsUsecase(): ModelWsUsecase {
  function setImageModelPreset(
    ws: ServerWebSocket<WSContext>,
    ctx: WSContext,
    data: unknown,
  ): void {
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
      send(ws, buildImageModelStatusMessage(ctx));
      return;
    }

    ctx.imageModelPreset = preset;
    send(ws, buildImageModelStatusMessage(ctx));
  }

  return {
    setImageModelPreset,
  };
}
