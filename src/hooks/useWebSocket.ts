/**
 * Hook for WebSocket connection management.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/hooks/useRecording.ts
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { ServerMessage, ClientMessage, SessionStatus, GenerationPhase } from "@/types/messages";

export interface WebSocketState {
  isConnected: boolean;
  sessionStatus: SessionStatus;
  generationPhase: GenerationPhase;
  error: string | null;
}

export interface WebSocketActions {
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: ClientMessage) => void;
  sendAudio: (data: ArrayBuffer) => void;
}

export interface WebSocketCallbacks {
  onTranscript?: (data: { text: string; isFinal: boolean; timestamp: number; speaker?: number; startTime?: number }) => void;
  onUtteranceEnd?: (timestamp: number) => void;
  onAnalysis?: (data: {
    summary: string[];
    topics: string[];
    tags: string[];
    flow: number;
    heat: number;
  }) => void;
  onImage?: (data: { base64: string; prompt: string; timestamp: number }) => void;
  onError?: (error: string) => void;
}

export function useWebSocket(
  callbacks: WebSocketCallbacks = {},
): WebSocketState & WebSocketActions {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref updated
  callbacksRef.current = callbacks;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/recording`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setSessionStatus("idle");
      setGenerationPhase("idle");
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;

        switch (message.type) {
          case "transcript":
            callbacksRef.current.onTranscript?.(message.data);
            break;

          case "analysis":
            callbacksRef.current.onAnalysis?.(message.data);
            break;

          case "image":
            callbacksRef.current.onImage?.(message.data);
            break;

          case "session:status":
            setSessionStatus(message.data.status);
            if (message.data.error) {
              setError(message.data.error);
              callbacksRef.current.onError?.(message.data.error);
            }
            break;

          case "generation:status":
            setGenerationPhase(message.data.phase);
            break;

          case "utterance:end":
            callbacksRef.current.onUtteranceEnd?.(message.data.timestamp);
            break;

          case "error":
            setError(message.data.message);
            callbacksRef.current.onError?.(message.data.message);
            break;
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendAudio = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    sessionStatus,
    generationPhase,
    error,
    connect,
    disconnect,
    sendMessage,
    sendAudio,
  };
}
