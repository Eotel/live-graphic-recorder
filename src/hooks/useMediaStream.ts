/**
 * Hook for accessing camera and microphone streams.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useRecording.ts, src/components/recording/DeviceSelector.tsx
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface MediaStreamState {
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
  isLoading: boolean;
  hasPermission: boolean;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string | null;
  selectedVideoDeviceId: string | null;
}

export interface MediaStreamActions {
  requestPermission: () => Promise<boolean>;
  stopStream: () => void;
  setAudioDevice: (deviceId: string) => void;
  setVideoDevice: (deviceId: string) => void;
}

export function useMediaStream(): MediaStreamState & MediaStreamActions {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audio = devices.filter((d) => d.kind === "audioinput");
      const video = devices.filter((d) => d.kind === "videoinput");
      setAudioDevices(audio);
      setVideoDevices(video);
      return { audio, video };
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
      return { audio: [], video: [] };
    }
  }, []);

  const getMediaStream = useCallback(
    async (audioDeviceId: string | null, videoDeviceId: string | null): Promise<MediaStream> => {
      return navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
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
      const mediaStream = await getMediaStream(selectedAudioDeviceId, selectedVideoDeviceId);

      setStream(mediaStream);
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // After getting permission, enumerate devices to get labels
      const { audio, video } = await enumerateDevices();

      // Set default device IDs from the active tracks if not already set
      const firstAudioDevice = audio[0];
      if (!selectedAudioDeviceId && firstAudioDevice) {
        const audioTrack = mediaStream.getAudioTracks()[0];
        const audioSettings = audioTrack?.getSettings();
        if (audioSettings?.deviceId) {
          setSelectedAudioDeviceId(audioSettings.deviceId);
        } else {
          setSelectedAudioDeviceId(firstAudioDevice.deviceId);
        }
      }

      const firstVideoDevice = video[0];
      if (!selectedVideoDeviceId && firstVideoDevice) {
        const videoTrack = mediaStream.getVideoTracks()[0];
        const videoSettings = videoTrack?.getSettings();
        if (videoSettings?.deviceId) {
          setSelectedVideoDeviceId(videoSettings.deviceId);
        } else {
          setSelectedVideoDeviceId(firstVideoDevice.deviceId);
        }
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
  }, [selectedAudioDeviceId, selectedVideoDeviceId, getMediaStream, enumerateDevices]);

  const setAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioDeviceId(deviceId);

      if (!hasPermission || !stream) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Stop existing stream
        stream.getTracks().forEach((track) => track.stop());

        // Get new stream with selected audio device
        const mediaStream = await getMediaStream(deviceId, selectedVideoDeviceId);

        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to switch audio device";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [hasPermission, stream, selectedVideoDeviceId, getMediaStream],
  );

  const setVideoDevice = useCallback(
    async (deviceId: string) => {
      setSelectedVideoDeviceId(deviceId);

      if (!hasPermission || !stream) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Stop existing stream
        stream.getTracks().forEach((track) => track.stop());

        // Get new stream with selected video device
        const mediaStream = await getMediaStream(selectedAudioDeviceId, deviceId);

        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to switch video device";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [hasPermission, stream, selectedAudioDeviceId, getMediaStream],
  );

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
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    requestPermission,
    stopStream,
    setAudioDevice,
    setVideoDevice,
  };
}
