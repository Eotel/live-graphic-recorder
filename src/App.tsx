/**
 * Main application component for Live Graphic Recorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/layout/MainLayout.tsx, src/hooks/*
 */

import { useState, useCallback, useEffect } from "react";
import "./index.css";

import { MainLayout } from "@/components/layout/MainLayout";
import { RecordingControls } from "@/components/recording/RecordingControls";
import { CameraPreview } from "@/components/recording/CameraPreview";
import { SummaryPanel } from "@/components/summary/SummaryPanel";
import { TagList } from "@/components/summary/TagList";
import { TopicIndicator } from "@/components/summary/TopicIndicator";
import { FlowMeter } from "@/components/metrics/FlowMeter";
import { HeatMeter } from "@/components/metrics/HeatMeter";
import { ImageCarousel } from "@/components/graphics/ImageCarousel";

import { useMediaStream } from "@/hooks/useMediaStream";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useRecording } from "@/hooks/useRecording";

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
  } = useMediaStream();

  // Accumulated data
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [flow, setFlow] = useState(50);
  const [heat, setHeat] = useState(50);
  const [images, setImages] = useState<ImageData[]>([]);

  // WebSocket callbacks
  const handleTranscript = useCallback((data: TranscriptData) => {
    if (data.isFinal) {
      setTranscript((prev) => (prev ? `${prev} ${data.text}` : data.text));
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

  // Connect WebSocket on mount
  useEffect(() => {
    connect();
  }, [connect]);

  // Combined error state
  const error = mediaError || wsError || recordingError;

  // Handlers
  const handleRequestPermission = async () => {
    const success = await requestPermission();
    if (success && !isConnected) {
      connect();
    }
  };

  const handleStart = () => {
    if (!isConnected) {
      connect();
    }
    startRecording();
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
          <SummaryPanel summaryPoints={summary} transcript={transcript} className="flex-1" />
          <TagList tags={tags} className="mt-4 pt-4 border-t border-border" />
        </div>
      }
      rightPanel={
        <div className="space-y-6">
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
