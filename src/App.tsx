/**
 * Main application component for Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/layout/MainLayout.tsx, src/hooks/*
 */

import { useState, useCallback, useEffect, useRef } from "react";
import "./index.css";

import { MainLayout } from "@/components/layout/MainLayout";
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
import type { TranscriptSegment } from "@/types/messages";

interface TranscriptData {
  text: string;
  isFinal: boolean;
  timestamp: number;
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
  const [summary, setSummary] = useState<string[]>([]);
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
        { text: data.text, timestamp: data.timestamp, isFinal: true },
      ]);
      setInterimText(null);
    } else {
      setInterimText(data.text);
    }
  }, []);

  const handleAnalysis = useCallback((data: AnalysisData) => {
    setSummary(data.summary);
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
    error: wsError,
    connect,
    sendMessage,
    sendAudio,
  } = useWebSocket({
    onTranscript: handleTranscript,
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
        <div className="h-full flex flex-col">
          <SummaryPanel
              summaryPoints={summary}
              transcriptSegments={transcriptSegments}
              interimText={interimText}
              className="flex-1"
            />
          <TagList tags={tags} className="mt-4 pt-4 border-t border-border" />
        </div>
      }
      rightPanel={
        <div className="space-y-6">
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
            />
          )}
          <CameraPreview
            videoRef={videoRef}
            hasPermission={hasPermission}
            isRecording={isRecording}
          />
          <ImageCarousel images={images} />
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
