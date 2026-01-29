/**
 * Tests for TranscriptStore.
 */

import { describe, test, expect, mock } from "bun:test";
import { createTranscriptStore } from "./transcript-store";
import type { TranscriptStoreState } from "./types";

describe("createTranscriptStore", () => {
  test("initializes with empty state", () => {
    const onStateChange = mock(() => {});
    const store = createTranscriptStore({ onStateChange });
    const state = store.getState();

    expect(state.segments).toEqual([]);
    expect(state.interimText).toBe("");
    expect(state.interimSpeaker).toBeUndefined();
    expect(state.interimStartTime).toBeUndefined();
  });

  test("addTranscript with final=true adds to segments", () => {
    const onStateChange = mock(() => {});
    const store = createTranscriptStore({ onStateChange });

    store.addTranscript({
      text: "Hello world",
      isFinal: true,
      timestamp: 1000,
      speaker: 1,
      startTime: 0.5,
    });

    const state = store.getState();
    expect(state.segments).toHaveLength(1);
    expect(state.segments[0]).toEqual({
      text: "Hello world",
      isFinal: true,
      timestamp: 1000,
      speaker: 1,
      startTime: 0.5,
    });
    expect(state.interimText).toBe("");
  });

  test("addTranscript with final=false updates interim state", () => {
    const onStateChange = mock(() => {});
    const store = createTranscriptStore({ onStateChange });

    store.addTranscript({
      text: "Hello wor",
      isFinal: false,
      timestamp: 1000,
      speaker: 2,
      startTime: 1.5,
    });

    const state = store.getState();
    expect(state.segments).toHaveLength(0);
    expect(state.interimText).toBe("Hello wor");
    expect(state.interimSpeaker).toBe(2);
    expect(state.interimStartTime).toBe(1.5);
  });

  test("addTranscript clears interim when final=true", () => {
    const onStateChange = mock(() => {});
    const store = createTranscriptStore({ onStateChange });

    // Add interim first
    store.addTranscript({
      text: "Hello",
      isFinal: false,
      timestamp: 1000,
    });

    expect(store.getState().interimText).toBe("Hello");

    // Add final
    store.addTranscript({
      text: "Hello world",
      isFinal: true,
      timestamp: 1001,
    });

    const state = store.getState();
    expect(state.segments).toHaveLength(1);
    expect(state.interimText).toBe("");
  });

  test("markUtteranceEnd marks last segment", () => {
    const onStateChange = mock(() => {});
    const store = createTranscriptStore({ onStateChange });

    store.addTranscript({
      text: "First",
      isFinal: true,
      timestamp: 1000,
    });

    store.addTranscript({
      text: "Second",
      isFinal: true,
      timestamp: 2000,
    });

    store.markUtteranceEnd(3000);

    const state = store.getState();
    expect(state.segments[0]!.isUtteranceEnd).toBeUndefined();
    expect(state.segments[1]!.isUtteranceEnd).toBe(true);
  });

  test("markUtteranceEnd does nothing with empty segments", () => {
    const onStateChange = mock(() => {});
    const store = createTranscriptStore({ onStateChange });

    // Should not throw
    store.markUtteranceEnd(1000);
    expect(store.getState().segments).toHaveLength(0);
  });

  test("loadHistory replaces all segments", () => {
    const onStateChange = mock(() => {});
    const store = createTranscriptStore({ onStateChange });

    // Add some initial data
    store.addTranscript({
      text: "Initial",
      isFinal: true,
      timestamp: 1000,
    });

    // Load history
    store.loadHistory([
      { text: "History 1", timestamp: 100, isFinal: true },
      { text: "History 2", timestamp: 200, isFinal: true },
    ]);

    const state = store.getState();
    expect(state.segments).toHaveLength(2);
    expect(state.segments[0]!.text).toBe("History 1");
    expect(state.segments[1]!.text).toBe("History 2");
    expect(state.interimText).toBe("");
  });

  test("clear resets all state", () => {
    const onStateChange = mock(() => {});
    const store = createTranscriptStore({ onStateChange });

    store.addTranscript({
      text: "Hello",
      isFinal: true,
      timestamp: 1000,
    });

    store.addTranscript({
      text: "Interim",
      isFinal: false,
      timestamp: 2000,
      speaker: 1,
      startTime: 1.5,
    });

    store.clear();

    const state = store.getState();
    expect(state.segments).toHaveLength(0);
    expect(state.interimText).toBe("");
    expect(state.interimSpeaker).toBeUndefined();
    expect(state.interimStartTime).toBeUndefined();
  });

  test("emits state changes on updates", () => {
    const states: TranscriptStoreState[] = [];
    const onStateChange = mock((state: TranscriptStoreState) => {
      states.push(state);
    });

    const store = createTranscriptStore({ onStateChange });

    store.addTranscript({
      text: "Hello",
      isFinal: false,
      timestamp: 1000,
    });

    store.addTranscript({
      text: "Hello world",
      isFinal: true,
      timestamp: 1001,
    });

    expect(states).toHaveLength(2);
    expect(states[0]!.interimText).toBe("Hello");
    expect(states[1]!.segments).toHaveLength(1);
  });
});
