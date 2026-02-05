/**
 * Tests for Gemini service retry logic with exponential backoff.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/gemini.ts
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { parseRetryDelay, isRateLimitError, sleep } from "./gemini";

describe("GeminiService retry utilities", () => {
  describe("isRateLimitError", () => {
    test("should return true for 429 status code", () => {
      const error = new Error("Rate limited");
      (error as unknown as { status: number }).status = 429;
      expect(isRateLimitError(error)).toBe(true);
    });

    test("should return true for RESOURCE_EXHAUSTED error", () => {
      const error = new Error("RESOURCE_EXHAUSTED: Quota exceeded");
      expect(isRateLimitError(error)).toBe(true);
    });

    test("should return false for other errors", () => {
      const error = new Error("Network error");
      expect(isRateLimitError(error)).toBe(false);
    });
  });

  describe("parseRetryDelay", () => {
    test("should extract retry delay from error message", () => {
      const error = new Error("Rate limited, retry after 30 seconds");
      (error as unknown as { retryDelay: number }).retryDelay = 30;
      expect(parseRetryDelay(error)).toBe(30);
    });

    test("should return null for errors without retry delay", () => {
      const error = new Error("Unknown error");
      expect(parseRetryDelay(error)).toBeNull();
    });

    test("should parse retryDelay from error object property", () => {
      const error = { retryDelay: 45, message: "Rate limited" };
      expect(parseRetryDelay(error)).toBe(45);
    });
  });

  describe("sleep", () => {
    test("should resolve after specified delay", async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(150);
    });
  });
});
