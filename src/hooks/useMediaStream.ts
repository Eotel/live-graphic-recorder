/**
 * Hook for accessing camera/screen and microphone streams.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useRecording.ts, src/components/recording/DeviceSelector.tsx
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { MediaSourceType } from "@/types/messages";

export interface MediaStreamState {
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  videoStream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
  isLoading: boolean;
  isSwitching: boolean;
  hasPermission: boolean;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string | null;
  selectedVideoDeviceId: string | null;
  sourceType: MediaSourceType;
}

export interface MediaStreamActions {
  requestPermission: () => Promise<boolean>;
  stopStream: () => void;
  setAudioDevice: (deviceId: string) => void;
  setVideoDevice: (deviceId: string) => void;
  switchSourceType: (type: MediaSourceType) => void;
  switchVideoSource: (type: MediaSourceType) => Promise<boolean>;
}

function stopTracks(target: MediaStream | null) {
  if (!target) return;
  target.getTracks().forEach((track) => {
    try {
      (track as unknown as { onended?: (() => void) | null }).onended = null;
    } catch {
      // Ignore
    }
    try {
      track.stop();
    } catch {
      // Ignore
    }
  });
}

function formatMediaError(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "name" in err &&
    typeof (err as { name: unknown }).name === "string"
  ) {
    const name = (err as { name: string }).name;
    switch (name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Permission denied. Please allow access to your camera/microphone or screen.";
      case "NotFoundError":
        return "No compatible device found (camera/microphone).";
      case "NotReadableError":
      case "TrackStartError":
        return "Device is already in use or cannot be accessed right now.";
      case "OverconstrainedError":
        return "Selected device/constraints are not supported.";
      case "AbortError":
        return "Request was aborted.";
    }
  }
  return err instanceof Error ? err.message : "Failed to access media devices";
}

export function useMediaStream(): MediaStreamState & MediaStreamActions {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<MediaSourceType>("camera");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const streamInstanceIdRef = useRef(0);
  const opIdRef = useRef(0);
  const videoSwitchOpIdRef = useRef(0);
  const isMountedRef = useRef(true);
  // Track if we should auto-request permission after source type change
  const shouldAutoRequestRef = useRef(false);

  const attachVideo = useCallback((next: MediaStream | null) => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = next;
    if (next) {
      // Avoid unhandled promise rejection on browsers that require user gesture.
      void videoRef.current.play().catch(() => {});
    }
  }, []);

  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      console.warn("MediaDevices API not available");
      return { audio: [], video: [] };
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audio = devices.filter((d) => d.kind === "audioinput");
      const video = devices.filter((d) => d.kind === "videoinput");
      if (isMountedRef.current) {
        setAudioDevices(audio);
        setVideoDevices(video);
      }
      return { audio, video };
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
      return { audio: [], video: [] };
    }
  }, []);

  const getCameraStream = useCallback(
    async (audioDeviceId: string | null, videoDeviceId: string | null): Promise<MediaStream> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera/microphone APIs are not available in this browser.");
      }
      return navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: videoDeviceId ? undefined : "user",
        },
      });
    },
    [],
  );

  const getScreenStream = useCallback(
    async (audioDeviceId: string | null): Promise<MediaStream> => {
      let screenStream: MediaStream | null = null;
      let audioStream: MediaStream | null = null;

      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error("Screen sharing is not supported in this browser.");
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone APIs are not available in this browser.");
        }
        // Get screen video (no audio - we use mic for speech-to-text)
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        // Get mic audio for speech-to-text
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        // Combine: screen video + mic audio
        return new MediaStream([...screenStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
      } catch (err) {
        // If mic permission fails after screen capture succeeds, avoid leaking an active capture session.
        stopTracks(screenStream);
        stopTracks(audioStream);
        throw err;
      }
    },
    [],
  );

  const getCameraVideoOnly = useCallback(
    async (videoDeviceId: string | null): Promise<MediaStream> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera APIs are not available in this browser.");
      }
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: videoDeviceId ? undefined : "user",
        },
      });
    },
    [],
  );

  const getScreenVideoOnly = useCallback(async (): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen sharing is not supported in this browser.");
    }
    return navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  }, []);

  const stopStream = useCallback(() => {
    // Invalidate in-flight acquire/switch operations.
    opIdRef.current += 1;
    videoSwitchOpIdRef.current += 1;

    stopTracks(streamRef.current);
    stopTracks(audioStreamRef.current);
    stopTracks(videoStreamRef.current);
    streamRef.current = null;
    audioStreamRef.current = null;
    videoStreamRef.current = null;
    streamInstanceIdRef.current += 1;

    if (!isMountedRef.current) return;
    setIsLoading(false);
    setIsSwitching(false);
    setStream(null);
    setAudioStream(null);
    setVideoStream(null);
    setHasPermission(false);
    attachVideo(null);
  }, [attachVideo]);

  const applyStream = useCallback(
    (nextStream: MediaStream, nextSourceType: MediaSourceType) => {
      stopTracks(streamRef.current);
      stopTracks(audioStreamRef.current);
      stopTracks(videoStreamRef.current);
      streamRef.current = nextStream;

      const instanceId = (streamInstanceIdRef.current += 1);

      // Create separate audio and video streams for independent management
      const audioTracks = nextStream.getAudioTracks();
      const videoTracks = nextStream.getVideoTracks();

      const newAudioStream = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
      const newVideoStream = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;

      audioStreamRef.current = newAudioStream;
      videoStreamRef.current = newVideoStream;

      if (nextSourceType === "screen") {
        const videoTrack = nextStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            // Only stop if this is still the active stream instance.
            if (streamInstanceIdRef.current !== instanceId) return;
            if (isMountedRef.current) {
              setError("Screen sharing ended.");
            }
            stopStream();
          };
        }
      }

      if (!isMountedRef.current) return;
      setStream(nextStream);
      setAudioStream(newAudioStream);
      setVideoStream(newVideoStream);
      setHasPermission(true);
      attachVideo(nextStream);
    },
    [attachVideo, stopStream],
  );

  const replaceStream = useCallback(
    async (create: () => Promise<MediaStream>, nextSourceType: MediaSourceType) => {
      const opId = (opIdRef.current += 1);
      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const nextStream = await create();

        // If a newer operation started, discard this stream to avoid state races.
        if (opIdRef.current !== opId) {
          stopTracks(nextStream);
          return false;
        }

        applyStream(nextStream, nextSourceType);
        return true;
      } catch (err) {
        const message = formatMediaError(err);
        if (isMountedRef.current) {
          setError(message);
          if (!streamRef.current) {
            setHasPermission(false);
          }
        }
        return false;
      } finally {
        if (isMountedRef.current && opIdRef.current === opId) {
          setIsLoading(false);
        }
      }
    },
    [applyStream],
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const ok = await replaceStream(async () => {
      if (sourceType === "camera") {
        return getCameraStream(selectedAudioDeviceId, selectedVideoDeviceId);
      }
      return getScreenStream(selectedAudioDeviceId);
    }, sourceType);

    if (!ok) return false;

    // After getting permission, enumerate devices to get labels.
    const { audio, video } = await enumerateDevices();
    if (!isMountedRef.current) return true;

    const active = streamRef.current;

    // Set default device IDs from the active tracks if not already set.
    const firstAudioDevice = audio[0];
    if (!selectedAudioDeviceId && firstAudioDevice) {
      const audioTrack = active?.getAudioTracks()[0];
      const audioSettings = audioTrack?.getSettings();
      setSelectedAudioDeviceId(audioSettings?.deviceId ?? firstAudioDevice.deviceId);
    }

    // Only set video device for camera mode.
    if (sourceType === "camera") {
      const firstVideoDevice = video[0];
      if (!selectedVideoDeviceId && firstVideoDevice) {
        const videoTrack = active?.getVideoTracks()[0];
        const videoSettings = videoTrack?.getSettings();
        setSelectedVideoDeviceId(videoSettings?.deviceId ?? firstVideoDevice.deviceId);
      }
    }

    return true;
  }, [
    sourceType,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    enumerateDevices,
    getCameraStream,
    getScreenStream,
    replaceStream,
  ]);

  const setAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioDeviceId(deviceId);

      if (!hasPermission) return;

      await replaceStream(async () => {
        if (sourceType === "camera") {
          return getCameraStream(deviceId, selectedVideoDeviceId);
        }
        return getScreenStream(deviceId);
      }, sourceType);
    },
    [
      hasPermission,
      sourceType,
      selectedVideoDeviceId,
      getCameraStream,
      getScreenStream,
      replaceStream,
    ],
  );

  const setVideoDevice = useCallback(
    async (deviceId: string) => {
      // Video device switching only applies to camera mode
      if (sourceType !== "camera") {
        return;
      }

      setSelectedVideoDeviceId(deviceId);

      if (!hasPermission) return;

      await replaceStream(() => getCameraStream(selectedAudioDeviceId, deviceId), "camera");
    },
    [hasPermission, sourceType, selectedAudioDeviceId, getCameraStream, replaceStream],
  );

  const switchSourceType = useCallback(
    (type: MediaSourceType) => {
      if (type === sourceType) return;

      // Record whether we had permission before switching
      shouldAutoRequestRef.current = hasPermission;
      stopStream();
      setSourceType(type);
      if (isMountedRef.current) {
        setError(null);
      }
    },
    [sourceType, stopStream, hasPermission],
  );

  /**
   * Switch video source during recording without interrupting audio.
   *
   * @param type - Target source type ("camera" or "screen")
   * @returns Promise resolving to true on success, false on failure
   */
  const switchVideoSource = useCallback(
    async (type: MediaSourceType): Promise<boolean> => {
      // No-op if already on the same source
      if (type === sourceType) return true;

      // Need permission/stream to switch video
      if (!hasPermission || !audioStreamRef.current) {
        return false;
      }

      const opId = (videoSwitchOpIdRef.current += 1);
      const instanceId = (streamInstanceIdRef.current += 1);

      if (isMountedRef.current) {
        setIsSwitching(true);
        setError(null);
      }

      try {
        // Get new video stream only
        const newVideoStream =
          type === "camera"
            ? await getCameraVideoOnly(selectedVideoDeviceId)
            : await getScreenVideoOnly();

        // Check if a newer operation started
        if (videoSwitchOpIdRef.current !== opId || !isMountedRef.current) {
          stopTracks(newVideoStream);
          return false;
        }

        // Stop old video stream only (keep audio intact)
        stopTracks(videoStreamRef.current);
        videoStreamRef.current = newVideoStream;

        // Rebuild combined stream for backward compatibility
        const combinedStream = new MediaStream([
          ...audioStreamRef.current.getAudioTracks(),
          ...newVideoStream.getVideoTracks(),
        ]);

        streamRef.current = combinedStream;

        // Handle screen share ending for new video
        if (type === "screen") {
          const videoTrack = newVideoStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.onended = () => {
              if (streamInstanceIdRef.current !== instanceId || !isMountedRef.current) return;
              // Auto-switch back to camera
              void switchVideoSource("camera");
            };
          }
        }

        if (isMountedRef.current) {
          setStream(combinedStream);
          setVideoStream(newVideoStream);
          setSourceType(type);
          setIsSwitching(false);
          attachVideo(combinedStream);
        }

        return true;
      } catch (err) {
        const message = formatMediaError(err);
        if (isMountedRef.current && videoSwitchOpIdRef.current === opId) {
          setError(message);
          setIsSwitching(false);
        }
        return false;
      }
    },
    [
      sourceType,
      hasPermission,
      selectedVideoDeviceId,
      getCameraVideoOnly,
      getScreenVideoOnly,
      attachVideo,
    ],
  );

  // Track mount state for async operations
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      opIdRef.current += 1;
      videoSwitchOpIdRef.current += 1;
      stopTracks(streamRef.current);
      stopTracks(audioStreamRef.current);
      stopTracks(videoStreamRef.current);
      streamRef.current = null;
      audioStreamRef.current = null;
      videoStreamRef.current = null;
    };
  }, []);

  // Auto-request permission after source type change
  useEffect(() => {
    if (shouldAutoRequestRef.current) {
      shouldAutoRequestRef.current = false;
      void requestPermission();
    }
  }, [sourceType, requestPermission]);

  // Ensure the MediaStream is attached once the <video> element actually mounts.
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    if (stream) {
      void videoRef.current.play().catch(() => {});
    }
  }, [stream, hasPermission]);

  // Keep device lists fresh when hardware changes
  useEffect(() => {
    void enumerateDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handler = () => {
      void enumerateDevices();
    };
    mediaDevices.addEventListener("devicechange", handler);
    return () => {
      mediaDevices.removeEventListener("devicechange", handler);
    };
  }, [enumerateDevices]);

  return {
    stream,
    audioStream,
    videoStream,
    videoRef,
    error,
    isLoading,
    isSwitching,
    hasPermission,
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    sourceType,
    requestPermission,
    stopStream,
    setAudioDevice,
    setVideoDevice,
    switchSourceType,
    switchVideoSource,
  };
}
