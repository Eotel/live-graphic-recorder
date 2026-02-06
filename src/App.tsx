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
import { MeetingSelectPage } from "@/components/pages/MeetingSelectPage";
import { MeetingHeader } from "@/components/navigation/MeetingHeader";

import { useMediaStreamController } from "@/hooks/useMediaStreamController";
import { useRecordingController } from "@/hooks/useRecordingController";
import { useLocalRecording } from "@/hooks/useLocalRecording";
import { useAudioUpload } from "@/hooks/useAudioUpload";
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

  // Local audio recording to OPFS
  const localRecording = useLocalRecording();
  const [hasLocalFile, setHasLocalFile] = useState(false);

  // Audio upload to server
  const audioUpload = useAudioUpload();

  // `onChunk` は `useRecordingController` に渡され、録音中に安定した参照である必要がある。
  // 一方で `localRecording` は hook の再生成などで参照が変わり得るため、依存配列に入れてしまうと
  // callback が差し替わって副作用を誘発しやすい。最新の `localRecording` を参照できるよう ref 経由にする
  // ことで、React の依存追跡を迂回しつつ stale closure を防ぐ。
  const localRecordingRef = useRef(localRecording);
  localRecordingRef.current = localRecording;

  // Recording orchestration (controller-based)
  const onChunk = useCallback(
    (data: ArrayBuffer) => {
      session.sendAudio(data);
      localRecordingRef.current.writeChunk(data);
    },
    [session],
  );

  const onSessionStart = useCallback(() => {
    session.startSession();
    setHasLocalFile(false);
    localRecordingRef.current.reset();
    const sessionId = session.meeting.sessionId;
    if (sessionId) {
      localRecordingRef.current.start(sessionId);
    }
  }, [session]);

  const onSessionStop = useCallback(() => {
    session.stopSession();
    localRecordingRef.current.stop();
    setHasLocalFile(
      localRecordingRef.current.sessionId !== null && localRecordingRef.current.totalChunks > 0,
    );
  }, [session]);

  const recording = useRecordingController({
    audioStream: media.audioStream,
    hasPermission: media.hasPermission,
    isConnected: session.isConnected,
    hasMeeting: session.meeting.meetingId !== null,
    onChunk,
    onSessionStart,
    onSessionStop,
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
      setHasLocalFile(false);
      localRecordingRef.current.reset();
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
      setHasLocalFile(false);
      localRecordingRef.current.reset();
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

  const handleUpload = useCallback(
    (sid: string, mid: string) => {
      audioUpload.upload(sid, mid);
    },
    [audioUpload],
  );

  const handleCancelUpload = useCallback(() => {
    audioUpload.cancel();
  }, [audioUpload]);

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
  );
}

export default App;
