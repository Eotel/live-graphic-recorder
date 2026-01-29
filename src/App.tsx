/**
 * Main application component for Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/layout/MainLayout.tsx, src/hooks/*
 */

import { useState, useCallback, useEffect, useRef } from "react";
import "./index.css";

import { MainLayout } from "@/components/layout/MainLayout";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { RecordingControls } from "@/components/recording/RecordingControls";
import { CameraPreview } from "@/components/recording/CameraPreview";
import { DeviceSelector } from "@/components/recording/DeviceSelector";
import { MediaSourceToggle } from "@/components/recording/MediaSourceToggle";
import { SummaryPanel } from "@/components/summary/SummaryPanel";
import { TagList } from "@/components/summary/TagList";
import { TopicIndicator } from "@/components/summary/TopicIndicator";
import { FlowMeter } from "@/components/metrics/FlowMeter";
import { HeatMeter } from "@/components/metrics/HeatMeter";
import { ImageCarousel } from "@/components/graphics/ImageCarousel";
import { MeetingSelectPage } from "@/components/pages/MeetingSelectPage";
import { MeetingHeader } from "@/components/navigation/MeetingHeader";

import { useMediaStream } from "@/hooks/useMediaStream";
import { useRecording } from "@/hooks/useRecording";
import { useCameraCapture } from "@/hooks/useCameraCapture";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { useMeetingSession } from "@/hooks/useMeetingSession";
import type { CameraFrame } from "@/types/messages";

type View = "select" | "recording";

export function App() {
  // View state for routing
  const [view, setView] = useState<View>("select");

  // Media stream management
  const {
    stream,
    audioStream,
    videoRef,
    error: mediaError,
    isLoading: mediaLoading,
    isSwitching,
    hasPermission,
    requestPermission,
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    setAudioDevice,
    setVideoDevice,
    sourceType,
    switchSourceType,
    switchVideoSource,
  } = useMediaStream();

  // Meeting session management (WebSocket, transcripts, analyses, images)
  const session = useMeetingSession();

  // Auto-connect WebSocket on mount
  useEffect(() => {
    if (!session.isConnected) {
      session.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track pending meeting action (waiting for WebSocket connection)
  const pendingMeetingActionRef = useRef<{
    type: "new" | "select";
    title?: string;
    meetingId?: string;
  } | null>(null);

  // Handle connection established
  useEffect(() => {
    if (!session.isConnected) return;

    const pending = pendingMeetingActionRef.current;
    if (pending) {
      pendingMeetingActionRef.current = null;
      if (pending.type === "new") {
        session.startMeeting(pending.title);
      } else {
        session.startMeeting(undefined, pending.meetingId);
      }
      setView("recording");
      return;
    }

    session.requestMeetingList();
  }, [session.isConnected, session]);

  // Meeting handlers for MeetingSelectPage
  const handleNewMeeting = useCallback(
    (title?: string) => {
      if (!session.isConnected) {
        pendingMeetingActionRef.current = { type: "new", title };
        session.connect();
        return;
      }
      session.startMeeting(title);
      setView("recording");
    },
    [session],
  );

  const handleSelectMeeting = useCallback(
    (meetingId: string) => {
      if (!session.isConnected) {
        pendingMeetingActionRef.current = { type: "select", meetingId };
        session.connect();
        return;
      }
      session.startMeeting(undefined, meetingId);
      setView("recording");
    },
    [session],
  );

  const handleRefreshMeetings = useCallback(() => {
    if (session.isConnected) {
      session.requestMeetingList();
    }
  }, [session]);

  // Recording orchestration (use audioStream for uninterrupted recording during video switch)
  const {
    isRecording,
    error: recordingError,
    startRecording,
    stopRecording,
  } = useRecording({
    audioStream,
    onAudioData: session.sendAudio,
    onSessionStart: () => session.sendMessage({ type: "session:start" }),
    onSessionStop: () => session.sendMessage({ type: "session:stop" }),
  });

  // Elapsed time tracking
  const { formattedTime: elapsedTime } = useElapsedTime({ enabled: isRecording });

  // Camera frame capture
  const onFrameCaptured = useCallback(
    (frame: CameraFrame) => {
      session.sendMessage({ type: "camera:frame", data: frame });
    },
    [session],
  );

  useCameraCapture({
    videoRef,
    isRecording,
    onFrameCaptured,
  });

  // Track pending start request
  const pendingStartRef = useRef(false);

  // Start recording when WebSocket connects
  useEffect(() => {
    if (session.isConnected && pendingStartRef.current) {
      pendingStartRef.current = false;
      if (hasPermission && audioStream) {
        startRecording();
      }
    }
  }, [session.isConnected, hasPermission, audioStream, startRecording]);

  // Handle permission/stream loss (check audioStream since recording depends on it)
  useEffect(() => {
    if (hasPermission && audioStream) return;
    pendingStartRef.current = false;
    if (isRecording) {
      stopRecording();
    }
  }, [hasPermission, audioStream, isRecording, stopRecording]);

  // Combined error state
  const error = mediaError || session.error || recordingError;

  // Handlers
  const handleRequestPermission = async () => {
    await requestPermission();
  };

  const handleStart = () => {
    if (!hasPermission || !audioStream || !session.meeting.meetingId) {
      return;
    }

    if (session.isConnected) {
      startRecording();
    } else {
      pendingStartRef.current = true;
      session.connect();
    }
  };

  const handleStop = () => {
    pendingStartRef.current = false;
    stopRecording();
  };

  const handleBack = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    session.stopMeeting();
    session.resetSession();
    setView("select");
  }, [isRecording, stopRecording, session]);

  // Show meeting selection page
  if (view === "select") {
    return (
      <MeetingSelectPage
        meetings={session.meeting.meetingList}
        isLoading={!session.isConnected}
        onNewMeeting={handleNewMeeting}
        onSelectMeeting={handleSelectMeeting}
        onRefresh={handleRefreshMeetings}
      />
    );
  }

  // Show recording page
  return (
    <MainLayout
      header={
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <MeetingHeader
              title={session.meeting.meetingTitle}
              onBack={handleBack}
              isRecording={isRecording}
              onUpdateTitle={session.updateMeetingTitle}
            />
            <TopicIndicator topics={session.topics} />
          </div>
          <div className="flex items-center gap-6">
            <FlowMeter value={session.flow} />
            <HeatMeter value={session.heat} />
          </div>
        </div>
      }
      leftPanel={
        <div className="h-full flex flex-col overflow-hidden">
          <SummaryPanel
            summaryPages={session.summaryPages}
            transcriptSegments={session.transcriptSegments}
            interimText={session.interimText}
            interimSpeaker={session.interimSpeaker}
            interimStartTime={session.interimStartTime}
            isAnalyzing={session.isAnalyzing}
            className="flex-1 min-h-0"
          />
          <TagList tags={session.tags} className="flex-shrink-0 mt-3 pt-3 border-t border-border" />
        </div>
      }
      rightPanel={
        <div className="h-full flex flex-col">
          <div className="flex-shrink-0 mx-4 mt-4 mb-2 flex flex-col gap-3">
            <MediaSourceToggle
              value={sourceType}
              onChange={isRecording ? switchVideoSource : switchSourceType}
              disabled={isSwitching}
              isLoading={isSwitching}
            />
            {hasPermission && (
              <DeviceSelector
                audioDevices={audioDevices}
                videoDevices={videoDevices}
                selectedAudioDeviceId={selectedAudioDeviceId}
                selectedVideoDeviceId={selectedVideoDeviceId}
                onAudioDeviceChange={setAudioDevice}
                onVideoDeviceChange={setVideoDevice}
                disabled={isSwitching}
                stream={stream}
                isRecording={isRecording}
                sourceType={sourceType}
              />
            )}
          </div>
          <ResizablePanelGroup id="camera-graphics" direction="vertical" className="flex-1 min-h-0">
            <ResizablePanel id="camera-panel" defaultSize={35} minSize={20} maxSize={70}>
              <div className="h-full flex flex-col px-4 pb-4">
                <CameraPreview
                  videoRef={videoRef}
                  hasPermission={hasPermission}
                  isRecording={isRecording}
                  sourceType={sourceType}
                  className="flex-1 min-h-0"
                />
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="graphics-panel" defaultSize={65} minSize={30} maxSize={80}>
              <div className="h-full flex flex-col px-4 pt-4 pb-4">
                <ImageCarousel
                  images={session.images}
                  isGenerating={session.isGenerating}
                  generationPhase={session.generationPhase}
                  className="flex-1 min-h-0"
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      }
      footer={
        <RecordingControls
          sessionStatus={session.sessionStatus}
          isRecording={isRecording}
          hasPermission={hasPermission}
          isLoading={mediaLoading}
          error={error}
          sourceType={sourceType}
          elapsedTime={elapsedTime}
          hasMeeting={session.meeting.meetingId !== null}
          onRequestPermission={handleRequestPermission}
          onStart={handleStart}
          onStop={handleStop}
        />
      }
    />
  );
}

export default App;
