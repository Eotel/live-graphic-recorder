/**
 * Tests for formatElapsedTime utility function.
 *
 * Related: src/lib/formatTime.ts
 */

import { describe, test, expect } from "bun:test";
import { formatElapsedTime } from "./formatTime";

describe("formatElapsedTime", () => {
  test("formats 0 seconds as 00:00", () => {
    expect(formatElapsedTime(0)).toBe("00:00");
  });

  test("formats seconds under a minute", () => {
    expect(formatElapsedTime(45)).toBe("00:45");
  });

  test("formats single digit seconds with padding", () => {
    expect(formatElapsedTime(5)).toBe("00:05");
  });

  test("formats exactly one minute", () => {
    expect(formatElapsedTime(60)).toBe("01:00");
  });

  test("formats minutes and seconds", () => {
    expect(formatElapsedTime(125)).toBe("02:05");
  });

  test("formats 59 minutes 59 seconds", () => {
    expect(formatElapsedTime(3599)).toBe("59:59");
  });

  test("formats exactly one hour with HH:MM:SS", () => {
    expect(formatElapsedTime(3600)).toBe("01:00:00");
  });

  test("formats hours, minutes, and seconds", () => {
    expect(formatElapsedTime(3725)).toBe("01:02:05");
  });

  test("handles negative numbers by treating as 0", () => {
    expect(formatElapsedTime(-10)).toBe("00:00");
  });
});
