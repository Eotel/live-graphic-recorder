/**
 * Tests for transcript utility functions.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/lib/transcript-utils.ts, src/types/messages.ts
 */

import { describe, test, expect } from "bun:test";
import { formatTime, groupByUtterance } from "./transcript-utils";
import type { TranscriptSegment } from "@/types/messages";

describe("formatTime", () => {
  test("formats 0 seconds as 0:00", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  test("formats seconds less than a minute", () => {
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(30)).toBe("0:30");
    expect(formatTime(59)).toBe("0:59");
  });

  test("formats exactly one minute", () => {
    expect(formatTime(60)).toBe("1:00");
  });

  test("formats minutes and seconds", () => {
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(90)).toBe("1:30");
    expect(formatTime(125)).toBe("2:05");
  });

  test("formats times over 10 minutes", () => {
    expect(formatTime(600)).toBe("10:00");
    expect(formatTime(3599)).toBe("59:59");
  });

  test("formats times over an hour", () => {
    expect(formatTime(3600)).toBe("60:00");
    expect(formatTime(3661)).toBe("61:01");
  });

  test("handles fractional seconds by flooring", () => {
    expect(formatTime(1.5)).toBe("0:01");
    expect(formatTime(59.9)).toBe("0:59");
    expect(formatTime(60.1)).toBe("1:00");
  });

  test("handles negative values as 0:00", () => {
    expect(formatTime(-1)).toBe("0:00");
    expect(formatTime(-60)).toBe("0:00");
  });
});

describe("groupByUtterance", () => {
  test("returns empty array for empty input", () => {
    expect(groupByUtterance([])).toEqual([]);
  });

  test("groups single segment into one utterance", () => {
    const segments: TranscriptSegment[] = [
      { text: "Hello", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      text: "Hello",
      speaker: 0,
      startTime: 0,
      isInterim: false,
    });
  });

  test("combines consecutive segments from same speaker", () => {
    const segments: TranscriptSegment[] = [
      { text: "Hello", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
      { text: "world", timestamp: 2000, isFinal: true, speaker: 0, startTime: 1 },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      text: "Hello world",
      speaker: 0,
      startTime: 0,
      isInterim: false,
    });
  });

  test("splits on utterance end marker", () => {
    const segments: TranscriptSegment[] = [
      {
        text: "First sentence",
        timestamp: 1000,
        isFinal: true,
        speaker: 0,
        startTime: 0,
        isUtteranceEnd: true,
      },
      { text: "Second sentence", timestamp: 3000, isFinal: true, speaker: 0, startTime: 2 },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(2);
    expect(result[0]!.text).toBe("First sentence");
    expect(result[1]!.text).toBe("Second sentence");
  });

  test("splits on speaker change", () => {
    const segments: TranscriptSegment[] = [
      { text: "Speaker A says", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
      { text: "Speaker B responds", timestamp: 2000, isFinal: true, speaker: 1, startTime: 1 },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      text: "Speaker A says",
      speaker: 0,
      startTime: 0,
      isInterim: false,
    });
    expect(result[1]).toEqual({
      text: "Speaker B responds",
      speaker: 1,
      startTime: 1,
      isInterim: false,
    });
  });

  test("handles multiple speakers with utterance ends", () => {
    const segments: TranscriptSegment[] = [
      { text: "Hello", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
      {
        text: "everyone",
        timestamp: 2000,
        isFinal: true,
        speaker: 0,
        startTime: 1,
        isUtteranceEnd: true,
      },
      { text: "Hi there", timestamp: 3000, isFinal: true, speaker: 1, startTime: 2 },
      { text: "Back to me", timestamp: 4000, isFinal: true, speaker: 0, startTime: 3 },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(3);
    expect(result[0]!.text).toBe("Hello everyone");
    expect(result[0]!.speaker).toBe(0);
    expect(result[1]!.text).toBe("Hi there");
    expect(result[1]!.speaker).toBe(1);
    expect(result[2]!.text).toBe("Back to me");
    expect(result[2]!.speaker).toBe(0);
  });

  test("marks interim segment as isInterim", () => {
    const segments: TranscriptSegment[] = [
      { text: "Hello", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
      { text: "world", timestamp: 2000, isFinal: false, speaker: 0, startTime: 1 },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe("Hello world");
    expect(result[0]!.isInterim).toBe(true);
  });

  test("handles segments without speaker info (defaults to undefined)", () => {
    const segments: TranscriptSegment[] = [
      { text: "No speaker", timestamp: 1000, isFinal: true },
      { text: "info here", timestamp: 2000, isFinal: true },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(1);
    expect(result[0]!.speaker).toBeUndefined();
  });

  test("handles segments without startTime (uses first segment timestamp)", () => {
    const segments: TranscriptSegment[] = [
      { text: "No start time", timestamp: 1000, isFinal: true },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(1);
    expect(result[0]!.startTime).toBeUndefined();
  });

  test("filters out empty text segments", () => {
    const segments: TranscriptSegment[] = [
      { text: "", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
      { text: "Hello", timestamp: 2000, isFinal: true, speaker: 0, startTime: 1 },
      { text: "   ", timestamp: 3000, isFinal: true, speaker: 0, startTime: 2 },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe("Hello");
  });

  test("handles complex multi-speaker conversation", () => {
    const segments: TranscriptSegment[] = [
      // Speaker 0 - first utterance
      { text: "Good morning", timestamp: 1000, isFinal: true, speaker: 0, startTime: 0 },
      {
        text: "everyone",
        timestamp: 2000,
        isFinal: true,
        speaker: 0,
        startTime: 1,
        isUtteranceEnd: true,
      },
      // Speaker 1 - response
      {
        text: "Morning",
        timestamp: 3000,
        isFinal: true,
        speaker: 1,
        startTime: 2,
        isUtteranceEnd: true,
      },
      // Speaker 2 - joins
      { text: "Hi all", timestamp: 4000, isFinal: true, speaker: 2, startTime: 3 },
      {
        text: "how are you",
        timestamp: 5000,
        isFinal: true,
        speaker: 2,
        startTime: 4,
        isUtteranceEnd: true,
      },
      // Speaker 0 - responds with interim
      { text: "I am doing", timestamp: 6000, isFinal: true, speaker: 0, startTime: 5 },
      { text: "well", timestamp: 7000, isFinal: false, speaker: 0, startTime: 6 },
    ];

    const result = groupByUtterance(segments);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      text: "Good morning everyone",
      speaker: 0,
      startTime: 0,
      isInterim: false,
    });
    expect(result[1]).toEqual({ text: "Morning", speaker: 1, startTime: 2, isInterim: false });
    expect(result[2]).toEqual({
      text: "Hi all how are you",
      speaker: 2,
      startTime: 3,
      isInterim: false,
    });
    expect(result[3]).toEqual({
      text: "I am doing well",
      speaker: 0,
      startTime: 5,
      isInterim: true,
    });
  });
});
