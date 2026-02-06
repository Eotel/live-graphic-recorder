/**
 * Regression tests for logout/reconnect race conditions in App.
 *
 * Related: src/App.tsx
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useMemo, useState } from "react";

const connectSpy = mock(() => {});
const disconnectSpy = mock(() => {});
const requestMeetingListSpy = mock(() => {});
const logoutSpy = mock(() => {});

let resolveLogout: (() => void) | null = null;

mock.module("@/components/pages/MeetingSelectPage", () => ({
  MeetingSelectPage: () => <div data-testid="meeting-select-page">MeetingSelectPage</div>,
}));

mock.module("@/components/pages/LoginPage", () => ({
  LoginPage: () => <div data-testid="login-page">LoginPage</div>,
}));

mock.module("@/hooks/useAuth", () => ({
  useAuth: () => {
    const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">(
      "authenticated",
    );

    const logout = useCallback(async () => {
      logoutSpy();
      await new Promise<void>((resolve) => {
        resolveLogout = () => {
          setStatus("unauthenticated");
          resolve();
        };
      });
    }, []);

    return {
      status,
      user: { id: "user-1", email: "user@example.com" },
      error: null,
      isSubmitting: false,
      login: async () => true,
      signup: async () => true,
      logout,
      refresh: async () => true,
    };
  },
}));

mock.module("@/hooks/useMeetingSession", () => ({
  useMeetingSession: () => {
    const [isConnected, setIsConnected] = useState(false);
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

    const connect = useCallback(() => {
      connectSpy();
      setIsConnected(true);
    }, []);
    const disconnect = useCallback(() => {
      disconnectSpy();
      setIsConnected(false);
    }, []);
    const sendAudio = useCallback(() => {}, []);
    const startMeeting = useCallback(() => {}, []);
    const stopMeeting = useCallback(() => {}, []);
    const requestMeetingList = useCallback(() => {
      requestMeetingListSpy();
    }, []);
    const updateMeetingTitle = useCallback(() => {}, []);
    const startSession = useCallback(() => {}, []);
    const stopSession = useCallback(() => {}, []);
    const sendCameraFrame = useCallback(() => {}, []);
    const setImageModelPreset = useCallback(() => {}, []);
    const resetSession = useCallback(() => {}, []);

    return {
      isConnected,
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
  useRecordingController: () => ({
    isRecording: false,
    error: null,
    start: () => {},
    stop: () => {},
  }),
}));

mock.module("@/hooks/useLocalRecording", () => ({
  useLocalRecording: () => ({
    sessionId: null,
    totalChunks: 0,
    writeChunk: () => {},
    start: () => {},
    stop: () => {},
    reset: () => {},
  }),
}));

mock.module("@/hooks/useAudioUpload", () => ({
  useAudioUpload: () => ({
    isUploading: false,
    progress: 0,
    error: null,
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
  useBeforeUnloadGuard: () => {},
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

describe("App logout reconnection guard", () => {
  beforeEach(() => {
    connectSpy.mockClear();
    disconnectSpy.mockClear();
    requestMeetingListSpy.mockClear();
    logoutSpy.mockClear();
    resolveLogout = null;
  });

  afterEach(() => {
    cleanup();
    resolveLogout = null;
  });

  test("does not reconnect while logout is still pending", async () => {
    render(<App />);

    await waitFor(() => {
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });

    // While auth.status is still "authenticated", disconnect should not trigger auto reconnect.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(resolveLogout).toBeTruthy();

    await act(async () => {
      resolveLogout?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeDefined();
    });
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });
});
