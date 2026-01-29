/**
 * Tests for WebSocket adapter.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  createWebSocketAdapter,
  createMockWebSocketAdapter,
  createMockWebSocketInstance,
  createControllableMockWebSocket,
} from "./websocket";
import { WebSocketReadyState } from "./types";

describe("createWebSocketAdapter", () => {
  let originalWindow: Window & typeof globalThis;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalWebSocket = globalThis.WebSocket;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    });
    globalThis.WebSocket = originalWebSocket;
  });

  describe("buildUrl", () => {
    test("builds wss URL for https", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          location: {
            protocol: "https:",
            host: "example.com",
          },
        },
        configurable: true,
      });

      const adapter = createWebSocketAdapter();
      expect(adapter.buildUrl("/ws/test")).toBe("wss://example.com/ws/test");
    });

    test("builds ws URL for http", () => {
      Object.defineProperty(globalThis, "window", {
        value: {
          location: {
            protocol: "http:",
            host: "localhost:3000",
          },
        },
        configurable: true,
      });

      const adapter = createWebSocketAdapter();
      expect(adapter.buildUrl("/ws/test")).toBe("ws://localhost:3000/ws/test");
    });
  });

  describe("create", () => {
    test("creates WebSocket instance with arraybuffer binaryType", () => {
      let capturedUrl: string | undefined;
      let binaryType: BinaryType | undefined;

      class MockWebSocket {
        binaryType: BinaryType = "blob";
        onopen: (() => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        readyState = 0;

        constructor(url: string) {
          capturedUrl = url;
        }

        send() {}
        close() {}
      }

      globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

      const adapter = createWebSocketAdapter();
      const instance = adapter.create("ws://test.com/ws");

      expect(capturedUrl).toBe("ws://test.com/ws");
    });
  });
});

describe("createMockWebSocketAdapter", () => {
  test("creates adapter with default implementations", () => {
    const adapter = createMockWebSocketAdapter();

    expect(adapter.buildUrl("/ws/test")).toBe("ws://localhost/ws/test");
    expect(adapter.create("ws://test.com")).toBeDefined();
  });

  test("allows overriding buildUrl", () => {
    const adapter = createMockWebSocketAdapter({
      buildUrl: () => "wss://custom.com/ws",
    });

    expect(adapter.buildUrl("/anything")).toBe("wss://custom.com/ws");
  });
});

describe("createMockWebSocketInstance", () => {
  test("creates instance with default implementations", () => {
    const instance = createMockWebSocketInstance();

    expect(instance.readyState).toBe(WebSocketReadyState.OPEN);
    // Should not throw
    instance.send("test");
    instance.close();
    instance.onOpen(() => {});
    instance.onClose(() => {});
    instance.onMessage(() => {});
    instance.onError(() => {});
  });

  test("allows overriding readyState", () => {
    const instance = createMockWebSocketInstance({
      readyState: WebSocketReadyState.CLOSED,
    });

    expect(instance.readyState).toBe(WebSocketReadyState.CLOSED);
  });
});

describe("createControllableMockWebSocket", () => {
  test("starts in CONNECTING state", () => {
    const { instance } = createControllableMockWebSocket();
    expect(instance.readyState).toBe(WebSocketReadyState.CONNECTING);
  });

  test("simulateOpen triggers onOpen handler and sets OPEN state", () => {
    const { instance, controls } = createControllableMockWebSocket();
    const openHandler = mock(() => {});

    instance.onOpen(openHandler);
    controls.simulateOpen();

    expect(openHandler).toHaveBeenCalled();
    expect(instance.readyState).toBe(WebSocketReadyState.OPEN);
  });

  test("simulateClose triggers onClose handler and sets CLOSED state", () => {
    const { instance, controls } = createControllableMockWebSocket();
    const closeHandler = mock(() => {});

    instance.onClose(closeHandler);
    controls.simulateClose({ code: 1000 });

    expect(closeHandler).toHaveBeenCalled();
    expect(instance.readyState).toBe(WebSocketReadyState.CLOSED);
  });

  test("simulateMessage triggers onMessage handler", () => {
    const { instance, controls } = createControllableMockWebSocket();
    const messageHandler = mock(() => {});

    instance.onMessage(messageHandler);
    controls.simulateMessage('{"type": "test"}');

    expect(messageHandler).toHaveBeenCalledWith('{"type": "test"}');
  });

  test("simulateError triggers onError handler", () => {
    const { instance, controls } = createControllableMockWebSocket();
    const errorHandler = mock(() => {});

    instance.onError(errorHandler);
    controls.simulateError();

    expect(errorHandler).toHaveBeenCalled();
  });

  test("tracks sent messages", () => {
    const { instance, controls } = createControllableMockWebSocket();

    instance.send("message1");
    instance.send("message2");

    const messages = controls.getSentMessages();
    expect(messages).toEqual(["message1", "message2"]);
  });

  test("setReadyState changes the state", () => {
    const { instance, controls } = createControllableMockWebSocket();

    controls.setReadyState(WebSocketReadyState.CLOSING);
    expect(instance.readyState).toBe(WebSocketReadyState.CLOSING);
  });
});
