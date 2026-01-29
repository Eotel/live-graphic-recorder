/**
 * Hook for capturing camera frames at regular intervals.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useMediaStream.ts, src/App.tsx
 */

import { useCallback, useRef, useEffect } from "react";
import {
  CAMERA_CAPTURE_INTERVAL_MS,
  CAMERA_FRAME_BUFFER_SIZE,
} from "@/config/constants";
import type { CameraFrame } from "@/types/messages";

export interface CameraCaptureOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isRecording: boolean;
  onFrameCaptured?: (frame: CameraFrame) => void;
}

export interface CameraCaptureState {
  captureFrame: () => CameraFrame | null;
  getFrames: () => CameraFrame[];
  clearFrames: () => void;
}

export function useCameraCapture(options: CameraCaptureOptions): CameraCaptureState {
  const { videoRef, isRecording, onFrameCaptured } = options;
  const framesRef = useRef<CameraFrame[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const captureFrame = useCallback((): CameraFrame | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    // Create canvas if not exists
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert to base64 JPEG
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

    const frame: CameraFrame = {
      base64,
      timestamp: Date.now(),
    };

    // Add to buffer (ring buffer)
    framesRef.current = [...framesRef.current, frame];
    if (framesRef.current.length > CAMERA_FRAME_BUFFER_SIZE) {
      framesRef.current = framesRef.current.slice(
        framesRef.current.length - CAMERA_FRAME_BUFFER_SIZE,
      );
    }

    return frame;
  }, [videoRef]);

  const getFrames = useCallback((): CameraFrame[] => {
    return [...framesRef.current];
  }, []);

  const clearFrames = useCallback((): void => {
    framesRef.current = [];
  }, []);

  // Start/stop interval based on recording state
  useEffect(() => {
    if (isRecording) {
      // Capture immediately on start
      const frame = captureFrame();
      if (frame && onFrameCaptured) {
        onFrameCaptured(frame);
      }

      // Set up interval
      intervalRef.current = setInterval(() => {
        const capturedFrame = captureFrame();
        if (capturedFrame && onFrameCaptured) {
          onFrameCaptured(capturedFrame);
        }
      }, CAMERA_CAPTURE_INTERVAL_MS);
    } else {
      // Stop interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRecording, captureFrame, onFrameCaptured]);

  return {
    captureFrame,
    getFrames,
    clearFrames,
  };
}
