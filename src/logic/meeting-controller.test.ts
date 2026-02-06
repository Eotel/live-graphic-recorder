/**
 * Tests for MeetingController.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createMeetingController } from "./meeting-controller";
import type { WebSocketAdapter, WebSocketInstance } from "../adapters/types";
import { WebSocketReadyState } from "../adapters/types";
import { createControllableMockWebSocket } from "../adapters/websocket";
import type { MeetingControllerState, MeetingControllerCallbacks } from "./types";

function createMockWsAdapter(): WebSocketAdapter & {
  lastInstance: ReturnType<typeof createControllableMockWebSocket> | null;
} {
  const adapter = {
    lastInstance: null as ReturnType<typeof createControllableMockWebSocket> | null,
    buildUrl: (path: string) => `ws://localhost${path}`,
    create: (url: string) => {
      const mock = createControllableMockWebSocket();
      adapter.lastInstance = mock;
      return mock.instance;
    },
  };
  return adapter;
}

describe("createMeetingController", () => {
  test("initializes with default state", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    const state = controller.getState();
    expect(state.isConnected).toBe(false);
    expect(state.connectionState).toBe("disconnected");
    expect(state.reconnectAttempt).toBe(0);
    expect(state.sessionStatus).toBe("idle");
    expect(state.generationPhase).toBe("idle");
    expect(state.error).toBeNull();
    expect(state.imageModel.preset).toBe("flash");
    expect(state.imageModel.model).toBe(state.imageModel.available.flash);
    expect(state.meeting.meetingId).toBeNull();
  });

  test("connect creates WebSocket and sets connected on open", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    expect(wsAdapter.lastInstance).not.toBeNull();

    // Simulate open
    wsAdapter.lastInstance!.controls.simulateOpen();

    expect(controller.getState().isConnected).toBe(true);
    expect(controller.getState().error).toBeNull();
  });

  test("disconnect closes WebSocket", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.disconnect();
    wsAdapter.lastInstance!.controls.simulateClose();

    expect(controller.getState().isConnected).toBe(false);
  });

  test("connect prevents duplicate connections", () => {
    const wsAdapter = createMockWsAdapter();
    const createSpy = mock(wsAdapter.create);
    wsAdapter.create = createSpy;
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    // Try to connect again while already connected
    controller.connect();

    // Should only create one connection
    expect(createSpy.mock.calls.length).toBe(1);
  });

  test("handles transcript message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});
    const onTranscript = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
      { onTranscript },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "transcript",
        data: {
          text: "Hello world",
          isFinal: true,
          timestamp: 1000,
          speaker: 1,
        },
      }),
    );

    expect(onTranscript).toHaveBeenCalledWith({
      text: "Hello world",
      isFinal: true,
      timestamp: 1000,
      speaker: 1,
    });
  });

  test("handles analysis message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});
    const onAnalysis = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
      { onAnalysis },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "analysis",
        data: {
          summary: ["Point 1"],
          topics: ["Topic A"],
          tags: ["tag1"],
          flow: 75,
          heat: 50,
        },
      }),
    );

    expect(onAnalysis).toHaveBeenCalledWith({
      summary: ["Point 1"],
      topics: ["Topic A"],
      tags: ["tag1"],
      flow: 75,
      heat: 50,
    });
  });

  test("handles session:status message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "session:status",
        data: { status: "recording" },
      }),
    );

    expect(controller.getState().sessionStatus).toBe("recording");
  });

  test("handles generation:status message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "generation:status",
        data: { phase: "analyzing" },
      }),
    );

    expect(controller.getState().generationPhase).toBe("analyzing");
  });

  test("handles image:model:status message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "image:model:status",
        data: {
          preset: "pro",
          model: "gemini-pro-image",
          available: {
            flash: "gemini-flash-image",
            pro: "gemini-pro-image",
          },
        },
      }),
    );

    const state = controller.getState();
    expect(state.imageModel.preset).toBe("pro");
    expect(state.imageModel.model).toBe("gemini-pro-image");
    expect(state.imageModel.available.pro).toBe("gemini-pro-image");
  });

  test("handles meeting:status message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});
    const onMeetingStatus = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter },
      { onStateChange },
      { onMeetingStatus },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "meeting:status",
        data: {
          meetingId: "meeting-123",
          title: "Test Meeting",
          sessionId: "session-456",
        },
      }),
    );

    const state = controller.getState();
    expect(state.meeting.meetingId).toBe("meeting-123");
    expect(state.meeting.meetingTitle).toBe("Test Meeting");
    expect(state.meeting.sessionId).toBe("session-456");
    expect(onMeetingStatus).toHaveBeenCalled();
  });

  test("handles meeting:list message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});
    const onMeetingList = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
      { onMeetingList },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "meeting:list",
        data: {
          meetings: [
            {
              id: "meeting-1",
              title: "Meeting 1",
              startedAt: 1000,
              endedAt: null,
              createdAt: 500,
            },
          ],
        },
      }),
    );

    expect(controller.getState().meeting.meetingList).toHaveLength(1);
    expect(onMeetingList).toHaveBeenCalled();
  });

  test("handles meeting:history message with speaker aliases", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});
    const onMeetingHistory = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
      { onMeetingHistory },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "meeting:history",
        data: {
          transcripts: [],
          analyses: [],
          images: [],
          captures: [],
          metaSummaries: [],
          speakerAliases: {
            0: "田中",
            1: "佐藤",
          },
        },
      }),
    );

    expect(onMeetingHistory).toHaveBeenCalledWith({
      transcripts: [],
      analyses: [],
      images: [],
      captures: [],
      metaSummaries: [],
      speakerAliases: { 0: "田中", 1: "佐藤" },
    });
  });

  test("handles meeting:speaker-alias message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});
    const onSpeakerAliases = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
      { onSpeakerAliases },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "meeting:speaker-alias",
        data: {
          speakerAliases: {
            0: "山田",
          },
        },
      }),
    );

    expect(onSpeakerAliases).toHaveBeenCalledWith({ 0: "山田" });
  });

  test("handles error message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});
    const onError = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
      { onError },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "error",
        data: { message: "Something went wrong" },
      }),
    );

    expect(controller.getState().error).toBe("Something went wrong");
    expect(onError).toHaveBeenCalledWith("Something went wrong");
  });

  test("startMeeting sends message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.startMeeting("Test Meeting", "meeting-123");

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    expect(messages).toHaveLength(1);

    const parsed = JSON.parse(messages[0] as string);
    expect(parsed.type).toBe("meeting:start");
    expect(parsed.data.title).toBe("Test Meeting");
    expect(parsed.data.meetingId).toBe("meeting-123");
  });

  test("stopMeeting sends message and clears meeting state", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    // Set up meeting state first
    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "meeting:status",
        data: {
          meetingId: "meeting-123",
          title: "Test",
          sessionId: "session-456",
        },
      }),
    );

    controller.stopMeeting();

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    const lastMessage = JSON.parse(messages[messages.length - 1] as string);
    expect(lastMessage.type).toBe("meeting:stop");

    const state = controller.getState();
    expect(state.meeting.meetingId).toBeNull();
    expect(state.meeting.meetingTitle).toBeNull();
  });

  test("sendAudio sends binary data", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    const audioData = new ArrayBuffer(100);
    controller.sendAudio(audioData);

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBeInstanceOf(ArrayBuffer);
  });

  test("requestMeetingList sends message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.requestMeetingList();

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    const parsed = JSON.parse(messages[0] as string);
    expect(parsed.type).toBe("meeting:list:request");
  });

  test("updateMeetingTitle sends message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.updateMeetingTitle("New Title");

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    const parsed = JSON.parse(messages[0] as string);
    expect(parsed.type).toBe("meeting:update");
    expect(parsed.data.title).toBe("New Title");
  });

  test("updateSpeakerAlias sends message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.updateSpeakerAlias(2, "高橋");

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    const parsed = JSON.parse(messages[0] as string);
    expect(parsed.type).toBe("meeting:speaker-alias:update");
    expect(parsed.data.speaker).toBe(2);
    expect(parsed.data.displayName).toBe("高橋");
  });

  test("dispose disconnects and prevents further state changes", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    const callCount = onStateChange.mock.calls.length;
    controller.dispose();

    // Try to trigger state change after dispose
    wsAdapter.lastInstance!.controls.simulateMessage(
      JSON.stringify({
        type: "session:status",
        data: { status: "recording" },
      }),
    );

    // Should not emit after dispose
    expect(onStateChange.mock.calls.length).toBe(callCount);
  });

  test("handles WebSocket close event", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();
    expect(controller.getState().isConnected).toBe(true);

    wsAdapter.lastInstance!.controls.simulateClose();

    expect(controller.getState().isConnected).toBe(false);
    expect(controller.getState().sessionStatus).toBe("idle");
  });

  test("handles WebSocket error event", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateError();

    expect(controller.getState().error).toBe("WebSocket connection error");
  });

  test("startSession sends session:start message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.startSession();

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    const parsed = JSON.parse(messages[0] as string);
    expect(parsed.type).toBe("session:start");
  });

  test("stopSession sends session:stop message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.stopSession();

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    const parsed = JSON.parse(messages[0] as string);
    expect(parsed.type).toBe("session:stop");
  });

  test("sendCameraFrame sends camera:frame message with data", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.sendCameraFrame({ base64: "abc123", timestamp: 1000 });

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    const parsed = JSON.parse(messages[0] as string);
    expect(parsed.type).toBe("camera:frame");
    expect(parsed.data.base64).toBe("abc123");
    expect(parsed.data.timestamp).toBe(1000);
  });

  test("setImageModelPreset sends image:model:set message", () => {
    const wsAdapter = createMockWsAdapter();
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      { wsAdapter, reconnect: { enabled: false, connectTimeoutMs: 0 } },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();

    controller.setImageModelPreset("pro");

    const messages = wsAdapter.lastInstance!.controls.getSentMessages();
    const parsed = JSON.parse(messages[0] as string);
    expect(parsed.type).toBe("image:model:set");
    expect(parsed.data.preset).toBe("pro");
  });

  test("reconnects after unexpected close when enabled", async () => {
    const wsAdapter = createMockWsAdapter();
    const createSpy = mock(wsAdapter.create);
    wsAdapter.create = createSpy;
    const onStateChange = mock(() => {});

    const controller = createMeetingController(
      {
        wsAdapter,
        reconnect: {
          enabled: true,
          connectTimeoutMs: 0,
          initialBackoffMs: 1,
          maxBackoffMs: 1,
          jitterRatio: 0,
        },
      },
      { onStateChange },
    );

    controller.connect();
    wsAdapter.lastInstance!.controls.simulateOpen();
    expect(controller.getState().isConnected).toBe(true);

    wsAdapter.lastInstance!.controls.simulateClose();

    await new Promise((r) => setTimeout(r, 10));

    expect(createSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(controller.getState().connectionState).toBe("reconnecting");
    expect(controller.getState().reconnectAttempt).toBe(1);

    controller.dispose();
  });
});
