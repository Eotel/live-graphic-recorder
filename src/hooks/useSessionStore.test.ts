/**
 * Tests for useSessionStore hook.
 */

import { describe, test, expect, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useSessionStore } from "./useSessionStore";

describe("useSessionStore", () => {
  test("initializes with empty state", () => {
    const { result } = renderHook(() => useSessionStore());

    expect(result.current.analyses).toEqual([]);
    expect(result.current.images).toEqual([]);
    expect(result.current.captures).toEqual([]);
    expect(result.current.metaSummaries).toEqual([]);
  });

  test("addAnalysis adds analysis with timestamp", () => {
    const { result } = renderHook(() => useSessionStore());

    const before = Date.now();
    act(() => {
      result.current.addAnalysis({
        summary: ["Point 1", "Point 2"],
        topics: ["Topic A"],
        tags: ["tag1"],
        flow: 75,
        heat: 50,
      });
    });
    const after = Date.now();

    expect(result.current.analyses).toHaveLength(1);
    expect(result.current.analyses[0]!.summary).toEqual(["Point 1", "Point 2"]);
    expect(result.current.analyses[0]!.flow).toBe(75);
    expect(result.current.analyses[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.current.analyses[0]!.timestamp).toBeLessThanOrEqual(after);
  });

  test("addImage adds image data", () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.addImage({
        base64: "data:image/png;base64,abc123",
        prompt: "A test image",
        timestamp: 1000,
      });
    });

    expect(result.current.images).toHaveLength(1);
    expect(result.current.images[0]!.base64).toBe("data:image/png;base64,abc123");
    expect(result.current.images[0]!.prompt).toBe("A test image");
  });

  test("addCapture adds capture data", () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.addCapture({
        url: "/captures/frame1.jpg",
        timestamp: 3000,
      });
    });

    expect(result.current.captures).toHaveLength(1);
    expect(result.current.captures[0]!.url).toBe("/captures/frame1.jpg");
  });

  test("loadHistory replaces all data", () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.addAnalysis({
        summary: ["Initial"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
      });
    });

    act(() => {
      result.current.loadHistory({
        analyses: [
          {
            summary: ["History analysis"],
            topics: ["topic"],
            tags: ["tag"],
            flow: 80,
            heat: 60,
            timestamp: 100,
          },
        ],
        images: [
          {
            url: "/history/image.png",
            prompt: "History image",
            timestamp: 200,
          },
        ],
        metaSummaries: [
          {
            summary: ["Meta summary"],
            themes: ["theme1"],
            startTime: 0,
            endTime: 1000,
          },
        ],
      });
    });

    expect(result.current.analyses).toHaveLength(1);
    expect(result.current.analyses[0]!.summary).toEqual(["History analysis"]);
    expect(result.current.images).toHaveLength(1);
    expect(result.current.metaSummaries).toHaveLength(1);
  });

  test("clear resets all state", () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.addAnalysis({
        summary: ["Point"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
      });
      result.current.addImage({
        url: "/image.png",
        prompt: "Test",
        timestamp: 1000,
      });
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.analyses).toHaveLength(0);
    expect(result.current.images).toHaveLength(0);
    expect(result.current.captures).toHaveLength(0);
  });

  test("maintains stable action references", () => {
    const { result, rerender } = renderHook(() => useSessionStore());

    const addAnalysis1 = result.current.addAnalysis;
    const clear1 = result.current.clear;

    rerender();

    expect(result.current.addAnalysis).toBe(addAnalysis1);
    expect(result.current.clear).toBe(clear1);
  });

  test("multiple analyses accumulate", () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.addAnalysis({
        summary: ["First"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
      });
    });

    act(() => {
      result.current.addAnalysis({
        summary: ["Second"],
        topics: [],
        tags: [],
        flow: 60,
        heat: 60,
      });
    });

    expect(result.current.analyses).toHaveLength(2);
    expect(result.current.analyses[0]!.summary).toEqual(["First"]);
    expect(result.current.analyses[1]!.summary).toEqual(["Second"]);
  });
});
