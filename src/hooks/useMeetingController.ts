/**
 * React hook for MeetingController.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/logic/meeting-controller.ts, src/adapters/websocket.ts
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { TranscriptSegment, CameraFrame, ImageModelPreset } from "../types/messages";
import type {
  MeetingControllerState,
  MeetingControllerCallbacks,
  AnalysisData,
  ImageData,
  CaptureData,
  MetaSummaryData,
  MeetingInfo,
} from "../logic/types";
import { createMeetingController } from "../logic/meeting-controller";
import { createWebSocketAdapter } from "../adapters/websocket";
import { GEMINI_CONFIG } from "../config/constants";

export interface UseMeetingControllerCallbacks {
  onTranscript?: (data: {
    text: string;
    isFinal: boolean;
    timestamp: number;
    speaker?: number;
    startTime?: number;
  }) => void;
  onAnalysis?: (data: AnalysisData) => void;
  onImage?: (data: ImageData) => void;
  onError?: (message: string) => void;
  onUtteranceEnd?: (timestamp: number) => void;
  onMeetingStatus?: (data: { meetingId: string; title?: string; sessionId: string }) => void;
  onMeetingList?: (meetings: MeetingInfo[]) => void;
  onMeetingHistory?: (data: {
    transcripts: TranscriptSegment[];
    analyses: AnalysisData[];
    images: ImageData[];
    captures: CaptureData[];
    metaSummaries: MetaSummaryData[];
  }) => void;
}

export interface UseMeetingControllerReturn extends MeetingControllerState {
  /**
   * Connect to the WebSocket server.
   */
  connect: () => void;

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect: () => void;

  /**
   * Send audio data to the server.
   */
  sendAudio: (data: ArrayBuffer) => void;

  /**
   * Start a new meeting.
   */
  startMeeting: (title?: string, meetingId?: string) => void;

  /**
   * Stop the current meeting.
   */
  stopMeeting: () => void;

  /**
   * Request the list of meetings.
   */
  requestMeetingList: () => void;

  /**
   * Update the meeting title.
   */
  updateMeetingTitle: (title: string) => void;

  /**
   * Start the recording session.
   */
  startSession: () => void;

  /**
   * Stop the recording session.
   */
  stopSession: () => void;

  /**
   * Send a camera frame to the server.
   */
  sendCameraFrame: (data: CameraFrame) => void;

  /**
   * Set the image generation model preset (Flash/Pro).
   */
  setImageModelPreset: (preset: ImageModelPreset) => void;
}

/**
 * Hook that provides meeting control via WebSocket.
 */
export function useMeetingController(
  callbacks: UseMeetingControllerCallbacks = {},
): UseMeetingControllerReturn {
  // Keep callbacks in a ref to avoid recreating controller
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Create controller with stable reference
  const controllerRef = useRef<ReturnType<typeof createMeetingController> | null>(null);
  const mountedRef = useRef(false);
  const pendingConnectRef = useRef(false);
  const stateRef = useRef<MeetingControllerState>({
    isConnected: false,
    connectionState: "disconnected",
    reconnectAttempt: 0,
    sessionStatus: "idle",
    generationPhase: "idle",
    error: null,
    imageModel: {
      preset: "flash",
      model: GEMINI_CONFIG.model,
      available: {
        flash: GEMINI_CONFIG.model,
      },
    },
    meeting: {
      meetingId: null,
      meetingTitle: null,
      sessionId: null,
      meetingList: [],
    },
  });

  // Subscribers for external store
  const subscribersRef = useRef<Set<() => void>>(new Set());

  const createController = useCallback(() => {
    const wsAdapter = createWebSocketAdapter();

    const proxyCallbacks: MeetingControllerCallbacks = {
      onTranscript: (data) => callbacksRef.current.onTranscript?.(data),
      onAnalysis: (data) => callbacksRef.current.onAnalysis?.(data),
      onImage: (data) => callbacksRef.current.onImage?.(data),
      onError: (message) => callbacksRef.current.onError?.(message),
      onUtteranceEnd: (timestamp) => callbacksRef.current.onUtteranceEnd?.(timestamp),
      onMeetingStatus: (data) => callbacksRef.current.onMeetingStatus?.(data),
      onMeetingList: (meetings) => callbacksRef.current.onMeetingList?.(meetings),
      onMeetingHistory: (data) => callbacksRef.current.onMeetingHistory?.(data),
    };

    return createMeetingController(
      { wsAdapter },
      {
        onStateChange: (state) => {
          stateRef.current = state;
          subscribersRef.current.forEach((cb) => cb());
        },
      },
      proxyCallbacks,
    );
  }, []);

  const ensureController = useCallback(() => {
    if (controllerRef.current) return controllerRef.current;
    if (!mountedRef.current) return null;

    controllerRef.current = createController();
    return controllerRef.current;
  }, [createController]);

  // Use sync external store for state updates
  const subscribe = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const getSnapshot = useCallback(() => stateRef.current, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    ensureController();
    if (pendingConnectRef.current) {
      pendingConnectRef.current = false;
      controllerRef.current?.connect();
    }
    return () => {
      mountedRef.current = false;
      pendingConnectRef.current = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      stateRef.current = {
        isConnected: false,
        connectionState: "disconnected",
        reconnectAttempt: 0,
        sessionStatus: "idle",
        generationPhase: "idle",
        error: null,
        imageModel: {
          preset: "flash",
          model: GEMINI_CONFIG.model,
          available: {
            flash: GEMINI_CONFIG.model,
          },
        },
        meeting: {
          meetingId: null,
          meetingTitle: null,
          sessionId: null,
          meetingList: [],
        },
      };
    };
  }, [ensureController]);

  // Create stable action callbacks
  const connect = useCallback(() => {
    const controller = ensureController();
    if (!controller) {
      pendingConnectRef.current = true;
      return;
    }
    controller.connect();
  }, [ensureController]);

  const disconnect = useCallback(() => {
    ensureController()?.disconnect();
  }, [ensureController]);

  const sendAudio = useCallback(
    (data: ArrayBuffer) => {
      ensureController()?.sendAudio(data);
    },
    [ensureController],
  );

  const startMeeting = useCallback(
    (title?: string, meetingId?: string) => {
      ensureController()?.startMeeting(title, meetingId);
    },
    [ensureController],
  );

  const stopMeeting = useCallback(() => {
    ensureController()?.stopMeeting();
  }, [ensureController]);

  const requestMeetingList = useCallback(() => {
    ensureController()?.requestMeetingList();
  }, [ensureController]);

  const updateMeetingTitle = useCallback(
    (title: string) => {
      ensureController()?.updateMeetingTitle(title);
    },
    [ensureController],
  );

  const startSession = useCallback(() => {
    ensureController()?.startSession();
  }, [ensureController]);

  const stopSession = useCallback(() => {
    ensureController()?.stopSession();
  }, [ensureController]);

  const sendCameraFrame = useCallback(
    (data: CameraFrame) => {
      ensureController()?.sendCameraFrame(data);
    },
    [ensureController],
  );

  const setImageModelPreset = useCallback(
    (preset: ImageModelPreset) => {
      ensureController()?.setImageModelPreset(preset);
    },
    [ensureController],
  );

  return {
    ...state,
    connect,
    disconnect,
    sendAudio,
    startMeeting,
    stopMeeting,
    requestMeetingList,
    updateMeetingTitle,
    startSession,
    stopSession,
    sendCameraFrame,
    setImageModelPreset,
  };
}
