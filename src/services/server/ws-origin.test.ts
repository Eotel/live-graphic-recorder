import { describe, expect, test } from "bun:test";
import {
  buildExpectedOrigins,
  parseAllowedOrigins,
  validateWebSocketOrigin,
} from "./ws-origin";

describe("parseAllowedOrigins", () => {
  test("normalizes valid origins and skips invalid entries", () => {
    const allowed = parseAllowedOrigins(
      "https://app.example.com,invalid,http://localhost:3000/path,",
    );

    expect(allowed.has("https://app.example.com")).toBe(true);
    expect(allowed.has("http://localhost:3000")).toBe(true);
    expect(allowed.has("invalid")).toBe(false);
  });
});

describe("buildExpectedOrigins", () => {
  test("collects request origin and forwarded origin when both are valid", () => {
    const req = new Request("http://127.0.0.1:3000/ws/recording", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "rec.example.com",
      },
    });

    const expected = buildExpectedOrigins(req);
    expect(expected.has("http://127.0.0.1:3000")).toBe(true);
    expect(expected.has("https://rec.example.com")).toBe(true);
  });
});

describe("validateWebSocketOrigin", () => {
  test("allows same-origin websocket upgrade", () => {
    const req = new Request("http://localhost:3000/ws/recording", {
      headers: {
        origin: "http://localhost:3000",
      },
    });

    expect(validateWebSocketOrigin(req, new Set())).toEqual({ ok: true });
  });

  test("rejects when Origin header is missing", () => {
    const req = new Request("http://localhost:3000/ws/recording");

    expect(validateWebSocketOrigin(req, new Set())).toEqual({
      ok: false,
      reason: "missing_origin",
    });
  });

  test("rejects different origin", () => {
    const req = new Request("http://localhost:3000/ws/recording", {
      headers: {
        origin: "https://evil.example.com",
      },
    });

    expect(validateWebSocketOrigin(req, new Set())).toEqual({
      ok: false,
      reason: "origin_mismatch",
    });
  });

  test("allows origins explicitly listed in allowlist", () => {
    const req = new Request("http://localhost:3000/ws/recording", {
      headers: {
        origin: "https://app.example.com",
      },
    });
    const allowlist = parseAllowedOrigins("https://app.example.com");

    expect(validateWebSocketOrigin(req, allowlist)).toEqual({ ok: true });
  });

  test("allows forwarded origin for reverse proxy setups", () => {
    const req = new Request("http://127.0.0.1:3000/ws/recording", {
      headers: {
        origin: "https://rec.example.com:8443",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "rec.example.com",
        "x-forwarded-port": "8443",
      },
    });

    expect(validateWebSocketOrigin(req, new Set())).toEqual({ ok: true });
  });

  test("rejects invalid Origin format", () => {
    const req = new Request("http://localhost:3000/ws/recording", {
      headers: {
        origin: "not a url",
      },
    });

    expect(validateWebSocketOrigin(req, new Set())).toEqual({
      ok: false,
      reason: "invalid_origin",
    });
  });

  test("ignores invalid forwarded headers and falls back to request origin", () => {
    const req = new Request("http://localhost:3000/ws/recording", {
      headers: {
        origin: "https://rec.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "invalid host value",
      },
    });

    expect(validateWebSocketOrigin(req, new Set())).toEqual({
      ok: false,
      reason: "origin_mismatch",
    });
  });
});
