/**
 * Main application component for Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/layout/MainLayout.tsx, src/hooks/*
 */

import { useState, useCallback, useEffect, useRef } from "react";
import "./index.css";

import { MainLayout } from "@/components/layout/MainLayout";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
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
import { useWebSocket } from "@/hooks/useWebSocket";
import { useRecording } from "@/hooks/useRecording";
import { useCameraCapture } from "@/hooks/useCameraCapture";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import type { TranscriptSegment, CameraFrame, SummaryPage } from "@/types/messages";

interface TranscriptData {
  text: string;
  isFinal: boolean;
  timestamp: number;
  speaker?: number;
  startTime?: number;
}

interface AnalysisData {
  summary: string[];
  topics: string[];
  tags: string[];
  flow: number;
  heat: number;
}

interface ImageData {
  base64: string;
  prompt: string;
  timestamp: number;
}

type View = "select" | "recording";

export function App() {
  // View state for routing
  const [view, setView] = useState<View>("select");

  // Media stream state
  const {
    stream,
    videoRef,
    error: mediaError,
    isLoading: mediaLoading,
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
  } = useMediaStream();

  // Accumulated data
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string | null>(null);
  const [interimSpeaker, setInterimSpeaker] = useState<number | undefined>(undefined);
  const [interimStartTime, setInterimStartTime] = useState<number | undefined>(undefined);
  const [summaryPages, setSummaryPages] = useState<SummaryPage[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [flow, setFlow] = useState(50);
  const [heat, setHeat] = useState(50);
  const [images, setImages] = useState<ImageData[]>([]);

  // WebSocket callbacks
  const handleTranscript = useCallback((data: TranscriptData) => {
    if (data.isFinal) {
      setTranscriptSegments((prev) => [
        ...prev,
        {
          text: data.text,
          timestamp: data.timestamp,
          isFinal: true,
          speaker: data.speaker,
          startTime: data.startTime,
        },
      ]);
      setInterimText(null);
      setInterimSpeaker(undefined);
      setInterimStartTime(undefined);
    } else {
      setInterimText(data.text);
      setInterimSpeaker(data.speaker);
      setInterimStartTime(data.startTime);
    }
  }, []);

  const handleUtteranceEnd = useCallback(() => {
    // Mark the last segment as utterance end
    setTranscriptSegments((prev) => {
      if (prev.length === 0) return prev;
      const lastSegment = prev[prev.length - 1];
      if (!lastSegment) return prev;
      return [
        ...prev.slice(0, -1),
        {
          text: lastSegment.text,
          timestamp: lastSegment.timestamp,
          isFinal: lastSegment.isFinal,
          speaker: lastSegment.speaker,
          startTime: lastSegment.startTime,
          isUtteranceEnd: true,
        },
      ];
    });
  }, []);

  const handleAnalysis = useCallback((data: AnalysisData) => {
    setSummaryPages((prev) => [...prev, { points: data.summary, timestamp: Date.now() }]);
    setTopics(data.topics);
    setTags(data.tags);
    setFlow(data.flow);
    setHeat(data.heat);
  }, []);

  const handleImage = useCallback((data: ImageData) => {
    setImages((prev) => [...prev, data]);
  }, []);

  // WebSocket connection
  const {
    isConnected,
    sessionStatus,
    generationPhase,
    error: wsError,
    meeting,
    connect,
    sendMessage,
    sendAudio,
    startMeeting,
    stopMeeting,
    requestMeetingList,
  } = useWebSocket({
    onTranscript: handleTranscript,
    onUtteranceEnd: handleUtteranceEnd,
    onAnalysis: handleAnalysis,
    onImage: handleImage,
  });

  // Request meeting list when connected
  useEffect(() => {
    if (isConnected) {
      requestMeetingList();
    }
  }, [isConnected, requestMeetingList]);

  // Meeting handlers for MeetingSelectPage
  const handleNewMeeting = useCallback(
    (title?: string) => {
      if (!isConnected) {
        connect();
        // Meeting will be started after connection (handled via effect)
      }
      startMeeting(title);
      setView("recording");
    },
    [isConnected, connect, startMeeting],
  );

  const handleSelectMeeting = useCallback(
    (meetingId: string) => {
      if (!isConnected) {
        connect();
      }
      startMeeting(undefined, meetingId);
      setView("recording");
    },
    [isConnected, connect, startMeeting],
  );

  const handleRefreshMeetings = useCallback(() => {
    if (isConnected) {
      requestMeetingList();
    }
  }, [isConnected, requestMeetingList]);

  // Recording orchestration
  const {
    isRecording,
    error: recordingError,
    startRecording,
    stopRecording,
  } = useRecording({
    stream,
    onAudioData: sendAudio,
    onSessionStart: () => sendMessage({ type: "session:start" }),
    onSessionStop: () => sendMessage({ type: "session:stop" }),
  });

  // Elapsed time tracking for recording
  const { formattedTime: elapsedTime } = useElapsedTime({ enabled: isRecording });

  // Camera frame capture (sends to server for multimodal analysis)
  const handleCameraFrameCaptured = useCallback(
    (frame: CameraFrame) => {
      sendMessage({ type: "camera:frame", data: frame });
    },
    [sendMessage],
  );

  useCameraCapture({
    videoRef,
    isRecording,
    onFrameCaptured: handleCameraFrameCaptured,
  });

  // Track pending start request (waiting for WebSocket connection)
  const pendingStartRef = useRef(false);

  // Start recording when WebSocket connects and start was pending
  useEffect(() => {
    if (isConnected && pendingStartRef.current) {
      pendingStartRef.current = false;
      // Guard against races: permission/stream might have been lost while connecting.
      if (hasPermission && stream) {
        startRecording();
      }
    }
  }, [isConnected, hasPermission, stream, startRecording]);

  // If permission/stream is lost mid-session (e.g. user stops screen share), cancel pending start and stop recording.
  useEffect(() => {
    if (hasPermission && stream) return;
    pendingStartRef.current = false;
    if (isRecording) {
      stopRecording();
    }
  }, [hasPermission, stream, isRecording, stopRecording]);

  // Combined error state
  const error = mediaError || wsError || recordingError;

  // Derive generation states for components
  const isAnalyzing = generationPhase === "analyzing";
  const isGenerating = generationPhase === "generating" || generationPhase === "retrying";

  // Handlers
  const handleRequestPermission = async () => {
    await requestPermission();
  };

  const handleStart = () => {
    if (!hasPermission || !stream) {
      return;
    }

    // Meeting must be active to start recording
    if (!meeting.meetingId) {
      return;
    }

    if (isConnected) {
      startRecording();
    } else {
      pendingStartRef.current = true;
      connect();
    }
  };

  const handleStop = () => {
    pendingStartRef.current = false;
    stopRecording();
  };

  // Back navigation handler
  const handleBack = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    setView("select");
  }, [isRecording, stopRecording]);

  // Show meeting selection page
  if (view === "select") {
    return (
      <MeetingSelectPage
        meetings={meeting.meetingList}
        isLoading={!isConnected}
        onNewMeeting={handleNewMeeting}
        onSelectMeeting={handleSelectMeeting}
        onRefresh={handleRefreshMeetings}
      />
    );
  }

  // Show recording page (3-panel layout)
  return (
    <MainLayout
      header={
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <MeetingHeader
              title={meeting.meetingTitle}
              onBack={handleBack}
              isRecording={isRecording}
            />
            <TopicIndicator topics={topics} />
          </div>
          <div className="flex items-center gap-6">
            <FlowMeter value={flow} />
            <HeatMeter value={heat} />
          </div>
        </div>
      }
      leftPanel={
        <div className="h-full flex flex-col overflow-hidden">
          <SummaryPanel
            summaryPages={summaryPages}
            transcriptSegments={transcriptSegments}
            interimText={interimText}
            interimSpeaker={interimSpeaker}
            interimStartTime={interimStartTime}
            isAnalyzing={isAnalyzing}
            className="flex-1 min-h-0"
          />
          <TagList tags={tags} className="flex-shrink-0 mt-3 pt-3 border-t border-border" />
        </div>
      }
      rightPanel={
        <div className="h-full flex flex-col">
          <div className="flex-shrink-0 mx-4 mt-4 mb-2 flex flex-col gap-3">
            <MediaSourceToggle
              value={sourceType}
              onChange={switchSourceType}
              disabled={isRecording}
            />
            {hasPermission && (
              <DeviceSelector
                audioDevices={audioDevices}
                videoDevices={videoDevices}
                selectedAudioDeviceId={selectedAudioDeviceId}
                selectedVideoDeviceId={selectedVideoDeviceId}
                onAudioDeviceChange={setAudioDevice}
                onVideoDeviceChange={setVideoDevice}
                disabled={isRecording}
                stream={stream}
                isRecording={isRecording}
                sourceType={sourceType}
              />
            )}
          </div>
          <ResizablePanelGroup
            id="camera-graphics"
            direction="vertical"
            className="flex-1 min-h-0"
          >
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
                  images={images}
                  isGenerating={isGenerating}
                  generationPhase={generationPhase}
                  className="flex-1 min-h-0"
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      }
      footer={
        <RecordingControls
          sessionStatus={sessionStatus}
          isRecording={isRecording}
          hasPermission={hasPermission}
          isLoading={mediaLoading}
          error={error}
          sourceType={sourceType}
          elapsedTime={elapsedTime}
          hasMeeting={meeting.meetingId !== null}
          onRequestPermission={handleRequestPermission}
          onStart={handleStart}
          onStop={handleStop}
        />
      }
    />
  );
}

export default App;
