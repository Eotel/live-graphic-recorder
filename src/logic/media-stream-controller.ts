/**
 * Media stream controller - manages camera/microphone/screen capture.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/media-devices.ts, src/hooks/useMediaStreamController.ts
 */

import type { MediaSourceType } from "../types/messages";
import type { MediaDevicesAdapter, StreamUtils } from "../adapters/types";
import type {
  MediaStreamControllerState,
  MediaStreamControllerActions,
  MediaStreamControllerDeps,
  MediaStreamControllerEvents,
} from "./types";

/**
 * Format media error messages for user display.
 */
export function formatMediaError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name;
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Permission denied. Please allow camera/microphone access.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No camera or microphone found.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Camera/microphone is already in use by another application.";
    }
    if (name === "OverconstrainedError") {
      return "Cannot satisfy the requested media constraints.";
    }
    if (name === "AbortError") {
      return "Screen sharing was cancelled.";
    }
    return err.message;
  }
  return "An unknown error occurred.";
}

/**
 * Create a media stream controller.
 */
export function createMediaStreamController(
  deps: MediaStreamControllerDeps,
  events: MediaStreamControllerEvents,
): MediaStreamControllerActions & { getState: () => MediaStreamControllerState } {
  const { mediaDevices, streamUtils } = deps;

  // Internal state
  let state: MediaStreamControllerState = {
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
    sourceType: "camera",
  };

  // Operation tracking for cancellation
  let currentOpId = 0;
  let videoSwitchOpId = 0;
  let streamInstanceId = 0;
  let streamRef: MediaStream | null = null;
  let audioStreamRef: MediaStream | null = null;
  let videoStreamRef: MediaStream | null = null;
  let isDisposed = false;
  let shouldAutoRequestOnSwitch = false;

  function emit() {
    if (!isDisposed) {
      events.onStateChange({ ...state });
    }
  }

  function updateState(updates: Partial<MediaStreamControllerState>) {
    state = { ...state, ...updates };
    emit();
  }

  async function enumerateDevices(): Promise<{
    audio: MediaDeviceInfo[];
    video: MediaDeviceInfo[];
  }> {
    try {
      const devices = await mediaDevices.enumerateDevices();
      const audio = devices.filter((d) => d.kind === "audioinput");
      const video = devices.filter((d) => d.kind === "videoinput");
      if (!isDisposed) {
        updateState({ audioDevices: audio, videoDevices: video });
      }
      return { audio, video };
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
      return { audio: [], video: [] };
    }
  }

  async function getCameraStream(
    audioDeviceId: string | null,
    videoDeviceId: string | null,
  ): Promise<MediaStream> {
    if (!mediaDevices.hasGetUserMedia()) {
      throw new Error("Camera/microphone APIs are not available in this browser.");
    }
    return mediaDevices.getUserMedia({
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
  }

  async function getScreenStream(audioDeviceId: string | null): Promise<MediaStream> {
    let screenStream: MediaStream | null = null;
    let audioStream: MediaStream | null = null;

    try {
      if (!mediaDevices.hasGetDisplayMedia()) {
        throw new Error("Screen sharing is not supported in this browser.");
      }
      if (!mediaDevices.hasGetUserMedia()) {
        throw new Error("Microphone APIs are not available in this browser.");
      }

      // Get screen video (no audio - we use mic for speech-to-text)
      screenStream = await mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      // Get mic audio for speech-to-text
      audioStream = await mediaDevices.getUserMedia({
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
      // Clean up on error
      streamUtils.stopTracks(screenStream);
      streamUtils.stopTracks(audioStream);
      throw err;
    }
  }

  async function getCameraVideoOnly(videoDeviceId: string | null): Promise<MediaStream> {
    if (!mediaDevices.hasGetUserMedia()) {
      throw new Error("Camera APIs are not available in this browser.");
    }
    return mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: videoDeviceId ? undefined : "user",
      },
    });
  }

  async function getScreenVideoOnly(): Promise<MediaStream> {
    if (!mediaDevices.hasGetDisplayMedia()) {
      throw new Error("Screen sharing is not supported in this browser.");
    }
    return mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  }

  function applyStream(nextStream: MediaStream, nextSourceType: MediaSourceType) {
    streamUtils.stopTracks(streamRef);
    streamUtils.stopTracks(audioStreamRef);
    streamUtils.stopTracks(videoStreamRef);
    streamRef = nextStream;

    const instanceId = (streamInstanceId += 1);

    // Create separate audio and video streams for independent management
    const audioTracks = nextStream.getAudioTracks();
    const videoTracks = nextStream.getVideoTracks();

    audioStreamRef = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;
    videoStreamRef = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;

    // Handle screen share ending
    if (nextSourceType === "screen") {
      const videoTrack = nextStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (streamInstanceId !== instanceId || isDisposed) return;
          updateState({ error: "Screen sharing ended." });
          stopStream();
        };
      }
    }

    if (!isDisposed) {
      updateState({
        stream: nextStream,
        audioStream: audioStreamRef,
        videoStream: videoStreamRef,
        hasPermission: true,
      });
    }
  }

  async function replaceStream(
    create: () => Promise<MediaStream>,
    nextSourceType: MediaSourceType,
  ): Promise<boolean> {
    const opId = (currentOpId += 1);

    if (!isDisposed) {
      updateState({ isLoading: true, error: null });
    }

    try {
      const nextStream = await create();

      // Check if a newer operation started
      if (currentOpId !== opId) {
        streamUtils.stopTracks(nextStream);
        return false;
      }

      applyStream(nextStream, nextSourceType);
      return true;
    } catch (err) {
      const message = formatMediaError(err);
      if (!isDisposed) {
        updateState({
          error: message,
          hasPermission: streamRef ? state.hasPermission : false,
        });
      }
      return false;
    } finally {
      if (!isDisposed && currentOpId === opId) {
        updateState({ isLoading: false });
      }
    }
  }

  function stopStream(): void {
    // Invalidate in-flight operations
    currentOpId += 1;
    videoSwitchOpId += 1;

    streamUtils.stopTracks(streamRef);
    streamUtils.stopTracks(audioStreamRef);
    streamUtils.stopTracks(videoStreamRef);
    streamRef = null;
    audioStreamRef = null;
    videoStreamRef = null;
    streamInstanceId += 1;

    if (!isDisposed) {
      updateState({
        isLoading: false,
        isSwitching: false,
        stream: null,
        audioStream: null,
        videoStream: null,
        hasPermission: false,
      });
    }
  }

  async function requestPermission(): Promise<boolean> {
    const { sourceType, selectedAudioDeviceId, selectedVideoDeviceId } = state;

    const ok = await replaceStream(async () => {
      if (sourceType === "camera") {
        return getCameraStream(selectedAudioDeviceId, selectedVideoDeviceId);
      }
      return getScreenStream(selectedAudioDeviceId);
    }, sourceType);

    if (!ok) return false;

    // Enumerate devices after getting permission
    const { audio, video } = await enumerateDevices();
    if (isDisposed) return true;

    const active = streamRef;

    // Set default device IDs from active tracks
    const firstAudioDevice = audio[0];
    if (!state.selectedAudioDeviceId && firstAudioDevice) {
      const audioTrack = active?.getAudioTracks()[0];
      const audioSettings = audioTrack?.getSettings();
      updateState({
        selectedAudioDeviceId: audioSettings?.deviceId ?? firstAudioDevice.deviceId,
      });
    }

    // Only set video device for camera mode
    if (sourceType === "camera") {
      const firstVideoDevice = video[0];
      if (!state.selectedVideoDeviceId && firstVideoDevice) {
        const videoTrack = active?.getVideoTracks()[0];
        const videoSettings = videoTrack?.getSettings();
        updateState({
          selectedVideoDeviceId: videoSettings?.deviceId ?? firstVideoDevice.deviceId,
        });
      }
    }

    return true;
  }

  async function setAudioDevice(deviceId: string): Promise<void> {
    updateState({ selectedAudioDeviceId: deviceId });

    if (!state.hasPermission) return;

    const { sourceType, selectedVideoDeviceId } = state;
    await replaceStream(async () => {
      if (sourceType === "camera") {
        return getCameraStream(deviceId, selectedVideoDeviceId);
      }
      return getScreenStream(deviceId);
    }, sourceType);
  }

  async function setVideoDevice(deviceId: string): Promise<void> {
    if (state.sourceType !== "camera") return;

    updateState({ selectedVideoDeviceId: deviceId });

    if (!state.hasPermission) return;

    await replaceStream(() => getCameraStream(state.selectedAudioDeviceId, deviceId), "camera");
  }

  function switchSourceType(type: MediaSourceType): void {
    if (type === state.sourceType) return;

    shouldAutoRequestOnSwitch = state.hasPermission;
    stopStream();
    updateState({ sourceType: type, error: null });

    // Auto-request permission if we had it before
    if (shouldAutoRequestOnSwitch) {
      shouldAutoRequestOnSwitch = false;
      void requestPermission();
    }
  }

  /**
   * Switch video source during recording without interrupting audio.
   *
   * Only switches the video portion of the stream, keeping the audio stream
   * intact. This allows seamless camera/screen switching during active recording.
   *
   * @param type - The target source type ("camera" or "screen")
   * @returns Promise resolving to true if switch succeeded, false if failed
   *
   * @remarks
   * - Returns true immediately if already on the target source
   * - Returns false if no permission or audio stream is not available
   * - On failure, the current source is maintained and an error is set
   * - When switching to screen, auto-switches back to camera if screen share ends
   */
  async function switchVideoSource(type: MediaSourceType): Promise<boolean> {
    // No-op if already on the same source
    if (type === state.sourceType) return true;

    // Need permission/stream to switch video
    if (!state.hasPermission || !audioStreamRef) {
      return false;
    }

    const opId = (videoSwitchOpId += 1);
    const instanceId = (streamInstanceId += 1);

    if (!isDisposed) {
      updateState({ isSwitching: true, error: null });
    }

    try {
      // Get new video stream only
      const newVideoStream =
        type === "camera"
          ? await getCameraVideoOnly(state.selectedVideoDeviceId)
          : await getScreenVideoOnly();

      // Check if a newer operation started or was disposed
      if (videoSwitchOpId !== opId || isDisposed) {
        streamUtils.stopTracks(newVideoStream);
        return false;
      }

      // Stop old video stream only (keep audio intact)
      streamUtils.stopTracks(videoStreamRef);
      videoStreamRef = newVideoStream;

      // Rebuild combined stream for backward compatibility
      const combinedStream = new MediaStream([
        ...audioStreamRef.getAudioTracks(),
        ...newVideoStream.getVideoTracks(),
      ]);

      // Stop old combined stream ref (tracks already stopped)
      streamRef = combinedStream;

      // Handle screen share ending for new video
      if (type === "screen") {
        const videoTrack = newVideoStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            if (streamInstanceId !== instanceId || isDisposed) return;
            events.onScreenShareEnded?.();
            // Auto-switch back to camera
            void switchVideoSource("camera");
          };
        }
      }

      if (!isDisposed) {
        updateState({
          stream: combinedStream,
          videoStream: newVideoStream,
          sourceType: type,
          isSwitching: false,
        });
      }

      return true;
    } catch (err) {
      const message = formatMediaError(err);
      if (!isDisposed && videoSwitchOpId === opId) {
        updateState({
          error: message,
          isSwitching: false,
        });
      }
      return false;
    }
  }

  function dispose(): void {
    isDisposed = true;
    currentOpId += 1;
    videoSwitchOpId += 1;
    streamUtils.stopTracks(streamRef);
    streamUtils.stopTracks(audioStreamRef);
    streamUtils.stopTracks(videoStreamRef);
    streamRef = null;
    audioStreamRef = null;
    videoStreamRef = null;
  }

  // Initialize device list
  void enumerateDevices();

  // Set up device change listener
  const unsubscribeDeviceChange = mediaDevices.onDeviceChange(() => {
    void enumerateDevices();
  });

  return {
    getState: () => ({ ...state }),
    requestPermission,
    stopStream,
    setAudioDevice,
    setVideoDevice,
    switchSourceType,
    switchVideoSource,
    dispose: () => {
      unsubscribeDeviceChange();
      dispose();
    },
  };
}
