/**
 * Meeting controller - manages WebSocket connection and meeting state.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/websocket.ts, src/hooks/useMeetingController.ts
 */

import type {
  ServerMessage,
  TranscriptSegment,
  CameraFrame,
  ImageModelPreset,
  MeetingMode,
  MeetingHistoryCursor,
  SttConnectionState,
} from "../types/messages";
import type { WebSocketAdapter, WebSocketInstance } from "../adapters/types";
import { WebSocketReadyState as ReadyState } from "../adapters/types";
import { WS_CONFIG, GEMINI_CONFIG } from "../config/constants";
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
    sttStatus: null,
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
      mode: null,
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
  let shouldRestoreMeetingOnReconnect = false;
  let shouldRestoreSessionOnReconnect = false;
  let reconnectMeetingSnapshot: { meetingId: string; mode: MeetingMode } | null = null;

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

  function normalizeSpeakerAliases(
    aliases: Record<string, string> | Record<number, string>,
  ): Record<number, string> {
    const normalized: Record<number, string> = {};
    for (const [rawSpeaker, rawName] of Object.entries(aliases)) {
      const speaker = Number(rawSpeaker);
      if (!Number.isInteger(speaker) || speaker < 0) continue;
      const name = String(rawName ?? "").trim();
      if (!name) continue;
      normalized[speaker] = name;
    }
    return normalized;
  }

  function mapHistoryData(historyData: {
    transcripts: Array<{
      text: string;
      timestamp: number;
      isFinal: boolean;
      speaker?: number;
      startTime?: number;
      isUtteranceEnd?: boolean;
    }>;
    analyses: Array<{
      summary: string[];
      topics: string[];
      tags: string[];
      flow: number;
      heat: number;
      timestamp: number;
    }>;
    images: Array<{ url: string; prompt: string; timestamp: number }>;
    captures: Array<{ url: string; timestamp: number }>;
    metaSummaries: Array<{
      summary: string[];
      themes: string[];
      startTime: number;
      endTime: number;
    }>;
    speakerAliases?: Record<string, string> | Record<number, string>;
  }): {
    transcripts: TranscriptSegment[];
    analyses: AnalysisData[];
    images: ImageData[];
    captures: CaptureData[];
    metaSummaries: MetaSummaryData[];
    speakerAliases: Record<number, string>;
  } {
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
    const speakerAliases = normalizeSpeakerAliases(historyData.speakerAliases ?? {});
    return { transcripts, analyses, images, captures, metaSummaries, speakerAliases };
  }

  function clearReconnectRestoreState(): void {
    shouldRestoreMeetingOnReconnect = false;
    shouldRestoreSessionOnReconnect = false;
    reconnectMeetingSnapshot = null;
  }

  function scheduleMeetingRestoreAfterReconnect(): void {
    if (!state.meeting.meetingId || !state.meeting.mode) {
      clearReconnectRestoreState();
      return;
    }
    shouldRestoreMeetingOnReconnect = true;
    shouldRestoreSessionOnReconnect = state.sessionStatus === "recording";
    reconnectMeetingSnapshot = {
      meetingId: state.meeting.meetingId,
      mode: state.meeting.mode,
    };
  }

  function restoreMeetingContextAfterReconnect(): void {
    if (!shouldRestoreMeetingOnReconnect || !reconnectMeetingSnapshot) {
      return;
    }

    sendMessage({
      type: "meeting:start",
      data: {
        meetingId: reconnectMeetingSnapshot.meetingId,
        mode: reconnectMeetingSnapshot.mode,
      },
    });

    if (shouldRestoreSessionOnReconnect) {
      sendMessage({ type: "session:start" });
    }

    clearReconnectRestoreState();
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
          if (message.data.status !== "recording") {
            updates.sttStatus = null;
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

        case "stt:status":
          updateState({
            sttStatus: {
              state: message.data.state as SttConnectionState,
              retryAttempt: message.data.retryAttempt,
              message: message.data.message,
            },
          });
          break;

        case "image:model:status":
          updateState({
            imageModel: {
              preset: message.data.preset,
              model: message.data.model,
              available: message.data.available,
            },
          });
          break;

        case "meeting:status":
          updateMeetingState({
            meetingId: message.data.meetingId,
            meetingTitle: message.data.title ?? null,
            sessionId: message.data.sessionId,
            mode: message.data.mode,
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
          callbacksRef.onMeetingHistory?.(mapHistoryData(message.data));
          break;
        }

        case "meeting:history:delta": {
          callbacksRef.onMeetingHistoryDelta?.(mapHistoryData(message.data));
          break;
        }

        case "meeting:speaker-alias":
          callbacksRef.onSpeakerAliases?.(
            normalizeSpeakerAliases(message.data.speakerAliases ?? {}),
          );
          break;
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
        restoreMeetingContextAfterReconnect();
      }
    });

    wsInstance.onClose(() => {
      if (!isDisposed) {
        if (!isManualDisconnect) {
          scheduleMeetingRestoreAfterReconnect();
        } else {
          clearReconnectRestoreState();
        }
        clearTimers();
        wsInstance = null;
        updateState({
          isConnected: false,
          connectionState: "disconnected",
          reconnectAttempt,
          sessionStatus: "idle",
          generationPhase: "idle",
          sttStatus: null,
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
    clearReconnectRestoreState();
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
      sttStatus: null,
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

  function startMeeting(title?: string, meetingId?: string, mode?: MeetingMode): void {
    sendMessage({
      type: "meeting:start",
      data: { title, meetingId, mode },
    });
  }

  function stopMeeting(): void {
    sendMessage({ type: "meeting:stop" });
    clearReconnectRestoreState();
    updateMeetingState({
      meetingId: null,
      meetingTitle: null,
      sessionId: null,
      mode: null,
      meetingList: [],
    });
    updateState({ sttStatus: null });
  }

  function requestMeetingList(): void {
    sendMessage({ type: "meeting:list:request" });
  }

  function requestMeetingHistoryDelta(meetingId: string, cursor?: MeetingHistoryCursor): void {
    sendMessage({
      type: "meeting:history:request",
      data: { meetingId, cursor },
    });
  }

  function setMeetingMode(mode: MeetingMode): void {
    sendMessage({
      type: "meeting:mode:set",
      data: { mode },
    });
  }

  function updateMeetingTitle(title: string): void {
    sendMessage({
      type: "meeting:update",
      data: { title },
    });
  }

  function updateSpeakerAlias(speaker: number, displayName: string): void {
    sendMessage({
      type: "meeting:speaker-alias:update",
      data: { speaker, displayName },
    });
  }

  function startSession(): void {
    sendMessage({ type: "session:start" });
  }

  function stopSession(): void {
    sendMessage({ type: "session:stop" });
    updateState({ sttStatus: null });
  }

  function sendCameraFrame(data: CameraFrame): void {
    sendMessage({ type: "camera:frame", data });
  }

  function setImageModelPreset(preset: ImageModelPreset): void {
    sendMessage({ type: "image:model:set", data: { preset } });
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
    requestMeetingHistoryDelta,
    setMeetingMode,
    updateMeetingTitle,
    updateSpeakerAlias,
    startSession,
    stopSession,
    sendCameraFrame,
    setImageModelPreset,
    dispose,
  };
}
