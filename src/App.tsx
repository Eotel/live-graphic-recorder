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

import { useMediaStreamController } from "@/hooks/useMediaStreamController";
import { useRecordingController } from "@/hooks/useRecordingController";
import { useCameraCapture } from "@/hooks/useCameraCapture";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { useMeetingSession } from "@/hooks/useMeetingSession";
import type { CameraFrame } from "@/types/messages";

type View = "select" | "recording";

export function App() {
  // View state for routing
  const [view, setView] = useState<View>("select");

  // Media stream management (controller-based)
  const media = useMediaStreamController();

  // Meeting session management (WebSocket, transcripts, analyses, images)
  const session = useMeetingSession();

  // Recording orchestration (controller-based)
  const recording = useRecordingController({
    audioStream: media.audioStream,
    hasPermission: media.hasPermission,
    isConnected: session.isConnected,
    hasMeeting: session.meeting.meetingId !== null,
    onChunk: session.sendAudio,
    onSessionStart: session.startSession,
    onSessionStop: session.stopSession,
  });

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

  // Elapsed time tracking
  const { formattedTime: elapsedTime } = useElapsedTime({ enabled: recording.isRecording });

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

  const handleBack = useCallback(() => {
    if (recording.isRecording) {
      recording.stop();
    }
    session.stopMeeting();
    session.resetSession();
    setView("select");
  }, [recording, session]);

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
              isRecording={recording.isRecording}
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
              value={media.sourceType}
              onChange={recording.isRecording ? media.switchVideoSource : media.switchSourceType}
              disabled={media.isSwitching}
              isLoading={media.isSwitching}
            />
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
          <ResizablePanelGroup id="camera-graphics" direction="vertical" className="flex-1 min-h-0">
            <ResizablePanel id="camera-panel" defaultSize={35} minSize={20} maxSize={70}>
              <div className="h-full flex flex-col px-4 pb-4">
                <CameraPreview
                  videoRef={media.videoRef}
                  hasPermission={media.hasPermission}
                  isRecording={recording.isRecording}
                  sourceType={media.sourceType}
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
      }
    />
  );
}

export default App;
