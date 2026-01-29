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
  stream: MediaStream | null;
  onAudioData: (data: ArrayBuffer) => void;
  onSessionStart: () => void;
  onSessionStop: () => void;
}

export function useRecording({
  stream,
  onAudioData,
  onSessionStart,
  onSessionStop,
}: UseRecordingOptions): RecordingState & RecordingActions {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = useCallback(() => {
    if (!stream) {
      setError("No media stream available");
      return;
    }

    try {
      // Get audio track only for MediaRecorder
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        setError("No audio track available");
        return;
      }

      const audioStream = new MediaStream([audioTrack]);
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
  }, [stream, onAudioData, onSessionStart]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    onSessionStop();
    setIsRecording(false);
  }, [onSessionStop]);

  // Cleanup on unmount or stream change
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
    };
  }, [stream]);

  return {
    isRecording,
    error,
    startRecording,
    stopRecording,
  };
}
