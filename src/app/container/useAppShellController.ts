import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePaneState } from "@/hooks/usePaneState";
import { usePopoutWindow } from "@/hooks/usePopoutWindow";
import { useMediaStreamController } from "@/hooks/useMediaStreamController";
import { useRecordingController } from "@/hooks/useRecordingController";
import { useLocalRecording } from "@/hooks/useLocalRecording";
import { useAudioUpload } from "@/hooks/useAudioUpload";
import { useCameraCapture } from "@/hooks/useCameraCapture";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { useAuth } from "@/hooks/useAuth";
import { useMeetingSession } from "@/hooks/useMeetingSession";
import { triggerAnchorDownload } from "@/app/bridge";
import { recordingLifecycleUsecase } from "@/app/usecases";
import { shouldAutoConnect } from "@/logic/connection-guards";
import type { CameraFrame } from "@/types/messages";
import type { PaneId } from "@/logic/pane-state-controller";
import type { AppShellViewModel, AudioDownloadOption } from "./app-shell-types";
import { useAppShellStore } from "./useAppShellStore";
import { useAppShellStoreBridge } from "./useAppShellStoreBridge";
import { useMeetingListFlow } from "./useMeetingListFlow";
import { useSessionNavigation } from "./useSessionNavigation";
import { useTranslation } from "react-i18next";

export type { AppShellViewModel } from "./app-shell-types";

interface AudioRecordingsApiPayload {
  recordings?: Array<{
    id?: unknown;
    sessionId?: unknown;
    fileSizeBytes?: unknown;
    createdAt?: unknown;
    url?: unknown;
  }>;
}

function formatAudioFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAudioCreatedAt(createdAt: number): string {
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return "--";
  }

  return new Date(createdAt).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useAppShellController(): AppShellViewModel {
  const { t } = useTranslation();
  const auth = useAuth();
  const session = useMeetingSession();
  const media = useMediaStreamController();
  const localRecording = useLocalRecording();

  const { appStore, appState, appActions } = useAppShellStore({
    updateMeetingTitle: session.updateMeetingTitle,
    setImageModelPreset: session.setImageModelPreset,
    setAudioDevice: media.setAudioDevice,
    setVideoDevice: media.setVideoDevice,
    switchSourceType: media.switchSourceType,
    switchVideoSource: media.switchVideoSource,
  });

  const localRecordingRef = useRef(localRecording);
  localRecordingRef.current = localRecording;

  const handleUploadComplete = useCallback((uploadedRecordingId: string) => {
    localRecordingRef.current.removePendingRecording(uploadedRecordingId);
  }, []);

  const audioUpload = useAudioUpload({ onComplete: handleUploadComplete });
  const paneState = usePaneState();
  const [audioDownloadOptions, setAudioDownloadOptions] = useState<AudioDownloadOption[]>([]);
  const [isAudioListLoading, setIsAudioListLoading] = useState(false);
  const [audioListError, setAudioListError] = useState<string | null>(null);

  const summaryPopout = usePopoutWindow({
    title: t("layout.paneSummary"),
    width: 600,
    height: 800,
    onClose: () => paneState.closePopout("summary"),
  });
  const cameraPopout = usePopoutWindow({
    title: t("layout.paneCamera"),
    width: 800,
    height: 600,
    onClose: () => paneState.closePopout("camera"),
  });
  const graphicsPopout = usePopoutWindow({
    title: t("layout.paneGraphics"),
    width: 1024,
    height: 768,
    onClose: () => paneState.closePopout("graphics"),
  });

  const onPopout = useCallback(
    async (paneId: PaneId) => {
      const popouts = { summary: summaryPopout, camera: cameraPopout, graphics: graphicsPopout };
      const success = await popouts[paneId].open();
      if (success) {
        paneState.popoutPane(paneId);
      }
    },
    [summaryPopout, cameraPopout, graphicsPopout, paneState],
  );

  useEffect(() => {
    if (!paneState.popoutPanes.has("summary") && summaryPopout.isOpen) summaryPopout.close();
    if (!paneState.popoutPanes.has("camera") && cameraPopout.isOpen) cameraPopout.close();
    if (!paneState.popoutPanes.has("graphics") && graphicsPopout.isOpen) graphicsPopout.close();
  }, [paneState.popoutPanes, summaryPopout, cameraPopout, graphicsPopout]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        paneState.collapsePane();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [paneState]);

  const onChunk = useCallback(
    (data: ArrayBuffer) => {
      session.sendAudio(data);
      localRecordingRef.current.writeChunk(data);
    },
    [session],
  );

  const recordingLifecycle = useMemo(
    () =>
      recordingLifecycleUsecase({
        startSession: session.startSession,
        stopSession: session.stopSession,
        startLocalRecording: (sessionId: string) => {
          localRecordingRef.current.start(sessionId);
        },
        stopLocalRecording: () => {
          localRecordingRef.current.stop();
        },
        getSessionId: () => session.meeting.sessionId,
        hasLocalAudioFile: () =>
          localRecordingRef.current.pendingRecordings.length > 0 ||
          localRecordingRef.current.totalChunks > 0,
        onRecordingStopped: (hasLocalFile) => {
          appActions.setRecordingState({ hasLocalFile });
        },
      }),
    [appActions, session],
  );

  const onSessionStart = useCallback(() => {
    recordingLifecycle.start();
  }, [recordingLifecycle]);

  const onSessionStop = useCallback(() => {
    recordingLifecycle.stop();
  }, [recordingLifecycle]);

  const recording = useRecordingController({
    audioStream: media.audioStream,
    hasPermission: media.hasPermission,
    isConnected: session.isConnected,
    hasMeeting: appState.derived.hasMeeting,
    onChunk,
    onSessionStart,
    onSessionStop,
  });

  const { formattedTime: elapsedTime } = useElapsedTime({ enabled: recording.isRecording });

  useAppShellStoreBridge({
    appStore,
    appActions,
    auth,
    session,
    media,
    recording,
    audioUpload,
    paneState,
    elapsedTime,
    localSessionId: localRecording.sessionId,
    localPendingCount: localRecording.pendingRecordings.length,
  });

  const { onNewMeeting, onSelectMeeting, onRefreshMeetings, clearMeetingListRequestTimeout } =
    useMeetingListFlow({
      authStatus: auth.status,
      meetingView: appState.meeting.view,
      session,
      appStore,
      appActions,
      localRecordingRef,
    });

  const hasUnsavedRecording = appState.derived.hasUnsavedRecording;
  useBeforeUnloadGuard(hasUnsavedRecording);

  const { isLogoutInProgressRef, onBackRequested, onLogout } = useSessionNavigation({
    auth,
    session,
    recording,
    appActions,
    localRecordingRef,
    clearMeetingListRequestTimeout,
    hasUnsavedRecording,
  });

  useEffect(() => {
    if (shouldAutoConnect(auth.status, session.isConnected, isLogoutInProgressRef.current)) {
      session.connect();
    }
  }, [auth.status, session.connect, session.isConnected]);

  const onFrameCaptured = useCallback(
    (frame: CameraFrame) => {
      if (session.meeting.mode !== "record") {
        return;
      }
      session.sendCameraFrame(frame);
    },
    [session.meeting.mode, session.sendCameraFrame],
  );

  useCameraCapture({
    videoRef: media.videoElementRef,
    isRecording: recording.isRecording,
    onFrameCaptured,
  });

  const error = media.error || session.error || recording.error;

  const onRequestPermission = useCallback(async () => {
    await media.requestPermission();
  }, [media]);

  const onStartRecording = useCallback(() => {
    if (session.meeting.mode !== "record") {
      return;
    }
    recording.start();
  }, [recording, session.meeting.mode]);

  const onStopRecording = useCallback(() => {
    if (session.meeting.mode !== "record") {
      return;
    }
    recording.stop();
  }, [recording, session.meeting.mode]);

  const onResumeMeeting = useCallback(() => {
    if (!session.meeting.meetingId) {
      return;
    }
    session.setMeetingMode("record");
  }, [session]);

  const onUpload = useCallback(
    (meetingId: string) => {
      if (session.meeting.mode !== "record") {
        return;
      }
      audioUpload.upload(localRecordingRef.current.pendingRecordings, meetingId);
    },
    [audioUpload, session.meeting.mode],
  );

  const onCancelUpload = useCallback(() => {
    audioUpload.cancel();
  }, [audioUpload]);

  const onDownloadReport = useCallback(async () => {
    await appActions.downloadReport();
  }, [appActions]);

  useEffect(() => {
    setAudioDownloadOptions([]);
    setAudioListError(null);
    setIsAudioListLoading(false);
  }, [appState.meeting.meetingId]);

  const onOpenAudioList = useCallback(async () => {
    const meetingId = appState.meeting.meetingId;
    if (!meetingId || typeof window === "undefined") {
      setAudioDownloadOptions([]);
      return;
    }

    try {
      setIsAudioListLoading(true);
      setAudioListError(null);
      const response = await fetch(`/api/meetings/${meetingId}/audio`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to load audio list: ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as AudioRecordingsApiPayload;
      const recordings = Array.isArray(payload.recordings) ? payload.recordings : [];
      const options: AudioDownloadOption[] = [];

      for (const recording of recordings) {
        if (typeof recording?.id !== "number") continue;
        if (typeof recording?.sessionId !== "string") continue;
        if (typeof recording?.fileSizeBytes !== "number") continue;
        if (typeof recording?.createdAt !== "number") continue;
        if (typeof recording?.url !== "string") continue;

        let parsed: URL;
        try {
          parsed = new URL(recording.url, window.location.origin);
        } catch {
          continue;
        }

        if (!parsed.pathname.startsWith(`/api/meetings/${meetingId}/audio/`)) {
          continue;
        }

        const url =
          parsed.origin === window.location.origin
            ? `${parsed.pathname}${parsed.search}`
            : parsed.toString();
        options.push({
          id: recording.id,
          url,
          createdAt: recording.createdAt,
          fileSizeBytes: recording.fileSizeBytes,
          label: `${formatAudioCreatedAt(recording.createdAt)} · ${formatAudioFileSize(recording.fileSizeBytes)}`,
        });
      }

      setAudioDownloadOptions(options);
    } catch {
      setAudioDownloadOptions([]);
      setAudioListError(t("report.audioLoadFailed"));
    } finally {
      setIsAudioListLoading(false);
    }
  }, [appState.meeting.meetingId, t]);

  const onDownloadAudio = useCallback(
    (audioUrl: string) => {
      const meetingId = appState.meeting.meetingId;
      if (!audioUrl || !meetingId || typeof window === "undefined") {
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(audioUrl, window.location.origin);
      } catch {
        return;
      }

      if (!parsed.pathname.startsWith(`/api/meetings/${meetingId}/audio/`)) {
        return;
      }

      const downloadUrl =
        parsed.origin === window.location.origin
          ? `${parsed.pathname}${parsed.search}`
          : parsed.toString();
      triggerAnchorDownload(downloadUrl);
    },
    [appState.meeting.meetingId],
  );

  return {
    auth: {
      status: auth.status,
      isSubmitting: auth.isSubmitting,
      error: auth.error,
      login: auth.login,
      signup: auth.signup,
    },
    appState,
    session,
    media,
    recording,
    localRecording,
    audioUpload,
    audioDownloadOptions,
    isAudioListLoading,
    audioListError,
    paneState,
    popouts: {
      summary: summaryPopout,
      camera: cameraPopout,
      graphics: graphicsPopout,
    },
    elapsedTime,
    error,
    onPopout,
    onNewMeeting,
    onSelectMeeting,
    onRefreshMeetings,
    onResumeMeeting,
    onRequestPermission,
    onStartRecording,
    onStopRecording,
    onUpload,
    onCancelUpload,
    onDownloadReport,
    onOpenAudioList,
    onDownloadAudio,
    onBackRequested,
    onLogout,
  };
}
