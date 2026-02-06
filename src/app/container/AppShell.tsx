/**
 * Main application component for Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/layout/MainLayout.tsx, src/hooks/*
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";

import { MainLayout } from "@/components/layout/MainLayout";
import { PaneToolbar } from "@/components/layout/PaneToolbar";
import { PopoutPane } from "@/components/layout/PopoutPane";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { RecordingControls } from "@/components/recording/RecordingControls";
import { CloudSaveButton } from "@/components/recording/CloudSaveButton";
import { CameraPreview } from "@/components/recording/CameraPreview";
import { DeviceSelector } from "@/components/recording/DeviceSelector";
import { MediaSourceToggle } from "@/components/recording/MediaSourceToggle";
import { SummaryPanel } from "@/components/summary/SummaryPanel";
import { TagList } from "@/components/summary/TagList";
import { TopicIndicator } from "@/components/summary/TopicIndicator";
import { FlowMeter } from "@/components/metrics/FlowMeter";
import { HeatMeter } from "@/components/metrics/HeatMeter";
import { ImageCarousel } from "@/components/graphics/ImageCarousel";
import { ImageModelToggle } from "@/components/graphics/ImageModelToggle";
import { LoginPage } from "@/components/pages/LoginPage";
import { MeetingSelectPage } from "@/components/pages/MeetingSelectPage";
import { MeetingHeader } from "@/components/navigation/MeetingHeader";

import { usePaneState } from "@/hooks/usePaneState";
import { usePopoutWindow } from "@/hooks/usePopoutWindow";
import { PaneContext } from "@/contexts/PaneContext";
import { useMediaStreamController } from "@/hooks/useMediaStreamController";
import { useRecordingController } from "@/hooks/useRecordingController";
import { useLocalRecording } from "@/hooks/useLocalRecording";
import { useAudioUpload } from "@/hooks/useAudioUpload";
import { useCameraCapture } from "@/hooks/useCameraCapture";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { useAuth } from "@/hooks/useAuth";
import { useMeetingSession } from "@/hooks/useMeetingSession";
import {
  alertReportDownloadError,
  confirmDiscardUnsavedRecording,
  triggerAnchorDownload,
} from "@/app/bridge";
import {
  createMeetingUsecase,
  downloadReportUsecase,
  logoutUsecase,
  recordingLifecycleUsecase,
  selectMeetingUsecase,
} from "@/app/usecases";
import { shouldAutoConnect } from "@/logic/connection-guards";
import {
  hasLocalAudioFile,
  hasUnsavedRecording,
  shouldClearLocalFileOnUpload,
} from "@/logic/unsaved-recording";
import type { CameraFrame } from "@/types/messages";

type View = "select" | "recording";
const MEETING_LIST_REQUEST_TIMEOUT_MS = 10000;
const MEETING_LIST_TIMEOUT_MESSAGE = "Failed to load past meetings. Please try again.";

export function AppShell() {
  const auth = useAuth();

  // View state for routing
  const [view, setView] = useState<View>("select");
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const reportDownloadLockRef = useRef(false);
  const reportDownloadUnlockTimerRef = useRef<number | null>(null);

  // Media stream management (controller-based)
  const media = useMediaStreamController();

  // Meeting session management (WebSocket, transcripts, analyses, images)
  const session = useMeetingSession();

  // Local audio recording to OPFS
  const localRecording = useLocalRecording();
  const [hasLocalFile, setHasLocalFile] = useState(false);
  const [isMeetingListLoading, setIsMeetingListLoading] = useState(false);
  const [meetingListError, setMeetingListError] = useState<string | null>(null);
  const meetingListRequestTimeoutRef = useRef<number | null>(null);
  const meetingListSnapshotRef = useRef(session.meeting.meetingList);
  const meetingListErrorBaselineRef = useRef<string | null>(null);
  const latestMeetingListRef = useRef(session.meeting.meetingList);
  latestMeetingListRef.current = session.meeting.meetingList;
  const latestSessionErrorRef = useRef(session.error);
  latestSessionErrorRef.current = session.error;
  const isLogoutInProgressRef = useRef(false);

  // Pane expand/popout state
  const paneState = usePaneState();

  // Popout windows — lifted to App level so open() can be called from click handlers
  // (Document PiP API requires transient activation / user gesture)
  const summaryPopout = usePopoutWindow({
    title: "Summary",
    width: 600,
    height: 800,
    onClose: () => paneState.closePopout("summary"),
  });
  const cameraPopout = usePopoutWindow({
    title: "Camera",
    width: 800,
    height: 600,
    onClose: () => paneState.closePopout("camera"),
  });
  const graphicsPopout = usePopoutWindow({
    title: "Graphics",
    width: 1024,
    height: 768,
    onClose: () => paneState.closePopout("graphics"),
  });

  // Popout click handlers — must be called from user gesture for Document PiP
  const handlePopout = useCallback(
    async (paneId: "summary" | "camera" | "graphics") => {
      const popouts = { summary: summaryPopout, camera: cameraPopout, graphics: graphicsPopout };
      const success = await popouts[paneId].open();
      if (success) {
        paneState.popoutPane(paneId);
      }
    },
    [summaryPopout, cameraPopout, graphicsPopout, paneState],
  );

  // Close popout when pane state changes to non-popout
  useEffect(() => {
    if (!paneState.popoutPanes.has("summary") && summaryPopout.isOpen) summaryPopout.close();
    if (!paneState.popoutPanes.has("camera") && cameraPopout.isOpen) cameraPopout.close();
    if (!paneState.popoutPanes.has("graphics") && graphicsPopout.isOpen) graphicsPopout.close();
  }, [paneState.popoutPanes, summaryPopout, cameraPopout, graphicsPopout]);

  // Escape key to collapse expanded pane
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        paneState.collapsePane();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [paneState]);

  // `onChunk` は `useRecordingController` に渡され、録音中に安定した参照である必要がある。
  // 一方で `localRecording` は hook の再生成などで参照が変わり得るため、依存配列に入れてしまうと
  // callback が差し替わって副作用を誘発しやすい。最新の `localRecording` を参照できるよう ref 経由にする
  // ことで、React の依存追跡を迂回しつつ stale closure を防ぐ。
  const localRecordingRef = useRef(localRecording);
  localRecordingRef.current = localRecording;

  const handleUploadComplete = useCallback((uploadedSessionId: string) => {
    if (
      !shouldClearLocalFileOnUpload(true, uploadedSessionId, localRecordingRef.current.sessionId)
    ) {
      return;
    }
    setHasLocalFile(false);
  }, []);

  // Audio upload to server
  const audioUpload = useAudioUpload({ onComplete: handleUploadComplete });

  // Recording orchestration (controller-based)
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
        resetLocalRecording: () => {
          setHasLocalFile(false);
          localRecordingRef.current.reset();
        },
        startLocalRecording: (sessionId: string) => {
          localRecordingRef.current.start(sessionId);
        },
        stopLocalRecording: () => {
          localRecordingRef.current.stop();
        },
        getSessionId: () => session.meeting.sessionId,
        hasLocalAudioFile: () =>
          hasLocalAudioFile(
            localRecordingRef.current.sessionId,
            localRecordingRef.current.totalChunks,
          ),
        onRecordingStopped: setHasLocalFile,
      }),
    [session],
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
    hasMeeting: session.meeting.meetingId !== null,
    onChunk,
    onSessionStart,
    onSessionStop,
  });

  const clearMeetingListRequestTimeout = useCallback(() => {
    if (meetingListRequestTimeoutRef.current !== null) {
      window.clearTimeout(meetingListRequestTimeoutRef.current);
      meetingListRequestTimeoutRef.current = null;
    }
  }, []);

  const finishMeetingListLoad = useCallback(() => {
    clearMeetingListRequestTimeout();
    setIsMeetingListLoading(false);
  }, [clearMeetingListRequestTimeout]);

  const startMeetingListLoad = useCallback(() => {
    clearMeetingListRequestTimeout();
    meetingListSnapshotRef.current = latestMeetingListRef.current;
    meetingListErrorBaselineRef.current = latestSessionErrorRef.current;
    setIsMeetingListLoading(true);
    setMeetingListError(null);
    meetingListRequestTimeoutRef.current = window.setTimeout(() => {
      meetingListRequestTimeoutRef.current = null;
      setIsMeetingListLoading(false);
      setMeetingListError(MEETING_LIST_TIMEOUT_MESSAGE);
    }, MEETING_LIST_REQUEST_TIMEOUT_MS);
  }, [clearMeetingListRequestTimeout]);

  // Auto-connect WebSocket after authentication
  useEffect(() => {
    if (shouldAutoConnect(auth.status, session.isConnected, isLogoutInProgressRef.current)) {
      session.connect();
    }
  }, [auth.status, session.connect, session.isConnected]);

  useEffect(() => {
    return () => {
      clearMeetingListRequestTimeout();
      if (reportDownloadUnlockTimerRef.current !== null) {
        window.clearTimeout(reportDownloadUnlockTimerRef.current);
        reportDownloadUnlockTimerRef.current = null;
      }
      reportDownloadLockRef.current = false;
    };
  }, [clearMeetingListRequestTimeout]);

  // Track pending meeting action (waiting for WebSocket connection)
  const pendingMeetingActionRef = useRef<{
    type: "new" | "select";
    title?: string;
    meetingId?: string;
  } | null>(null);

  // Handle connection established
  useEffect(() => {
    if (auth.status !== "authenticated") return;
    if (!session.isConnected) return;

    const pending = pendingMeetingActionRef.current;
    if (pending) {
      pendingMeetingActionRef.current = null;
      finishMeetingListLoad();
      setMeetingListError(null);
      setHasLocalFile(false);
      localRecordingRef.current.reset();
      if (pending.type === "new") {
        session.startMeeting(pending.title);
      } else {
        session.startMeeting(undefined, pending.meetingId);
      }
      setView("recording");
      return;
    }

    if (view !== "select") return;
    startMeetingListLoad();
    session.requestMeetingList();
  }, [
    auth.status,
    finishMeetingListLoad,
    session.isConnected,
    session.requestMeetingList,
    session.startMeeting,
    startMeetingListLoad,
    view,
  ]);

  useEffect(() => {
    if (!isMeetingListLoading) return;
    if (session.meeting.meetingList === meetingListSnapshotRef.current) return;
    finishMeetingListLoad();
    setMeetingListError(null);
  }, [finishMeetingListLoad, isMeetingListLoading, session.meeting.meetingList]);

  useEffect(() => {
    if (view !== "select") return;
    if (!isMeetingListLoading) return;
    if (!session.error) return;
    if (session.error === meetingListErrorBaselineRef.current) return;
    finishMeetingListLoad();
    setMeetingListError(session.error);
  }, [finishMeetingListLoad, isMeetingListLoading, session.error, view]);

  const prepareMeetingStart = useCallback(() => {
    finishMeetingListLoad();
    setMeetingListError(null);
    setHasLocalFile(false);
    localRecordingRef.current.reset();
  }, [finishMeetingListLoad]);

  const runCreateMeeting = useMemo(
    () =>
      createMeetingUsecase({
        isConnected: () => session.isConnected,
        connect: session.connect,
        startMeeting: session.startMeeting,
        beforeStart: prepareMeetingStart,
        onStarted: () => setView("recording"),
        setPendingAction: (action) => {
          pendingMeetingActionRef.current = action;
        },
      }),
    [prepareMeetingStart, session],
  );

  const runSelectMeeting = useMemo(
    () =>
      selectMeetingUsecase({
        isConnected: () => session.isConnected,
        connect: session.connect,
        startMeeting: (title, meetingId) => {
          session.startMeeting(title, meetingId);
        },
        beforeStart: prepareMeetingStart,
        onStarted: () => setView("recording"),
        setPendingAction: (action) => {
          pendingMeetingActionRef.current = action;
        },
      }),
    [prepareMeetingStart, session],
  );

  // Meeting handlers for MeetingSelectPage
  const handleNewMeeting = useCallback(
    (title?: string) => {
      runCreateMeeting(title);
    },
    [runCreateMeeting],
  );

  const handleSelectMeeting = useCallback(
    (meetingId: string) => {
      runSelectMeeting(meetingId);
    },
    [runSelectMeeting],
  );

  const handleRefreshMeetings = useCallback(() => {
    startMeetingListLoad();
    if (session.isConnected) {
      session.requestMeetingList();
      return;
    }
    session.connect();
  }, [session.connect, session.isConnected, session.requestMeetingList, startMeetingListLoad]);

  // Elapsed time tracking
  const { formattedTime: elapsedTime } = useElapsedTime({ enabled: recording.isRecording });

  useEffect(() => {
    if (
      shouldClearLocalFileOnUpload(
        hasLocalFile,
        audioUpload.lastUploadedSessionId,
        localRecording.sessionId,
      )
    ) {
      setHasLocalFile(false);
    }
  }, [audioUpload.lastUploadedSessionId, hasLocalFile, localRecording.sessionId]);

  const hasUnsavedRecordingFlag = hasUnsavedRecording(
    recording.isRecording,
    hasLocalFile,
    localRecording.sessionId,
  );
  useBeforeUnloadGuard(hasUnsavedRecordingFlag);

  // Camera frame capture
  const onFrameCaptured = useCallback(
    (frame: CameraFrame) => {
      session.sendCameraFrame(frame);
    },
    [session],
  );

  useCameraCapture({
    videoRef: media.videoRef,
    isRecording: recording.isRecording,
    onFrameCaptured,
  });

  // Combined error state
  const error = media.error || session.error || recording.error;

  // Handlers
  const handleRequestPermission = async () => {
    await media.requestPermission();
  };

  const handleStart = () => recording.start();
  const handleStop = () => recording.stop();

  const handleUpload = useCallback(
    (sid: string, mid: string) => {
      audioUpload.upload(sid, mid);
    },
    [audioUpload],
  );

  const handleCancelUpload = useCallback(() => {
    audioUpload.cancel();
  }, [audioUpload]);

  const meetingIdForReport = session.meeting.meetingId;
  const runDownloadReport = useMemo(
    () =>
      downloadReportUsecase({
        getMeetingId: () => meetingIdForReport,
        isLocked: () => reportDownloadLockRef.current,
        lock: () => {
          reportDownloadLockRef.current = true;
        },
        unlock: () => {
          reportDownloadLockRef.current = false;
        },
        setDownloading: setIsDownloadingReport,
        clearUnlockTimer: () => {
          if (reportDownloadUnlockTimerRef.current !== null) {
            window.clearTimeout(reportDownloadUnlockTimerRef.current);
            reportDownloadUnlockTimerRef.current = null;
          }
        },
        setUnlockTimer: (callback, delayMs) => {
          reportDownloadUnlockTimerRef.current = window.setTimeout(() => {
            reportDownloadUnlockTimerRef.current = null;
            callback();
          }, delayMs);
        },
        triggerDownload: triggerAnchorDownload,
        onError: (error) => {
          console.error("[Report] Download failed:", error);
          alertReportDownloadError(error);
        },
      }),
    [meetingIdForReport],
  );

  const handleDownloadReport = useCallback(async () => {
    await runDownloadReport();
  }, [runDownloadReport]);

  const handleBack = useCallback(() => {
    if (recording.isRecording) {
      recording.stop();
    }
    setHasLocalFile(false);
    localRecordingRef.current.reset();
    session.stopMeeting();
    session.resetSession();
    setView("select");
  }, [recording, session]);

  const handleBackRequested = useCallback(() => {
    if (hasUnsavedRecordingFlag && !confirmDiscardUnsavedRecording()) {
      return;
    }
    handleBack();
  }, [handleBack, hasUnsavedRecordingFlag]);

  const runLogout = useMemo(
    () =>
      logoutUsecase({
        isLogoutInProgress: () => isLogoutInProgressRef.current,
        setLogoutInProgress: (inProgress) => {
          isLogoutInProgressRef.current = inProgress;
        },
        beforeLogout: () => {
          if (recording.isRecording) {
            recording.stop();
          }
          clearMeetingListRequestTimeout();
          setIsMeetingListLoading(false);
          setMeetingListError(null);
          setHasLocalFile(false);
          localRecordingRef.current.reset();
          pendingMeetingActionRef.current = null;
          session.disconnect();
          session.resetSession();
          setView("select");
        },
        performLogout: auth.logout,
      }),
    [auth.logout, clearMeetingListRequestTimeout, recording, session],
  );

  const handleLogout = useCallback(async () => {
    await runLogout();
  }, [runLogout]);

  useEffect(() => {
    if (auth.status === "authenticated") return;
    isLogoutInProgressRef.current = false;
    clearMeetingListRequestTimeout();
    setIsMeetingListLoading(false);
    setMeetingListError(null);
  }, [auth.status, clearMeetingListRequestTimeout]);

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        認証状態を確認中...
      </div>
    );
  }

  if (auth.status !== "authenticated") {
    return (
      <LoginPage
        isSubmitting={auth.isSubmitting}
        error={auth.error}
        onLogin={auth.login}
        onSignup={auth.signup}
      />
    );
  }

  // Show meeting selection page
  if (view === "select") {
    return (
      <div className="relative">
        <div className="absolute right-4 top-4 z-20">
          <Button variant="outline" size="sm" type="button" onClick={handleLogout}>
            ログアウト
          </Button>
        </div>
        <MeetingSelectPage
          meetings={session.meeting.meetingList}
          isLoading={isMeetingListLoading}
          isConnected={session.isConnected}
          errorMessage={meetingListError}
          onNewMeeting={handleNewMeeting}
          onSelectMeeting={handleSelectMeeting}
          onRefresh={handleRefreshMeetings}
          onRetry={handleRefreshMeetings}
        />
      </div>
    );
  }

  const summaryPaneMode = paneState.getPaneMode("summary");
  const cameraPaneMode = paneState.getPaneMode("camera");
  const graphicsPaneMode = paneState.getPaneMode("graphics");

  // Show recording page
  return (
    <PaneContext.Provider value={paneState}>
      <MainLayout
        expandedPane={paneState.expandedPane}
        header={
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <MeetingHeader
                title={session.meeting.meetingTitle}
                onBackRequested={handleBackRequested}
                onUpdateTitle={session.updateMeetingTitle}
              />
              <TopicIndicator topics={session.topics} />
            </div>
            <div className="flex items-center gap-6">
              <Button variant="outline" size="sm" type="button" onClick={handleLogout}>
                ログアウト
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleDownloadReport}
                disabled={!meetingIdForReport || isDownloadingReport}
              >
                {isDownloadingReport ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    レポートDL中...
                  </>
                ) : (
                  "レポートDL"
                )}
              </Button>
              <FlowMeter value={session.flow} />
              <HeatMeter value={session.heat} />
            </div>
          </div>
        }
        leftPanel={
          <PopoutPane
            paneId="summary"
            isPopout={paneState.popoutPanes.has("summary")}
            portalContainer={summaryPopout.portalContainer}
            onFocusPopout={() => summaryPopout.popoutWindow?.focus()}
          >
            <div className="group relative h-full flex flex-col overflow-hidden">
              <PaneToolbar
                paneId="summary"
                mode={summaryPaneMode}
                onExpand={() => paneState.expandPane("summary")}
                onCollapse={() => paneState.collapsePane()}
                onPopout={() => handlePopout("summary")}
              />
              <SummaryPanel
                summaryPages={session.summaryPages}
                transcriptSegments={session.transcriptSegments}
                interimText={session.interimText}
                interimSpeaker={session.interimSpeaker}
                interimStartTime={session.interimStartTime}
                isAnalyzing={session.isAnalyzing}
                className="flex-1 min-h-0"
              />
              <TagList
                tags={session.tags}
                className="flex-shrink-0 mt-3 pt-3 border-t border-border"
              />
            </div>
          </PopoutPane>
        }
        rightPanel={
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 mx-4 mt-4 mb-2 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <MediaSourceToggle
                  value={media.sourceType}
                  onChange={
                    recording.isRecording ? media.switchVideoSource : media.switchSourceType
                  }
                  disabled={media.isSwitching}
                  isLoading={media.isSwitching}
                />
                <ImageModelToggle
                  value={session.imageModel.preset}
                  model={session.imageModel.model}
                  onChange={session.setImageModelPreset}
                  proAvailable={Boolean(session.imageModel.available.pro)}
                  disabled={session.isGenerating}
                />
              </div>
              {media.hasPermission && (
                <DeviceSelector
                  audioDevices={media.audioDevices}
                  videoDevices={media.videoDevices}
                  selectedAudioDeviceId={media.selectedAudioDeviceId}
                  selectedVideoDeviceId={media.selectedVideoDeviceId}
                  onAudioDeviceChange={media.setAudioDevice}
                  onVideoDeviceChange={media.setVideoDevice}
                  disabled={media.isSwitching}
                  stream={media.stream}
                  isRecording={recording.isRecording}
                  sourceType={media.sourceType}
                />
              )}
            </div>
            <ResizablePanelGroup
              id="camera-graphics"
              direction="vertical"
              className="flex-1 min-h-0"
            >
              <ResizablePanel id="camera-panel" defaultSize={35} minSize={20} maxSize={70}>
                <PopoutPane
                  paneId="camera"
                  isPopout={paneState.popoutPanes.has("camera")}
                  portalContainer={cameraPopout.portalContainer}
                  onFocusPopout={() => cameraPopout.popoutWindow?.focus()}
                >
                  <div className="group relative h-full flex flex-col px-4 pb-4">
                    <PaneToolbar
                      paneId="camera"
                      mode={cameraPaneMode}
                      onExpand={() => paneState.expandPane("camera")}
                      onCollapse={() => paneState.collapsePane()}
                      onPopout={() => handlePopout("camera")}
                    />
                    <CameraPreview
                      videoRef={media.videoRef}
                      hasPermission={media.hasPermission}
                      isRecording={recording.isRecording}
                      sourceType={media.sourceType}
                      className="flex-1 min-h-0"
                    />
                  </div>
                </PopoutPane>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="graphics-panel" defaultSize={65} minSize={30} maxSize={80}>
                <PopoutPane
                  paneId="graphics"
                  isPopout={paneState.popoutPanes.has("graphics")}
                  portalContainer={graphicsPopout.portalContainer}
                  onFocusPopout={() => graphicsPopout.popoutWindow?.focus()}
                >
                  <div className="group relative h-full flex flex-col px-4 pt-4 pb-4">
                    <PaneToolbar
                      paneId="graphics"
                      mode={graphicsPaneMode}
                      onExpand={() => paneState.expandPane("graphics")}
                      onCollapse={() => paneState.collapsePane()}
                      onPopout={() => handlePopout("graphics")}
                    />
                    <ImageCarousel
                      images={session.images}
                      isGenerating={session.isGenerating}
                      generationPhase={session.generationPhase}
                      className="flex-1 min-h-0"
                    />
                  </div>
                </PopoutPane>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        }
        cameraPanel={
          <PopoutPane
            paneId="camera"
            isPopout={paneState.popoutPanes.has("camera")}
            portalContainer={cameraPopout.portalContainer}
            onFocusPopout={() => cameraPopout.popoutWindow?.focus()}
          >
            <div className="group relative h-full flex flex-col">
              <PaneToolbar
                paneId="camera"
                mode={cameraPaneMode}
                onExpand={() => paneState.expandPane("camera")}
                onCollapse={() => paneState.collapsePane()}
                onPopout={() => handlePopout("camera")}
              />
              <CameraPreview
                videoRef={media.videoRef}
                hasPermission={media.hasPermission}
                isRecording={recording.isRecording}
                sourceType={media.sourceType}
                className="flex-1 min-h-0"
              />
            </div>
          </PopoutPane>
        }
        graphicsPanel={
          <PopoutPane
            paneId="graphics"
            isPopout={paneState.popoutPanes.has("graphics")}
            portalContainer={graphicsPopout.portalContainer}
            onFocusPopout={() => graphicsPopout.popoutWindow?.focus()}
          >
            <div className="group relative h-full flex flex-col">
              <PaneToolbar
                paneId="graphics"
                mode={graphicsPaneMode}
                onExpand={() => paneState.expandPane("graphics")}
                onCollapse={() => paneState.collapsePane()}
                onPopout={() => handlePopout("graphics")}
              />
              <ImageCarousel
                images={session.images}
                isGenerating={session.isGenerating}
                generationPhase={session.generationPhase}
                className="flex-1 min-h-0"
              />
            </div>
          </PopoutPane>
        }
        footer={
          <div className="flex flex-col items-center gap-3">
            <RecordingControls
              sessionStatus={session.sessionStatus}
              isRecording={recording.isRecording}
              hasPermission={media.hasPermission}
              isLoading={media.isLoading}
              error={error}
              sourceType={media.sourceType}
              elapsedTime={elapsedTime}
              hasMeeting={session.meeting.meetingId !== null}
              onRequestPermission={handleRequestPermission}
              onStart={handleStart}
              onStop={handleStop}
            />
            <CloudSaveButton
              sessionId={localRecording.sessionId}
              meetingId={session.meeting.meetingId}
              isRecording={recording.isRecording}
              isUploading={audioUpload.isUploading}
              progress={audioUpload.progress}
              error={audioUpload.error}
              hasLocalRecording={hasLocalFile && localRecording.sessionId !== null}
              onUpload={handleUpload}
              onCancel={handleCancelUpload}
            />
          </div>
        }
      />
    </PaneContext.Provider>
  );
}

export default AppShell;
