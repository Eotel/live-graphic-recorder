/**
 * Regression tests for unsaved-recording guard behavior in App.
 *
 * Related: src/App.tsx
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useCallback, useEffect, useMemo } from "react";

const beforeUnloadGuardSpy = mock((_enabled: boolean) => {});

const recordingState = {
  isRecording: false,
  error: null as string | null,
};

const localRecordingState = {
  sessionId: null as string | null,
  totalChunks: 0,
};

const audioUploadState = {
  isUploading: false,
  progress: 0,
  error: null as string | null,
  lastUploadedSessionId: null as string | null,
};

let autoTriggerSessionStop = false;
let hasTriggeredSessionStop = false;

mock.module("@/components/pages/MeetingSelectPage", () => ({
  MeetingSelectPage: () => <div data-testid="meeting-select-page">MeetingSelectPage</div>,
}));

mock.module("@/components/pages/LoginPage", () => ({
  LoginPage: () => <div data-testid="login-page">LoginPage</div>,
}));

mock.module("@/hooks/useAuth", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: { id: "user-1", email: "user@example.com" },
    error: null,
    isSubmitting: false,
    login: async () => true,
    signup: async () => true,
    logout: async () => {},
    refresh: async () => true,
  }),
}));

mock.module("@/hooks/useMeetingSession", () => ({
  useMeetingSession: () => {
    const meeting = useMemo(
      () => ({
        meetingId: null,
        meetingTitle: null,
        sessionId: null,
        meetingList: [] as Array<{
          id: string;
          title: string | null;
          startedAt: number;
          endedAt: number | null;
          createdAt: number;
        }>,
      }),
      [],
    );

    const connect = useCallback(() => {}, []);
    const disconnect = useCallback(() => {}, []);
    const sendAudio = useCallback(() => {}, []);
    const startMeeting = useCallback(() => {}, []);
    const stopMeeting = useCallback(() => {}, []);
    const requestMeetingList = useCallback(() => {}, []);
    const updateMeetingTitle = useCallback(() => {}, []);
    const startSession = useCallback(() => {}, []);
    const stopSession = useCallback(() => {}, []);
    const sendCameraFrame = useCallback(() => {}, []);
    const setImageModelPreset = useCallback(() => {}, []);
    const resetSession = useCallback(() => {}, []);

    return {
      isConnected: true,
      sessionStatus: "idle" as const,
      generationPhase: "idle" as const,
      error: null,
      meeting,
      transcriptSegments: [],
      interimText: "",
      interimSpeaker: undefined,
      interimStartTime: undefined,
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
        },
      },
      isAnalyzing: false,
      isGenerating: false,
      connect,
      disconnect,
      sendAudio,
      startMeeting,
      stopMeeting,
      requestMeetingList,
      updateMeetingTitle,
      startSession,
      stopSession,
      sendCameraFrame,
      setImageModelPreset,
      resetSession,
    };
  },
}));

mock.module("@/hooks/useMediaStreamController", () => ({
  useMediaStreamController: () => ({
    audioStream: null,
    stream: null,
    videoRef: { current: null },
    sourceType: "camera" as const,
    hasPermission: false,
    isLoading: false,
    isSwitching: false,
    error: null,
    audioDevices: [],
    videoDevices: [],
    selectedAudioDeviceId: null,
    selectedVideoDeviceId: null,
    requestPermission: async () => true,
    switchSourceType: async () => true,
    switchVideoSource: async () => true,
    setAudioDevice: async () => {},
    setVideoDevice: async () => {},
  }),
}));

mock.module("@/hooks/useRecordingController", () => ({
  useRecordingController: ({ onSessionStop }: { onSessionStop: () => void }) => {
    useEffect(() => {
      if (!autoTriggerSessionStop || hasTriggeredSessionStop) return;
      hasTriggeredSessionStop = true;
      onSessionStop();
    }, [onSessionStop]);

    const start = useCallback(() => {}, []);
    const stop = useCallback(() => {}, []);

    return {
      isRecording: recordingState.isRecording,
      error: recordingState.error,
      start,
      stop,
    };
  },
}));

mock.module("@/hooks/useLocalRecording", () => ({
  useLocalRecording: () => ({
    sessionId: localRecordingState.sessionId,
    totalChunks: localRecordingState.totalChunks,
    writeChunk: () => {},
    start: () => {},
    stop: () => {},
    reset: () => {
      localRecordingState.sessionId = null;
      localRecordingState.totalChunks = 0;
    },
  }),
}));

mock.module("@/hooks/useAudioUpload", () => ({
  useAudioUpload: () => ({
    isUploading: audioUploadState.isUploading,
    progress: audioUploadState.progress,
    error: audioUploadState.error,
    lastUploadedSessionId: audioUploadState.lastUploadedSessionId,
    upload: () => {},
    cancel: () => {},
  }),
}));

mock.module("@/hooks/useCameraCapture", () => ({
  useCameraCapture: () => {},
}));

mock.module("@/hooks/useElapsedTime", () => ({
  useElapsedTime: () => ({ formattedTime: "00:00" }),
}));

mock.module("@/hooks/useBeforeUnloadGuard", () => ({
  useBeforeUnloadGuard: (enabled: boolean) => {
    beforeUnloadGuardSpy(enabled);
  },
}));

mock.module("@/hooks/usePaneState", () => ({
  usePaneState: () => ({
    expandedPane: null,
    popoutPanes: new Set<"summary" | "camera" | "graphics">(),
    getPaneMode: () => "normal" as const,
    expandPane: () => {},
    collapsePane: () => {},
    popoutPane: () => {},
    closePopout: () => {},
  }),
}));

mock.module("@/hooks/usePopoutWindow", () => ({
  usePopoutWindow: () =>
    ({
      isOpen: false,
      popoutWindow: null,
      portalContainer: null,
      open: async () => false,
      close: () => {},
    }) as const,
}));

const { App } = await import("./App");

describe("App unsaved recording guard", () => {
  beforeEach(() => {
    beforeUnloadGuardSpy.mockClear();
    recordingState.isRecording = false;
    recordingState.error = null;
    localRecordingState.sessionId = null;
    localRecordingState.totalChunks = 0;
    audioUploadState.isUploading = false;
    audioUploadState.progress = 0;
    audioUploadState.error = null;
    audioUploadState.lastUploadedSessionId = null;
    autoTriggerSessionStop = false;
    hasTriggeredSessionStop = false;
  });

  afterEach(() => {
    cleanup();
  });

  test("clears unsaved flag after upload succeeds for the same session", async () => {
    localRecordingState.sessionId = "session-1";
    localRecordingState.totalChunks = 3;
    autoTriggerSessionStop = true;

    const { rerender } = render(<App />);

    await waitFor(() => {
      expect(beforeUnloadGuardSpy.mock.calls.some((call) => call[0] === true)).toBe(true);
    });

    await act(async () => {
      audioUploadState.lastUploadedSessionId = "session-1";
      rerender(<App />);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(beforeUnloadGuardSpy.mock.calls.at(-1)?.[0]).toBe(false);
    });
  });

  test("keeps unsaved flag when uploaded session does not match local session", async () => {
    localRecordingState.sessionId = "session-1";
    localRecordingState.totalChunks = 3;
    autoTriggerSessionStop = true;

    const { rerender } = render(<App />);

    await waitFor(() => {
      expect(beforeUnloadGuardSpy.mock.calls.some((call) => call[0] === true)).toBe(true);
    });

    const callsBeforeUpload = beforeUnloadGuardSpy.mock.calls.length;

    await act(async () => {
      audioUploadState.lastUploadedSessionId = "session-2";
      rerender(<App />);
      await Promise.resolve();
    });

    const callsAfterUpload = beforeUnloadGuardSpy.mock.calls
      .slice(callsBeforeUpload)
      .map((call) => call[0]);

    expect(callsAfterUpload.includes(false)).toBe(false);
    expect(beforeUnloadGuardSpy.mock.calls.at(-1)?.[0]).toBe(true);
  });

  test("keeps unsaved flag while recording even without local file", async () => {
    recordingState.isRecording = true;

    render(<App />);

    await waitFor(() => {
      expect(beforeUnloadGuardSpy.mock.calls.at(-1)?.[0]).toBe(true);
    });
  });
});
