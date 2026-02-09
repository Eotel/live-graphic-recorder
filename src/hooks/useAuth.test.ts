/**
 * Tests for useAuth hook.
 *
 * Related: src/hooks/useAuth.ts
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "./useAuth";

interface FetchCall {
  path: string;
  method: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pathFromInput(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.pathname;
  }
  return input.url;
}

async function flushAuthEffect(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useAuth", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("initial load authenticates when /api/auth/me succeeds", async () => {
    const calls: FetchCall[] = [];
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        calls.push({
          path: pathFromInput(input),
          method: init?.method ?? "GET",
        });
        return jsonResponse({
          user: { id: "user-1", email: "user1@example.com", role: "user" },
        });
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth());
    await flushAuthEffect();

    expect(result.current.status).toBe("authenticated");
    expect(result.current.user).toEqual({ id: "user-1", email: "user1@example.com", role: "user" });
    expect(calls).toEqual([{ path: "/api/auth/me", method: "GET" }]);
  });

  test("retries /api/auth/me after successful refresh", async () => {
    const calls: FetchCall[] = [];
    const queue: Array<Response> = [
      new Response("Unauthorized", { status: 401 }),
      jsonResponse({ user: { id: "user-1", email: "user1@example.com", role: "user" } }),
      jsonResponse({ user: { id: "user-1", email: "user1@example.com", role: "user" } }),
    ];

    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        calls.push({
          path: pathFromInput(input),
          method: init?.method ?? "GET",
        });

        const next = queue.shift();
        if (!next) {
          throw new Error("Unexpected fetch call");
        }
        return next;
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth());
    await flushAuthEffect();

    expect(calls).toEqual([
      { path: "/api/auth/me", method: "GET" },
      { path: "/api/auth/refresh", method: "POST" },
      { path: "/api/auth/me", method: "GET" },
    ]);
    expect(result.current.status).toBe("authenticated");
    expect(result.current.user).toEqual({ id: "user-1", email: "user1@example.com", role: "user" });
  });

  test("becomes unauthenticated when refresh fails", async () => {
    const calls: FetchCall[] = [];
    const queue: Array<Response> = [
      new Response("Unauthorized", { status: 401 }),
      new Response("Unauthorized", { status: 401 }),
    ];

    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        calls.push({
          path: pathFromInput(input),
          method: init?.method ?? "GET",
        });

        const next = queue.shift();
        if (!next) {
          throw new Error("Unexpected fetch call");
        }
        return next;
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth());
    await flushAuthEffect();

    expect(calls).toEqual([
      { path: "/api/auth/me", method: "GET" },
      { path: "/api/auth/refresh", method: "POST" },
    ]);
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });

  test("becomes unauthenticated when retried /api/auth/me fails", async () => {
    const calls: FetchCall[] = [];
    const queue: Array<Response> = [
      new Response("Unauthorized", { status: 401 }),
      jsonResponse({ user: { id: "user-1", email: "user1@example.com", role: "user" } }),
      new Response("Unauthorized", { status: 401 }),
    ];

    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        calls.push({
          path: pathFromInput(input),
          method: init?.method ?? "GET",
        });

        const next = queue.shift();
        if (!next) {
          throw new Error("Unexpected fetch call");
        }
        return next;
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth());
    await flushAuthEffect();

    expect(calls).toEqual([
      { path: "/api/auth/me", method: "GET" },
      { path: "/api/auth/refresh", method: "POST" },
      { path: "/api/auth/me", method: "GET" },
    ]);
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });

  test("becomes unauthenticated when me and refresh throw", async () => {
    const calls: FetchCall[] = [];
    const fetchMock = mock(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const call = {
          path: pathFromInput(input),
          method: init?.method ?? "GET",
        };
        calls.push(call);

        if (call.path === "/api/auth/me") {
          throw new Error("me network error");
        }
        if (call.path === "/api/auth/refresh") {
          throw new Error("refresh network error");
        }

        throw new Error("Unexpected fetch call");
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth());
    await flushAuthEffect();

    expect(calls).toEqual([
      { path: "/api/auth/me", method: "GET" },
      { path: "/api/auth/refresh", method: "POST" },
    ]);
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
  });
});
