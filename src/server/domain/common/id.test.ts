import { describe, expect, test } from "bun:test";
import { generateSessionId, isValidUUID } from "./id";

describe("generateSessionId", () => {
  test("creates prefixed id", () => {
    expect(generateSessionId()).toMatch(/^session-/);
  });
});

describe("isValidUUID", () => {
  test("validates UUID v4 format", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUUID("invalid")).toBe(false);
  });
});
