import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { MeetingWsUsecase } from "@/server/application/ws/meeting-usecase";
import type { ModelWsUsecase } from "@/server/application/ws/model-usecase";
import type { SessionWsUsecase } from "@/server/application/ws/session-usecase";
import { createWsContext } from "@/server/presentation/ws/context";
import { createWsMessageRouter } from "@/server/presentation/ws/message-router";
import type { WSContext } from "@/server/types/context";

function createFakeSocket() {
  const sent: string[] = [];
  const ws = {
    data: createWsContext("user-1", "session-1"),
    send(payload: string) {
      sent.push(payload);
    },
  } as unknown as ServerWebSocket<WSContext>;
  return { ws, sent };
}

function createUsecases() {
  const calls: string[] = [];
  const meeting: MeetingWsUsecase = {
    start: () => calls.push("meeting:start"),
    stop: () => calls.push("meeting:stop"),
    list: () => calls.push("meeting:list"),
    update: () => calls.push("meeting:update"),
    updateSpeakerAlias: () => calls.push("meeting:alias"),
  };
  const session: SessionWsUsecase = {
    cleanup: () => {},
    handleAudioChunk: () => calls.push("audio:chunk"),
    start: async () => {
      calls.push("session:start");
    },
    stop: () => calls.push("session:stop"),
    handleCameraFrame: () => calls.push("camera:frame"),
  };
  const model: ModelWsUsecase = {
    setImageModelPreset: () => calls.push("image:model:set"),
  };

  return { calls, meeting, session, model };
}

describe("createWsMessageRouter", () => {
  test("routes control message to matching usecase", async () => {
    const { ws } = createFakeSocket();
    const { calls, meeting, session, model } = createUsecases();
    const router = createWsMessageRouter({ meeting, session, model });

    await router.route(
      ws,
      JSON.stringify({
        type: "meeting:start",
        data: { title: "Weekly" },
      }),
    );

    expect(calls).toEqual(["meeting:start"]);
  });

  test("routes binary message to audio chunk handler", async () => {
    const { ws } = createFakeSocket();
    const { calls, meeting, session, model } = createUsecases();
    const router = createWsMessageRouter({ meeting, session, model });

    await router.route(ws, Buffer.from([1, 2, 3]));

    expect(calls).toEqual(["audio:chunk"]);
  });

  test("sends error when message payload is invalid", async () => {
    const { ws, sent } = createFakeSocket();
    const { meeting, session, model } = createUsecases();
    const router = createWsMessageRouter({ meeting, session, model });

    await router.route(ws, "{invalid-json");

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({
      type: "error",
      data: { message: "Invalid message format" },
    });
  });
});
