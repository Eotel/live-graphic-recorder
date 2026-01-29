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
import { SummaryPanel } from "@/components/summary/SummaryPanel";
import { TagList } from "@/components/summary/TagList";
import { TopicIndicator } from "@/components/summary/TopicIndicator";
import { FlowMeter } from "@/components/metrics/FlowMeter";
import { HeatMeter } from "@/components/metrics/HeatMeter";
import { ImageCarousel } from "@/components/graphics/ImageCarousel";

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

export function App() {
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
    connect,
    sendMessage,
    sendAudio,
  } = useWebSocket({
    onTranscript: handleTranscript,
    onUtteranceEnd: handleUtteranceEnd,
    onAnalysis: handleAnalysis,
    onImage: handleImage,
  });

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
      startRecording();
    }
  }, [isConnected, startRecording]);

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
    if (isConnected) {
      startRecording();
    } else {
      pendingStartRef.current = true;
      connect();
    }
  };

  const handleStop = () => {
    stopRecording();
  };

  return (
    <MainLayout
      header={
        <div className="flex items-center justify-between flex-wrap gap-4">
          <TopicIndicator topics={topics} />
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
              className="flex-shrink-0 mb-2"
            />
          )}
          <ResizablePanelGroup id="camera-graphics" orientation="vertical" className="flex-1 min-h-0">
            <ResizablePanel id="camera-panel" defaultSize={35} minSize={20} maxSize={70}>
              <CameraPreview
                videoRef={videoRef}
                hasPermission={hasPermission}
                isRecording={isRecording}
                elapsedTime={elapsedTime}
                className="h-full"
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="graphics-panel" defaultSize={65} minSize={30} maxSize={80}>
              <ImageCarousel
                images={images}
                isGenerating={isGenerating}
                generationPhase={generationPhase}
                className="h-full"
              />
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
          onRequestPermission={handleRequestPermission}
          onStart={handleStart}
          onStop={handleStop}
        />
      }
    />
  );
}

export default App;
