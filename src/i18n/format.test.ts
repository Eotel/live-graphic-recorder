import { describe, expect, test } from "bun:test";
import { formatRelativeMeetingDate, normalizeTimestamp } from "./format";

describe("i18n format helpers", () => {
  test("normalizes second-based unix timestamp to milliseconds", () => {
    expect(normalizeTimestamp(1_700_000_000)).toBe(1_700_000_000_000);
  });

  test("returns unknown label for invalid timestamp", () => {
    expect(formatRelativeMeetingDate(Number.NaN, "en", "Unknown")).toBe("Unknown");
  });

  test("formats relative dates in English", () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const formatted = formatRelativeMeetingDate(twoDaysAgo, "en", "Unknown");

    expect(formatted.toLowerCase()).toContain("ago");
  });

  test("formats relative dates in Japanese", () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const formatted = formatRelativeMeetingDate(twoDaysAgo, "ja", "不明");

    expect(/前|昨日/.test(formatted)).toBe(true);
  });
});
