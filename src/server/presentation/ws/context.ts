import { createSession } from "@/services/server/session";
import { getGeminiImageModelConfig, resolveGeminiImageModel } from "@/services/server/gemini";
import type { ImageModelStatusMessage } from "@/types/messages";
import type { WSContext } from "@/server/types/context";

export function createWsContext(userId: string, sessionId: string): WSContext {
  return {
    userId,
    sessionId,
    meetingId: null,
    meetingMode: null,
    session: createSession(sessionId),
    deepgram: null,
    analysis: null,
    checkInterval: null,
    imageModelPreset: "flash",
    pendingAudio: [],
    pendingAudioBytes: 0,
    pendingUtteranceEndCount: 0,
  };
}

export function buildImageModelStatusMessage(ctx: WSContext): ImageModelStatusMessage {
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
