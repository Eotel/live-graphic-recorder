/**
 * React hook for MeetingController.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/logic/meeting-controller.ts, src/adapters/websocket.ts
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { TranscriptSegment, CameraFrame } from "../types/messages";
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
  const stateRef = useRef<MeetingControllerState>({
    isConnected: false,
    sessionStatus: "idle",
    generationPhase: "idle",
    error: null,
    meeting: {
      meetingId: null,
      meetingTitle: null,
      sessionId: null,
      meetingList: [],
    },
  });

  // Subscribers for external store
  const subscribersRef = useRef<Set<() => void>>(new Set());

  // Initialize controller once
  if (!controllerRef.current) {
    const wsAdapter = createWebSocketAdapter();

    // Create proxy callbacks that delegate to ref
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

    controllerRef.current = createMeetingController(
      { wsAdapter },
      {
        onStateChange: (state) => {
          stateRef.current = state;
          subscribersRef.current.forEach((cb) => cb());
        },
      },
      proxyCallbacks,
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
    };
  }, []);

  // Create stable action callbacks
  const connect = useCallback(() => {
    controllerRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    controllerRef.current?.disconnect();
  }, []);

  const sendAudio = useCallback((data: ArrayBuffer) => {
    controllerRef.current?.sendAudio(data);
  }, []);

  const startMeeting = useCallback((title?: string, meetingId?: string) => {
    controllerRef.current?.startMeeting(title, meetingId);
  }, []);

  const stopMeeting = useCallback(() => {
    controllerRef.current?.stopMeeting();
  }, []);

  const requestMeetingList = useCallback(() => {
    controllerRef.current?.requestMeetingList();
  }, []);

  const updateMeetingTitle = useCallback((title: string) => {
    controllerRef.current?.updateMeetingTitle(title);
  }, []);

  const startSession = useCallback(() => {
    controllerRef.current?.startSession();
  }, []);

  const stopSession = useCallback(() => {
    controllerRef.current?.stopSession();
  }, []);

  const sendCameraFrame = useCallback((data: CameraFrame) => {
    controllerRef.current?.sendCameraFrame(data);
  }, []);

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
  };
}
