/**
 * Hook for orchestrating recording flow with MediaRecorder.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useMediaStream.ts, src/hooks/useWebSocket.ts
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { AUDIO_CONFIG } from "@/config/constants";

export interface RecordingState {
  isRecording: boolean;
  error: string | null;
}

export interface RecordingActions {
  startRecording: () => void;
  stopRecording: () => void;
}

interface UseRecordingOptions {
  /**
   * Audio-only stream for recording. Use audioStream from useMediaStream
   * to ensure recording continues uninterrupted during video source switches.
   */
  audioStream: MediaStream | null;
  onAudioData: (data: ArrayBuffer) => void;
  onSessionStart: () => void;
  onSessionStop: () => void;
}

export function useRecording({
  audioStream,
  onAudioData,
  onSessionStart,
  onSessionStop,
}: UseRecordingOptions): RecordingState & RecordingActions {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = useCallback(() => {
    if (!audioStream) {
      setError("No audio stream available");
      return;
    }

    try {
      // Use the audio stream directly for MediaRecorder
      const audioTrack = audioStream.getAudioTracks()[0];
      if (!audioTrack) {
        setError("No audio track available");
        return;
      }

      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: AUDIO_CONFIG.mimeType,
      });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const buffer = await event.data.arrayBuffer();
          onAudioData(buffer);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setError("Recording error occurred");
      };

      // Start recording with timeslice for continuous data
      mediaRecorder.start(250); // Send data every 250ms
      mediaRecorderRef.current = mediaRecorder;

      onSessionStart();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
    }
  }, [audioStream, onAudioData, onSessionStart]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    onSessionStop();
    setIsRecording(false);
  }, [onSessionStop]);

  // Cleanup on unmount or audioStream change
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
    };
  }, [audioStream]);

  return {
    isRecording,
    error,
    startRecording,
    stopRecording,
  };
}
