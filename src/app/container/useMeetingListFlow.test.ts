import { describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { MutableRefObject } from "react";

import { createAppStore } from "@/app/view-model/app-store";
import type { UseLocalRecordingReturn } from "@/hooks/useLocalRecording";
import type { UseMeetingSessionReturn } from "@/hooks/useMeetingSession";
import { useMeetingListFlow } from "./useMeetingListFlow";

interface HookRenderParams {
  authStatus: "loading" | "authenticated" | "unauthenticated";
  meetingView: "select" | "recording";
}

function createSessionMock(
  overrides: Partial<UseMeetingSessionReturn> = {},
): UseMeetingSessionReturn {
  const base: UseMeetingSessionReturn = {
    isConnected: false,
    sessionStatus: "idle",
    generationPhase: "idle",
    sttStatus: null,
    error: null,
    meeting: {
      meetingId: null,
      meetingTitle: null,
      sessionId: null,
      mode: null,
      meetingList: [],
    },
    transcriptSegments: [],
    interimText: "",
    interimSpeaker: undefined,
    interimStartTime: undefined,
    speakerAliases: {},
    summaryPages: [],
    topics: [],
    tags: [],
    flow: 50,
    heat: 50,
    images: [],
    imageModel: {
      preset: "flash",
      model: "mock-flash",
      available: {
        flash: "mock-flash",
      },
    },
    isAnalyzing: false,
    isGenerating: false,
    connect: mock(() => {}),
    disconnect: mock(() => {}),
    sendAudio: mock((_data: ArrayBuffer) => {}),
    startMeeting: mock((_title?: string, _meetingId?: string, _mode?: "record" | "view") => {}),
    stopMeeting: mock(() => {}),
    requestMeetingList: mock(() => {}),
    requestMeetingHistoryDelta: mock((_meetingId: string, _cursor?: unknown) => {}),
    setMeetingMode: mock((_mode: "record" | "view") => {}),
    updateMeetingTitle: mock((_title: string) => {}),
    updateSpeakerAlias: mock((_speaker: number, _displayName: string) => {}),
    startSession: mock(() => {}),
    stopSession: mock(() => {}),
    sendCameraFrame: mock((_frame) => {}),
    setImageModelPreset: mock((_preset: "flash" | "pro") => {}),
    resetSession: mock(() => {}),
  };

  return {
    ...base,
    ...overrides,
    meeting: {
      ...base.meeting,
      ...overrides.meeting,
    },
  };
}

function createLocalRecordingRef(
  reset = mock(() => {}),
): MutableRefObject<UseLocalRecordingReturn> {
  return {
    current: {
      isRecording: false,
      sessionId: null,
      totalChunks: 0,
      pendingRecordings: [],
      error: null,
      start: async (_sessionId: string) => {},
      writeChunk: async (_chunk: ArrayBuffer) => {},
      stop: async () => {},
      removePendingRecording: (_recordingId: string) => {},
      reset,
    },
  };
}

describe("useMeetingListFlow", () => {
  test("recording から select に戻ると meeting list を再取得する", async () => {
    const appStore = createAppStore({}, { meeting: { view: "recording" } });
    const appActions = appStore.getState().actions;
    const requestMeetingList = mock(() => {});
    const session = createSessionMock({ isConnected: true, requestMeetingList });
    const localRecordingRef = createLocalRecordingRef();

    const { rerender, unmount } = renderHook(
      ({ authStatus, meetingView }: HookRenderParams) =>
        useMeetingListFlow({
          authStatus,
          meetingView,
          session,
          appStore,
          appActions,
          localRecordingRef,
        }),
      {
        initialProps: {
          authStatus: "authenticated",
          meetingView: "recording",
        },
      },
    );

    expect(requestMeetingList).toHaveBeenCalledTimes(0);

    act(() => {
      appActions.setMeetingState({ view: "select" });
      rerender({
        authStatus: "authenticated",
        meetingView: "select",
      });
    });

    await waitFor(() => {
      expect(requestMeetingList).toHaveBeenCalledTimes(1);
    });
    expect(appStore.getState().meeting.isListLoading).toBe(true);
    expect(appStore.getState().meeting.listError).toBeNull();

    unmount();
  });

  test("select 以外の view では自動再取得しない", () => {
    const appStore = createAppStore({}, { meeting: { view: "recording" } });
    const appActions = appStore.getState().actions;
    const requestMeetingList = mock(() => {});
    const session = createSessionMock({ isConnected: true, requestMeetingList });
    const localRecordingRef = createLocalRecordingRef();

    const { unmount } = renderHook(() =>
      useMeetingListFlow({
        authStatus: "authenticated",
        meetingView: "recording",
        session,
        appStore,
        appActions,
        localRecordingRef,
      }),
    );

    expect(requestMeetingList).toHaveBeenCalledTimes(0);

    unmount();
  });

  test("未接続時は select でも自動再取得しない", () => {
    const appStore = createAppStore({}, { meeting: { view: "select" } });
    const appActions = appStore.getState().actions;
    const requestMeetingList = mock(() => {});
    const session = createSessionMock({ isConnected: false, requestMeetingList });
    const localRecordingRef = createLocalRecordingRef();

    const { unmount } = renderHook(() =>
      useMeetingListFlow({
        authStatus: "authenticated",
        meetingView: "select",
        session,
        appStore,
        appActions,
        localRecordingRef,
      }),
    );

    expect(requestMeetingList).toHaveBeenCalledTimes(0);
    expect(appStore.getState().meeting.isListLoading).toBe(false);

    unmount();
  });

  test("onRefreshMeetings は接続済みなら requestMeetingList を呼ぶ", () => {
    const appStore = createAppStore({}, { meeting: { view: "select" } });
    const appActions = appStore.getState().actions;
    const connect = mock(() => {});
    const requestMeetingList = mock(() => {});
    const session = createSessionMock({
      isConnected: true,
      connect,
      requestMeetingList,
    });
    const localRecordingRef = createLocalRecordingRef();

    const { result, unmount } = renderHook(() =>
      useMeetingListFlow({
        authStatus: "unauthenticated",
        meetingView: "select",
        session,
        appStore,
        appActions,
        localRecordingRef,
      }),
    );

    act(() => {
      result.current.onRefreshMeetings();
    });

    expect(requestMeetingList).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(0);
    expect(appStore.getState().meeting.isListLoading).toBe(true);
    expect(appStore.getState().meeting.listError).toBeNull();

    unmount();
  });

  test("onRefreshMeetings は未接続なら connect を呼ぶ", () => {
    const appStore = createAppStore({}, { meeting: { view: "select" } });
    const appActions = appStore.getState().actions;
    const connect = mock(() => {});
    const requestMeetingList = mock(() => {});
    const session = createSessionMock({
      isConnected: false,
      connect,
      requestMeetingList,
    });
    const localRecordingRef = createLocalRecordingRef();

    const { result, unmount } = renderHook(() =>
      useMeetingListFlow({
        authStatus: "unauthenticated",
        meetingView: "select",
        session,
        appStore,
        appActions,
        localRecordingRef,
      }),
    );

    act(() => {
      result.current.onRefreshMeetings();
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(requestMeetingList).toHaveBeenCalledTimes(0);
    expect(appStore.getState().meeting.isListLoading).toBe(true);
    expect(appStore.getState().meeting.listError).toBeNull();

    unmount();
  });
});
