/**
 * WebSocket browser API adapter.
 *
 * Design doc: plans/view-logic-separation-plan.md
 * Related: src/adapters/types.ts, src/logic/meeting-controller.ts
 */

import type { WebSocketAdapter, WebSocketInstance, WebSocketReadyState } from "./types";
import { WebSocketReadyState as ReadyState } from "./types";

/**
 * Create a WebSocketAdapter that wraps the browser's WebSocket API.
 */
export function createWebSocketAdapter(): WebSocketAdapter {
  return {
    buildUrl(path: string): string {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}${path}`;
    },

    create(url: string): WebSocketInstance {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      return {
        get readyState(): WebSocketReadyState {
          return ws.readyState as WebSocketReadyState;
        },

        send(data: string | ArrayBuffer): void {
          ws.send(data);
        },

        close(code?: number, reason?: string): void {
          ws.close(code, reason);
        },

        onOpen(handler: () => void): void {
          ws.onopen = handler;
        },

        onClose(handler: (event: CloseEvent) => void): void {
          ws.onclose = handler;
        },

        onMessage(handler: (data: string | ArrayBuffer) => void): void {
          ws.onmessage = (event) => {
            handler(event.data);
          };
        },

        onError(handler: (error: Event) => void): void {
          ws.onerror = handler;
        },
      };
    },
  };
}

/**
 * Create a mock WebSocketAdapter for testing.
 */
export function createMockWebSocketAdapter(
  overrides: Partial<WebSocketAdapter> = {},
): WebSocketAdapter {
  const defaultMock: WebSocketAdapter = {
    buildUrl: (path: string) => `ws://localhost${path}`,
    create: (): WebSocketInstance => createMockWebSocketInstance(),
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Create a mock WebSocketInstance for testing.
 */
export function createMockWebSocketInstance(
  overrides: Partial<WebSocketInstance> = {},
): WebSocketInstance {
  const defaultMock: WebSocketInstance = {
    readyState: ReadyState.OPEN,
    send: () => {},
    close: () => {},
    onOpen: () => {},
    onClose: () => {},
    onMessage: () => {},
    onError: () => {},
  };

  return { ...defaultMock, ...overrides };
}

/**
 * Create a controllable mock WebSocket for testing scenarios.
 * Returns both the instance and control functions to simulate events.
 */
export function createControllableMockWebSocket(): {
  instance: WebSocketInstance;
  controls: {
    simulateOpen: () => void;
    simulateClose: (event?: Partial<CloseEvent>) => void;
    simulateMessage: (data: string | ArrayBuffer) => void;
    simulateError: (error?: Event) => void;
    setReadyState: (state: WebSocketReadyState) => void;
    getSentMessages: () => (string | ArrayBuffer)[];
  };
} {
  let readyState: WebSocketReadyState = ReadyState.CONNECTING;
  let openHandler: (() => void) | null = null;
  let closeHandler: ((event: CloseEvent) => void) | null = null;
  let messageHandler: ((data: string | ArrayBuffer) => void) | null = null;
  let errorHandler: ((error: Event) => void) | null = null;
  const sentMessages: (string | ArrayBuffer)[] = [];

  const instance: WebSocketInstance = {
    get readyState() {
      return readyState;
    },
    send(data: string | ArrayBuffer): void {
      sentMessages.push(data);
    },
    close(): void {
      readyState = ReadyState.CLOSED;
    },
    onOpen(handler: () => void): void {
      openHandler = handler;
    },
    onClose(handler: (event: CloseEvent) => void): void {
      closeHandler = handler;
    },
    onMessage(handler: (data: string | ArrayBuffer) => void): void {
      messageHandler = handler;
    },
    onError(handler: (error: Event) => void): void {
      errorHandler = handler;
    },
  };

  const controls = {
    simulateOpen(): void {
      readyState = ReadyState.OPEN;
      openHandler?.();
    },
    simulateClose(event: Partial<CloseEvent> = {}): void {
      readyState = ReadyState.CLOSED;
      closeHandler?.({
        code: 1000,
        reason: "",
        wasClean: true,
        ...event,
      } as CloseEvent);
    },
    simulateMessage(data: string | ArrayBuffer): void {
      messageHandler?.(data);
    },
    simulateError(error: Event = new Event("error")): void {
      errorHandler?.(error);
    },
    setReadyState(state: WebSocketReadyState): void {
      readyState = state;
    },
    getSentMessages(): (string | ArrayBuffer)[] {
      return [...sentMessages];
    },
  };

  return { instance, controls };
}
