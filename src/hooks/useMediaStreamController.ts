/**
 * React hook for MediaStreamController.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/logic/media-stream-controller.ts, src/adapters/media-devices.ts
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { MediaSourceType } from "../types/messages";
import type { MediaStreamControllerState } from "../logic/types";
import { createMediaStreamController } from "../logic/media-stream-controller";
import { createMediaDevicesAdapter } from "../adapters/media-devices";
import { createStreamUtils } from "../adapters/stream-utils";
import { useAttachMediaStream } from "./useAttachMediaStream";

export interface UseMediaStreamControllerOptions {
  /**
   * Initial source type (default: "camera")
   */
  initialSourceType?: MediaSourceType;
}

export interface UseMediaStreamControllerReturn extends MediaStreamControllerState {
  /**
   * Video element ref to attach the stream to.
   */
  videoRef: React.RefObject<HTMLVideoElement | null>;

  /**
   * Request permission to access camera/microphone or screen.
   */
  requestPermission: () => Promise<boolean>;

  /**
   * Stop the current stream.
   */
  stopStream: () => void;

  /**
   * Set the audio input device.
   */
  setAudioDevice: (deviceId: string) => Promise<void>;

  /**
   * Set the video input device.
   */
  setVideoDevice: (deviceId: string) => Promise<void>;

  /**
   * Switch between camera and screen source types.
   * Stops the current stream and requests new permissions.
   */
  switchSourceType: (type: MediaSourceType) => void;

  /**
   * Switch video source during recording without interrupting audio.
   * Only switches the video portion, keeping audio stream intact.
   *
   * @param type - The target source type ("camera" or "screen")
   * @returns Promise resolving to true if switch succeeded, false if failed
   */
  switchVideoSource: (type: MediaSourceType) => Promise<boolean>;
}

/**
 * Hook that provides media stream control using the logic layer controller.
 */
export function useMediaStreamController(
  options: UseMediaStreamControllerOptions = {},
): UseMediaStreamControllerReturn {
  const { initialSourceType = "camera" } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Create controller with stable reference
  const controllerRef = useRef<ReturnType<typeof createMediaStreamController> | null>(null);
  const stateRef = useRef<MediaStreamControllerState>({
    stream: null,
    audioStream: null,
    videoStream: null,
    error: null,
    isLoading: false,
    isSwitching: false,
    hasPermission: false,
    audioDevices: [],
    videoDevices: [],
    selectedAudioDeviceId: null,
    selectedVideoDeviceId: null,
    sourceType: initialSourceType,
  });

  // Subscribers for external store
  const subscribersRef = useRef<Set<() => void>>(new Set());

  // Initialize controller once
  if (!controllerRef.current) {
    const mediaDevices = createMediaDevicesAdapter();
    const streamUtils = createStreamUtils();

    controllerRef.current = createMediaStreamController(
      { mediaDevices, streamUtils },
      {
        onStateChange: (state) => {
          stateRef.current = state;
          subscribersRef.current.forEach((cb) => cb());
        },
      },
    );
  }

  // Use sync external store for state updates
  const subscribe = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useAttachMediaStream(videoRef, state.stream);

  // Cleanup on unmount (or StrictMode effect remount)
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Create stable action callbacks
  const requestPermission = useCallback(async () => {
    return controllerRef.current?.requestPermission() ?? Promise.resolve(false);
  }, []);

  const stopStream = useCallback(() => {
    controllerRef.current?.stopStream();
  }, []);

  const setAudioDevice = useCallback(async (deviceId: string) => {
    await controllerRef.current?.setAudioDevice(deviceId);
  }, []);

  const setVideoDevice = useCallback(async (deviceId: string) => {
    await controllerRef.current?.setVideoDevice(deviceId);
  }, []);

  const switchSourceType = useCallback((type: MediaSourceType) => {
    controllerRef.current?.switchSourceType(type);
  }, []);

  const switchVideoSource = useCallback(async (type: MediaSourceType) => {
    return controllerRef.current?.switchVideoSource(type) ?? Promise.resolve(false);
  }, []);

  return {
    ...state,
    videoRef,
    requestPermission,
    stopStream,
    setAudioDevice,
    setVideoDevice,
    switchSourceType,
    switchVideoSource,
  };
}
