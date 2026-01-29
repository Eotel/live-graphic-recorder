/**
 * Hook for accessing camera and microphone streams.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useRecording.ts
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface MediaStreamState {
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
  isLoading: boolean;
  hasPermission: boolean;
}

export interface MediaStreamActions {
  requestPermission: () => Promise<boolean>;
  stopStream: () => void;
}

export function useMediaStream(): MediaStreamState & MediaStreamActions {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });

      setStream(mediaStream);
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to access media devices";
      setError(message);
      setHasPermission(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Attach stream to video element when both are available
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  return {
    stream,
    videoRef,
    error,
    isLoading,
    hasPermission,
    requestPermission,
    stopStream,
  };
}
