/**
 * Tests for useTranscriptStore hook.
 */

import { describe, test, expect, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useTranscriptStore } from "./useTranscriptStore";

describe("useTranscriptStore", () => {
  test("initializes with empty state", () => {
    const { result } = renderHook(() => useTranscriptStore());

    expect(result.current.segments).toEqual([]);
    expect(result.current.interimText).toBe("");
    expect(result.current.interimSpeaker).toBeUndefined();
    expect(result.current.interimStartTime).toBeUndefined();
    expect(result.current.speakerAliases).toEqual({});
  });

  test("addTranscript with final=true adds to segments", () => {
    const { result } = renderHook(() => useTranscriptStore());

    act(() => {
      result.current.addTranscript({
        text: "Hello world",
        isFinal: true,
        timestamp: 1000,
        speaker: 1,
        startTime: 0.5,
      });
    });

    expect(result.current.segments).toHaveLength(1);
    expect(result.current.segments[0]!.text).toBe("Hello world");
    expect(result.current.segments[0]!.speaker).toBe(1);
    expect(result.current.interimText).toBe("");
  });

  test("addTranscript with final=false updates interim state", () => {
    const { result } = renderHook(() => useTranscriptStore());

    act(() => {
      result.current.addTranscript({
        text: "Hello wor",
        isFinal: false,
        timestamp: 1000,
        speaker: 2,
        startTime: 1.5,
      });
    });

    expect(result.current.segments).toHaveLength(0);
    expect(result.current.interimText).toBe("Hello wor");
    expect(result.current.interimSpeaker).toBe(2);
    expect(result.current.interimStartTime).toBe(1.5);
  });

  test("markUtteranceEnd marks last segment", () => {
    const { result } = renderHook(() => useTranscriptStore());

    act(() => {
      result.current.addTranscript({
        text: "First",
        isFinal: true,
        timestamp: 1000,
      });
      result.current.addTranscript({
        text: "Second",
        isFinal: true,
        timestamp: 2000,
      });
      result.current.markUtteranceEnd(3000);
    });

    expect(result.current.segments[0]!.isUtteranceEnd).toBeUndefined();
    expect(result.current.segments[1]!.isUtteranceEnd).toBe(true);
  });

  test("loadHistory replaces all segments", () => {
    const { result } = renderHook(() => useTranscriptStore());

    act(() => {
      result.current.addTranscript({
        text: "Initial",
        isFinal: true,
        timestamp: 1000,
      });
    });

    act(() => {
      result.current.loadHistory([
        { text: "History 1", timestamp: 100, isFinal: true },
        { text: "History 2", timestamp: 200, isFinal: true },
      ]);
    });

    expect(result.current.segments).toHaveLength(2);
    expect(result.current.segments[0]!.text).toBe("History 1");
    expect(result.current.segments[1]!.text).toBe("History 2");
  });

  test("clear resets all state", () => {
    const { result } = renderHook(() => useTranscriptStore());

    act(() => {
      result.current.addTranscript({
        text: "Hello",
        isFinal: true,
        timestamp: 1000,
      });
      result.current.addTranscript({
        text: "Interim",
        isFinal: false,
        timestamp: 2000,
        speaker: 1,
      });
      result.current.setSpeakerAlias(1, "田中");
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.segments).toHaveLength(0);
    expect(result.current.interimText).toBe("");
    expect(result.current.interimSpeaker).toBeUndefined();
    expect(result.current.speakerAliases).toEqual({});
  });

  test("setSpeakerAlias updates alias map", () => {
    const { result } = renderHook(() => useTranscriptStore());

    act(() => {
      result.current.setSpeakerAlias(0, "田中");
    });
    expect(result.current.speakerAliases).toEqual({ 0: "田中" });

    act(() => {
      result.current.setSpeakerAlias(0, "");
    });
    expect(result.current.speakerAliases).toEqual({});
  });

  test("setSpeakerAliases replaces alias map", () => {
    const { result } = renderHook(() => useTranscriptStore());

    act(() => {
      result.current.setSpeakerAlias(0, "旧名");
      result.current.setSpeakerAliases({ 1: "山田", 2: "鈴木" });
    });

    expect(result.current.speakerAliases).toEqual({ 1: "山田", 2: "鈴木" });
  });

  test("maintains stable action references", () => {
    const { result, rerender } = renderHook(() => useTranscriptStore());

    const addTranscript1 = result.current.addTranscript;
    const clear1 = result.current.clear;
    const setSpeakerAlias1 = result.current.setSpeakerAlias;

    rerender();

    expect(result.current.addTranscript).toBe(addTranscript1);
    expect(result.current.clear).toBe(clear1);
    expect(result.current.setSpeakerAlias).toBe(setSpeakerAlias1);
  });
});
