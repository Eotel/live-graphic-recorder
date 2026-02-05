/**
 * Meeting controller - manages WebSocket connection and meeting state.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/websocket.ts, src/hooks/useMeetingController.ts
 */

import type { ServerMessage, TranscriptSegment, CameraFrame } from "../types/messages";
import type { WebSocketAdapter, WebSocketInstance, WebSocketReadyState } from "../adapters/types";
import { WebSocketReadyState as ReadyState } from "../adapters/types";
import { WS_CONFIG } from "../config/constants";
import type {
  MeetingControllerState,
  MeetingControllerActions,
  MeetingControllerCallbacks,
  MeetingControllerEvents,
  MeetingState,
  AnalysisData,
  ImageData,
  CaptureData,
  MetaSummaryData,
} from "./types";

export interface MeetingControllerDeps {
  wsAdapter: WebSocketAdapter;
  reconnect?: {
    enabled?: boolean;
    connectTimeoutMs?: number;
    initialBackoffMs?: number;
    maxBackoffMs?: number;
    jitterRatio?: number;
  };
}

/**
 * Create a meeting controller.
 */
export function createMeetingController(
  deps: MeetingControllerDeps,
  events: MeetingControllerEvents,
  callbacks: MeetingControllerCallbacks = {},
): MeetingControllerActions & { getState: () => MeetingControllerState; dispose: () => void } {
  const { wsAdapter } = deps;

  const reconnectConfig = {
    enabled: deps.reconnect?.enabled ?? true,
    connectTimeoutMs: deps.reconnect?.connectTimeoutMs ?? WS_CONFIG.reconnect.connectTimeoutMs,
    initialBackoffMs: deps.reconnect?.initialBackoffMs ?? WS_CONFIG.reconnect.initialBackoffMs,
    maxBackoffMs: deps.reconnect?.maxBackoffMs ?? WS_CONFIG.reconnect.maxBackoffMs,
    jitterRatio: deps.reconnect?.jitterRatio ?? WS_CONFIG.reconnect.jitterRatio,
  };

  let state: MeetingControllerState = {
    isConnected: false,
    connectionState: "disconnected",
    reconnectAttempt: 0,
    sessionStatus: "idle",
    generationPhase: "idle",
    error: null,
    meeting: {
      meetingId: null,
      meetingTitle: null,
      sessionId: null,
      meetingList: [],
    },
  };

  let wsInstance: WebSocketInstance | null = null;
  let callbacksRef = callbacks;
  let isDisposed = false;
  let isManualDisconnect = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;

  function emit() {
    if (!isDisposed) {
      events.onStateChange({ ...state });
    }
  }

  function updateState(updates: Partial<MeetingControllerState>) {
    state = { ...state, ...updates };
    emit();
  }

  function updateMeetingState(updates: Partial<MeetingState>) {
    state = {
      ...state,
      meeting: { ...state.meeting, ...updates },
    };
    emit();
  }

  function handleMessage(data: string | ArrayBuffer): void {
    if (typeof data !== "string") return;

    try {
      const message = JSON.parse(data) as ServerMessage;

      switch (message.type) {
        case "transcript":
          callbacksRef.onTranscript?.(message.data);
          break;

        case "analysis":
          callbacksRef.onAnalysis?.(message.data);
          break;

        case "image":
          callbacksRef.onImage?.(message.data);
          break;

        case "session:status": {
          const updates: Partial<MeetingControllerState> = {
            sessionStatus: message.data.status,
          };
          if (message.data.error) {
            updates.error = message.data.error;
          }
          updateState(updates);
          if (message.data.error) {
            callbacksRef.onError?.(message.data.error);
          }
          break;
        }

        case "generation:status":
          updateState({ generationPhase: message.data.phase });
          break;

        case "utterance:end":
          callbacksRef.onUtteranceEnd?.(message.data.timestamp);
          break;

        case "error":
          updateState({ error: message.data.message });
          callbacksRef.onError?.(message.data.message);
          break;

        case "meeting:status":
          updateMeetingState({
            meetingId: message.data.meetingId,
            meetingTitle: message.data.title ?? null,
            sessionId: message.data.sessionId,
          });
          callbacksRef.onMeetingStatus?.(message.data);
          break;

        case "meeting:list":
          updateMeetingState({
            meetingList: message.data.meetings,
          });
          callbacksRef.onMeetingList?.(message.data.meetings);
          break;

        case "meeting:history": {
          const historyData = message.data;
          const transcripts: TranscriptSegment[] = historyData.transcripts.map((t) => ({
            text: t.text,
            timestamp: t.timestamp,
            isFinal: t.isFinal,
            speaker: t.speaker,
            startTime: t.startTime,
            isUtteranceEnd: t.isUtteranceEnd,
          }));
          const analyses: AnalysisData[] = historyData.analyses.map((a) => ({
            summary: a.summary,
            topics: a.topics,
            tags: a.tags,
            flow: a.flow,
            heat: a.heat,
            timestamp: a.timestamp,
          }));
          const images: ImageData[] = historyData.images.map((i) => ({
            url: i.url,
            prompt: i.prompt,
            timestamp: i.timestamp,
          }));
          const captures: CaptureData[] = historyData.captures.map((c) => ({
            url: c.url,
            timestamp: c.timestamp,
          }));
          const metaSummaries: MetaSummaryData[] = historyData.metaSummaries.map((m) => ({
            summary: m.summary,
            themes: m.themes,
            startTime: m.startTime,
            endTime: m.endTime,
          }));

          callbacksRef.onMeetingHistory?.({
            transcripts,
            analyses,
            images,
            captures,
            metaSummaries,
          });
          break;
        }
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  }

  function clearTimers(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (connectTimeoutTimer) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
  }

  function computeBackoffMs(attempt: number): number {
    const base = reconnectConfig.initialBackoffMs * Math.pow(2, Math.max(0, attempt - 1));
    const capped = Math.min(reconnectConfig.maxBackoffMs, base);
    const jitter = capped * reconnectConfig.jitterRatio;
    const delta = jitter > 0 ? (Math.random() * 2 - 1) * jitter : 0;
    return Math.max(0, Math.round(capped + delta));
  }

  function scheduleReconnect(): void {
    if (!reconnectConfig.enabled) return;
    if (isDisposed || isManualDisconnect) return;

    reconnectAttempt += 1;
    updateState({
      connectionState: "reconnecting",
      reconnectAttempt,
      isConnected: false,
      sessionStatus: "idle",
      generationPhase: "idle",
    });

    const delayMs = computeBackoffMs(reconnectAttempt);
    clearTimers();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  function connect(): void {
    if (isDisposed) return;
    isManualDisconnect = false;

    // Prevent duplicate connections
    if (wsInstance) {
      const readyState = wsInstance.readyState;
      if (readyState === ReadyState.OPEN || readyState === ReadyState.CONNECTING) {
        return;
      }
    }

    clearTimers();
    updateState({
      connectionState: reconnectAttempt > 0 ? "reconnecting" : "connecting",
      reconnectAttempt,
    });

    const wsUrl = wsAdapter.buildUrl("/ws/recording");
    wsInstance = wsAdapter.create(wsUrl);

    wsInstance.onOpen(() => {
      if (!isDisposed) {
        reconnectAttempt = 0;
        clearTimers();
        updateState({
          isConnected: true,
          connectionState: "connected",
          reconnectAttempt: 0,
          error: null,
        });
      }
    });

    wsInstance.onClose(() => {
      if (!isDisposed) {
        clearTimers();
        wsInstance = null;
        updateState({
          isConnected: false,
          connectionState: "disconnected",
          reconnectAttempt,
          sessionStatus: "idle",
          generationPhase: "idle",
        });
        scheduleReconnect();
      }
    });

    wsInstance.onError(() => {
      if (!isDisposed) {
        updateState({
          error: "WebSocket connection error",
        });
      }
    });

    wsInstance.onMessage(handleMessage);

    if (reconnectConfig.connectTimeoutMs > 0) {
      connectTimeoutTimer = setTimeout(() => {
        connectTimeoutTimer = null;
        if (isDisposed || isManualDisconnect) return;
        if (wsInstance?.readyState === ReadyState.CONNECTING) {
          wsInstance.close();
        }
      }, reconnectConfig.connectTimeoutMs);
    }
  }

  function disconnect(): void {
    isManualDisconnect = true;
    clearTimers();
    if (wsInstance) {
      wsInstance.close();
      wsInstance = null;
    }
    reconnectAttempt = 0;
    updateState({
      isConnected: false,
      connectionState: "disconnected",
      reconnectAttempt: 0,
      sessionStatus: "idle",
      generationPhase: "idle",
    });
  }

  function sendMessage(message: object): void {
    if (wsInstance?.readyState === ReadyState.OPEN) {
      wsInstance.send(JSON.stringify(message));
    }
  }

  function sendAudio(data: ArrayBuffer): void {
    if (wsInstance?.readyState === ReadyState.OPEN) {
      wsInstance.send(data);
    }
  }

  function startMeeting(title?: string, meetingId?: string): void {
    sendMessage({
      type: "meeting:start",
      data: { title, meetingId },
    });
  }

  function stopMeeting(): void {
    sendMessage({ type: "meeting:stop" });
    updateMeetingState({
      meetingId: null,
      meetingTitle: null,
      sessionId: null,
      meetingList: [],
    });
  }

  function requestMeetingList(): void {
    sendMessage({ type: "meeting:list:request" });
  }

  function updateMeetingTitle(title: string): void {
    sendMessage({
      type: "meeting:update",
      data: { title },
    });
  }

  function startSession(): void {
    sendMessage({ type: "session:start" });
  }

  function stopSession(): void {
    sendMessage({ type: "session:stop" });
  }

  function sendCameraFrame(data: CameraFrame): void {
    sendMessage({ type: "camera:frame", data });
  }

  function setCallbacks(newCallbacks: MeetingControllerCallbacks): void {
    callbacksRef = newCallbacks;
  }

  function dispose(): void {
    isDisposed = true;
    clearTimers();
    disconnect();
  }

  return {
    getState: () => ({ ...state }),
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
    dispose,
  };
}
