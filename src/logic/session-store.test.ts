/**
 * Tests for SessionStore.
 */

import { describe, test, expect, mock } from "bun:test";
import { createSessionStore } from "./session-store";
import type { SessionStoreState } from "./types";

describe("createSessionStore", () => {
  test("initializes with empty state", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });
    const state = store.getState();

    expect(state.analyses).toEqual([]);
    expect(state.images).toEqual([]);
    expect(state.captures).toEqual([]);
    expect(state.metaSummaries).toEqual([]);
  });

  test("addAnalysis adds analysis with timestamp", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    const before = Date.now();
    store.addAnalysis({
      summary: ["Point 1", "Point 2"],
      topics: ["Topic A"],
      tags: ["tag1"],
      flow: 75,
      heat: 50,
    });
    const after = Date.now();

    const state = store.getState();
    expect(state.analyses).toHaveLength(1);
    expect(state.analyses[0]!.summary).toEqual(["Point 1", "Point 2"]);
    expect(state.analyses[0]!.topics).toEqual(["Topic A"]);
    expect(state.analyses[0]!.flow).toBe(75);
    expect(state.analyses[0]!.heat).toBe(50);
    expect(state.analyses[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(state.analyses[0]!.timestamp).toBeLessThanOrEqual(after);
  });

  test("addAnalysis preserves provided timestamp", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    store.addAnalysis({
      summary: [],
      topics: [],
      tags: [],
      flow: 50,
      heat: 50,
      timestamp: 12345,
    });

    expect(store.getState().analyses[0]!.timestamp).toBe(12345);
  });

  test("addImage adds image data", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    store.addImage({
      base64: "data:image/png;base64,abc123",
      prompt: "A test image",
      timestamp: 1000,
    });

    const state = store.getState();
    expect(state.images).toHaveLength(1);
    expect(state.images[0]!.base64).toBe("data:image/png;base64,abc123");
    expect(state.images[0]!.prompt).toBe("A test image");
    expect(state.images[0]!.timestamp).toBe(1000);
  });

  test("addImage adds image with URL", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    store.addImage({
      url: "/images/test.png",
      prompt: "A test image",
      timestamp: 2000,
    });

    const state = store.getState();
    expect(state.images[0]!.url).toBe("/images/test.png");
    expect(state.images[0]!.base64).toBeUndefined();
  });

  test("addCapture adds capture data", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    store.addCapture({
      url: "/captures/frame1.jpg",
      timestamp: 3000,
    });

    const state = store.getState();
    expect(state.captures).toHaveLength(1);
    expect(state.captures[0]!.url).toBe("/captures/frame1.jpg");
    expect(state.captures[0]!.timestamp).toBe(3000);
  });

  test("loadHistory replaces all data", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    // Add initial data
    store.addAnalysis({
      summary: ["Initial"],
      topics: [],
      tags: [],
      flow: 50,
      heat: 50,
    });

    // Load history
    store.loadHistory({
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
      captures: [
        {
          url: "/history/capture.jpg",
          timestamp: 300,
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

    const state = store.getState();
    expect(state.analyses).toHaveLength(1);
    expect(state.analyses[0]!.summary).toEqual(["History analysis"]);
    expect(state.images).toHaveLength(1);
    expect(state.images[0]!.url).toBe("/history/image.png");
    expect(state.captures).toHaveLength(1);
    expect(state.metaSummaries).toHaveLength(1);
    expect(state.metaSummaries[0]!.themes).toEqual(["theme1"]);
  });

  test("loadHistory with partial data", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    store.loadHistory({
      analyses: [
        {
          summary: ["Only analyses"],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
        },
      ],
    });

    const state = store.getState();
    expect(state.analyses).toHaveLength(1);
    expect(state.images).toHaveLength(0);
    expect(state.captures).toHaveLength(0);
    expect(state.metaSummaries).toHaveLength(0);
  });

  test("clear resets all state", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    store.addAnalysis({
      summary: ["Point"],
      topics: [],
      tags: [],
      flow: 50,
      heat: 50,
    });
    store.addImage({
      url: "/image.png",
      prompt: "Test",
      timestamp: 1000,
    });
    store.addCapture({
      url: "/capture.jpg",
      timestamp: 2000,
    });

    store.clear();

    const state = store.getState();
    expect(state.analyses).toHaveLength(0);
    expect(state.images).toHaveLength(0);
    expect(state.captures).toHaveLength(0);
    expect(state.metaSummaries).toHaveLength(0);
  });

  test("emits state changes on updates", () => {
    const states: SessionStoreState[] = [];
    const onStateChange = mock((state: SessionStoreState) => {
      states.push(state);
    });

    const store = createSessionStore({ onStateChange });

    store.addAnalysis({
      summary: ["First"],
      topics: [],
      tags: [],
      flow: 50,
      heat: 50,
    });

    store.addImage({
      url: "/test.png",
      prompt: "Test",
      timestamp: 1000,
    });

    expect(states).toHaveLength(2);
    expect(states[0]!.analyses).toHaveLength(1);
    expect(states[1]!.images).toHaveLength(1);
  });

  test("multiple analyses accumulate", () => {
    const onStateChange = mock(() => {});
    const store = createSessionStore({ onStateChange });

    store.addAnalysis({
      summary: ["First"],
      topics: [],
      tags: [],
      flow: 50,
      heat: 50,
    });

    store.addAnalysis({
      summary: ["Second"],
      topics: [],
      tags: [],
      flow: 60,
      heat: 60,
    });

    const state = store.getState();
    expect(state.analyses).toHaveLength(2);
    expect(state.analyses[0]!.summary).toEqual(["First"]);
    expect(state.analyses[1]!.summary).toEqual(["Second"]);
  });
});
