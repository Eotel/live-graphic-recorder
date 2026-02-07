import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import type { MeetingInfo } from "@/types/messages";
import type { PaneId } from "@/logic/pane-state-controller";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface HarnessState {
  authStatus: AuthStatus;
  isConnected: boolean;
  meetingId: string | null;
  meetingTitle: string | null;
  sessionId: string | null;
  meetingList: MeetingInfo[];
  recordingIsRecording: boolean;
  localSessionId: string | null;
  localTotalChunks: number;
  pendingRecordings: Array<{
    recordingId: string;
    sessionId: string;
    totalChunks: number;
    createdAt: number;
  }>;
}

interface DeferredPromise {
  promise: Promise<void>;
  resolve: () => void;
}

const listeners = new Set<() => void>();
const AUTH_USER = { id: "user-1", email: "user@example.com" };
const STABLE_POPOUT_PANES = new Set<PaneId>();
const STABLE_PANE_STATE = {
  expandedPane: null as PaneId | null,
  popoutPanes: STABLE_POPOUT_PANES,
  getState: () => ({ expandedPane: null as PaneId | null, popoutPanes: STABLE_POPOUT_PANES }),
  subscribe: (_listener: () => void) => () => {},
  expandPane: (_paneId: PaneId) => {},
  collapsePane: () => {},
  popoutPane: (_paneId: PaneId) => {},
  closePopout: (_paneId: PaneId) => {},
  getPaneMode: (_paneId: PaneId) => "normal" as const,
};
const STABLE_POPOUT = {
  isOpen: false,
  open: async () => true,
  close: () => {},
  popoutWindow: null,
  portalContainer: null,
};

const SAMPLE_MEETINGS: MeetingInfo[] = [
  {
    id: "meeting-1",
    title: "Weekly Sync",
    startedAt: 1,
    endedAt: null,
    createdAt: 1,
  },
];

function createDefaultHarnessState(): HarnessState {
  return {
    authStatus: "authenticated",
    isConnected: false,
    meetingId: null,
    meetingTitle: null,
    sessionId: null,
    meetingList: SAMPLE_MEETINGS,
    recordingIsRecording: false,
    localSessionId: null,
    localTotalChunks: 0,
    pendingRecordings: [],
  };
}

let harnessState = createDefaultHarnessState();
let logoutDeferred: DeferredPromise | null = null;

function getHarnessState(): HarnessState {
  return harnessState;
}

function subscribeHarness(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitHarnessChange(): void {
  listeners.forEach((listener) => listener());
}

function setHarnessState(patch: Partial<HarnessState>): void {
  harnessState = { ...harnessState, ...patch };
  emitHarnessChange();
}

function resetHarnessState(overrides: Partial<HarnessState> = {}): void {
  harnessState = { ...createDefaultHarnessState(), ...overrides };
  logoutDeferred = null;
  emitHarnessChange();
}

function createDeferredPromise(): DeferredPromise {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const connectMock = mock(() => {});
const disconnectMock = mock(() => {
  setHarnessState({ isConnected: false });
});
const stopMeetingMock = mock(() => {});
const resetSessionMock = mock(() => {});
const requestMeetingListMock = mock(() => {});
const startMeetingMock = mock((_title?: string, _meetingId?: string) => {});
const startSessionMock = mock(() => {});
const stopSessionMock = mock(() => {});
const sendAudioMock = mock((_data: ArrayBuffer) => {});
const sendCameraFrameMock = mock((_frame: unknown) => {});
const updateMeetingTitleMock = mock((_title: string) => {});
const updateSpeakerAliasMock = mock((_speaker: number, _displayName: string) => {});
const setImageModelPresetMock = mock((_preset: "flash" | "pro") => {});

const recordingStartMock = mock(() => {
  setHarnessState({ recordingIsRecording: true });
});
const recordingStopMock = mock(() => {
  setHarnessState({ recordingIsRecording: false });
});

const localStartMock = mock(async (sessionId: string) => {
  setHarnessState({ localSessionId: sessionId, localTotalChunks: 0 });
});
const localWriteChunkMock = mock(async (_chunk: ArrayBuffer) => {
  setHarnessState({ localTotalChunks: harnessState.localTotalChunks + 1 });
});
const localStopMock = mock(async () => {});
const removePendingRecordingMock = mock((recordingId: string) => {
  setHarnessState({
    pendingRecordings: harnessState.pendingRecordings.filter(
      (recording) => recording.recordingId !== recordingId,
    ),
  });
});
const localResetMock = mock(() => {
  setHarnessState({ localSessionId: null, localTotalChunks: 0, pendingRecordings: [] });
});

const uploadMock = mock(
  async (
    _recordings: Array<{
      recordingId: string;
      sessionId: string;
      totalChunks: number;
      createdAt: number;
    }>,
    _meetingId: string,
  ) => {},
);
const cancelUploadMock = mock(() => {});
const onRefreshMeetingsMock = mock(() => {});
const clearMeetingListRequestTimeoutMock = mock(() => {});
const confirmDiscardMock = mock(() => true);
const beforeUnloadGuardMock = mock((_enabled: boolean) => {});
const cameraCaptureMock = mock((_params: unknown) => {});

const authLogoutMock = mock(async () => {
  if (logoutDeferred) {
    await logoutDeferred.promise;
  }
  setHarnessState({ authStatus: "unauthenticated" });
});

function clearAllMocks(): void {
  connectMock.mockClear();
  disconnectMock.mockClear();
  stopMeetingMock.mockClear();
  resetSessionMock.mockClear();
  requestMeetingListMock.mockClear();
  startMeetingMock.mockClear();
  startSessionMock.mockClear();
  stopSessionMock.mockClear();
  sendAudioMock.mockClear();
  sendCameraFrameMock.mockClear();
  updateMeetingTitleMock.mockClear();
  updateSpeakerAliasMock.mockClear();
  setImageModelPresetMock.mockClear();
  recordingStartMock.mockClear();
  recordingStopMock.mockClear();
  localStartMock.mockClear();
  localWriteChunkMock.mockClear();
  localStopMock.mockClear();
  removePendingRecordingMock.mockClear();
  localResetMock.mockClear();
  uploadMock.mockClear();
  cancelUploadMock.mockClear();
  onRefreshMeetingsMock.mockClear();
  clearMeetingListRequestTimeoutMock.mockClear();
  confirmDiscardMock.mockClear();
  beforeUnloadGuardMock.mockClear();
  cameraCaptureMock.mockClear();
  authLogoutMock.mockClear();
}

mock.module("@/app/bridge", () => ({
  confirmDiscardUnsavedRecording: (_message?: string) => confirmDiscardMock(),
  triggerAnchorDownload: () => {},
  alertReportDownloadError: () => {},
}));

mock.module("@/hooks/useAuth", () => ({
  useAuth: () => {
    const state = useSyncExternalStore(subscribeHarness, getHarnessState, getHarnessState);
    return {
      status: state.authStatus,
      user: state.authStatus === "authenticated" ? AUTH_USER : null,
      error: null,
      isSubmitting: false,
      login: async () => true,
      signup: async () => true,
      logout: authLogoutMock,
      refresh: async () => true,
    };
  },
}));

mock.module("@/hooks/useMeetingSession", () => ({
  useMeetingSession: () => {
    const state = useSyncExternalStore(subscribeHarness, getHarnessState, getHarnessState);
    return {
      isConnected: state.isConnected,
      sessionStatus: "idle" as const,
      generationPhase: "idle" as const,
      error: null,
      meeting: {
        meetingId: state.meetingId,
        meetingTitle: state.meetingTitle,
        sessionId: state.sessionId,
        meetingList: state.meetingList,
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
        preset: "flash" as const,
        model: "gemini-2.5-flash-image-preview",
        available: {
          flash: "gemini-2.5-flash-image-preview",
          pro: "gemini-2.5-pro-image-preview",
        },
      },
      isAnalyzing: false,
      isGenerating: false,
      connect: connectMock,
      disconnect: disconnectMock,
      sendAudio: sendAudioMock,
      startMeeting: startMeetingMock,
      stopMeeting: stopMeetingMock,
      requestMeetingList: requestMeetingListMock,
      updateMeetingTitle: updateMeetingTitleMock,
      updateSpeakerAlias: updateSpeakerAliasMock,
      startSession: startSessionMock,
      stopSession: stopSessionMock,
      sendCameraFrame: sendCameraFrameMock,
      setImageModelPreset: setImageModelPresetMock,
      resetSession: resetSessionMock,
    };
  },
}));

mock.module("@/hooks/useMediaStreamController", () => ({
  useMediaStreamController: () => ({
    stream: null,
    audioStream: null,
    videoStream: null,
    error: null,
    isLoading: false,
    isSwitching: false,
    hasPermission: true,
    audioDevices: [],
    videoDevices: [],
    selectedAudioDeviceId: null,
    selectedVideoDeviceId: null,
    sourceType: "camera" as const,
    videoRef: { current: null },
    requestPermission: async () => true,
    stopStream: () => {},
    setAudioDevice: async (_deviceId: string) => {},
    setVideoDevice: async (_deviceId: string) => {},
    switchSourceType: (_type: "camera" | "screen") => {},
    switchVideoSource: async (_type: "camera" | "screen") => true,
  }),
}));

mock.module("@/hooks/useRecordingController", () => ({
  useRecordingController: () => {
    const state = useSyncExternalStore(subscribeHarness, getHarnessState, getHarnessState);
    return {
      isRecording: state.recordingIsRecording,
      isPendingStart: false,
      error: null,
      start: recordingStartMock,
      stop: recordingStopMock,
    };
  },
}));

mock.module("@/hooks/useLocalRecording", () => ({
  useLocalRecording: () => {
    const state = useSyncExternalStore(subscribeHarness, getHarnessState, getHarnessState);
    return {
      isRecording: false,
      sessionId: state.localSessionId,
      totalChunks: state.localTotalChunks,
      pendingRecordings: state.pendingRecordings,
      error: null,
      start: localStartMock,
      writeChunk: localWriteChunkMock,
      stop: localStopMock,
      removePendingRecording: removePendingRecordingMock,
      reset: localResetMock,
    };
  },
}));

mock.module("@/hooks/useAudioUpload", () => ({
  useAudioUpload: () => ({
    isUploading: false,
    progress: 0,
    error: null,
    lastUploadedSessionId: null,
    lastUploadedAudioUrl: null,
    uploadedCount: 0,
    totalCount: 0,
    upload: uploadMock,
    cancel: cancelUploadMock,
  }),
}));

mock.module("@/hooks/useElapsedTime", () => ({
  useElapsedTime: () => ({
    elapsedSeconds: 0,
    formattedTime: "00:00",
  }),
}));

mock.module("@/hooks/useBeforeUnloadGuard", () => ({
  useBeforeUnloadGuard: beforeUnloadGuardMock,
}));

mock.module("@/hooks/useCameraCapture", () => ({
  useCameraCapture: cameraCaptureMock,
}));

mock.module("./useMeetingListFlow", () => ({
  useMeetingListFlow: ({
    appActions,
  }: {
    appActions: { setMeetingState: (patch: unknown) => void };
  }) => ({
    onNewMeeting: (title?: string) => {
      const nextMeetingId = "meeting-new";
      const nextSessionId = "session-new";
      setHarnessState({
        meetingId: nextMeetingId,
        meetingTitle: title ?? "Untitled Meeting",
        sessionId: nextSessionId,
      });
      appActions.setMeetingState({
        view: "recording",
        meetingId: nextMeetingId,
        meetingTitle: title ?? "Untitled Meeting",
        sessionId: nextSessionId,
      });
    },
    onSelectMeeting: (meetingId: string) => {
      const nextSessionId = `session-${meetingId}`;
      setHarnessState({
        meetingId,
        meetingTitle: "Selected Meeting",
        sessionId: nextSessionId,
      });
      appActions.setMeetingState({
        view: "recording",
        meetingId,
        meetingTitle: "Selected Meeting",
        sessionId: nextSessionId,
      });
    },
    onRefreshMeetings: onRefreshMeetingsMock,
    clearMeetingListRequestTimeout: clearMeetingListRequestTimeoutMock,
  }),
}));

mock.module("../view/AppShellSelectView", () => ({
  AppShellSelectView: (props: {
    onSelectMeeting: (meetingId: string) => void;
    onLogout: () => Promise<void>;
  }) => (
    <div data-testid="select-view">
      <button type="button" onClick={() => props.onSelectMeeting("meeting-1")}>
        会議を選択
      </button>
      <button type="button" onClick={() => props.onLogout()}>
        ログアウト
      </button>
    </div>
  ),
}));

mock.module("../view/AppShellRecordingView", () => ({
  AppShellRecordingView: (props: {
    viewModel: { onBackRequested: () => void; onLogout: () => Promise<void> };
  }) => (
    <div data-testid="recording-view">
      <button type="button" aria-label="Back" onClick={() => props.viewModel.onBackRequested()}>
        Back
      </button>
      <button type="button" onClick={() => props.viewModel.onLogout()}>
        ログアウト
      </button>
    </div>
  ),
}));

mock.module("@/hooks/usePaneState", () => ({
  usePaneState: () => STABLE_PANE_STATE,
}));

mock.module("@/hooks/usePopoutWindow", () => ({
  usePopoutWindow: () => STABLE_POPOUT,
}));

const { AppShell } = await import("./AppShell");

async function goToRecordingView(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "会議を選択" }));
  await waitFor(() => {
    expect(screen.getByTestId("recording-view")).toBeTruthy();
  });
}

describe("AppShell integration", () => {
  beforeEach(() => {
    cleanup();
    resetHarnessState();
    clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("select から meeting 選択で recording 画面へ遷移する", async () => {
    render(<AppShell />);

    expect(screen.getByTestId("select-view")).toBeTruthy();
    await goToRecordingView();

    expect(screen.queryByTestId("select-view")).toBeNull();
    expect(screen.getByTestId("recording-view")).toBeTruthy();
  });

  test("未保存録音があり戻る確認でキャンセルした場合は recording に留まる", async () => {
    confirmDiscardMock.mockReturnValue(false);
    resetHarnessState({
      recordingIsRecording: true,
      localSessionId: "local-session-1",
      localTotalChunks: 3,
      pendingRecordings: [
        {
          recordingId: "recording-1",
          sessionId: "local-session-1",
          totalChunks: 3,
          createdAt: 1,
        },
      ],
    });
    render(<AppShell />);
    await goToRecordingView();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(confirmDiscardMock).toHaveBeenCalledTimes(1);
    expect(stopMeetingMock).not.toHaveBeenCalled();
    expect(resetSessionMock).not.toHaveBeenCalled();
    expect(recordingStopMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("recording-view")).toBeTruthy();
  });

  test("未保存録音があり戻る確認で許可した場合は select に戻る", async () => {
    confirmDiscardMock.mockReturnValue(true);
    resetHarnessState({
      recordingIsRecording: true,
      localSessionId: "local-session-1",
      localTotalChunks: 3,
      pendingRecordings: [
        {
          recordingId: "recording-1",
          sessionId: "local-session-1",
          totalChunks: 3,
          createdAt: 1,
        },
      ],
    });
    render(<AppShell />);
    await goToRecordingView();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => {
      expect(screen.getByTestId("select-view")).toBeTruthy();
    });
    expect(stopMeetingMock).toHaveBeenCalledTimes(1);
    expect(resetSessionMock).toHaveBeenCalledTimes(1);
    expect(recordingStopMock).toHaveBeenCalledTimes(1);
    expect(localResetMock).toHaveBeenCalledTimes(1);
  });

  test("logout 中は切断後でも自動再接続しない", async () => {
    resetHarnessState({ isConnected: true });
    logoutDeferred = createDeferredPromise();
    render(<AppShell />);
    await goToRecordingView();

    expect(connectMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
    expect(connectMock).not.toHaveBeenCalled();

    logoutDeferred.resolve();
    await waitFor(() => {
      expect(screen.getByLabelText(/email|メールアドレス/i)).toBeTruthy();
    });
    expect(connectMock).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  mock.restore();
});
