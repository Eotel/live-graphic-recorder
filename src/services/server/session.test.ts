import { describe, test, expect, beforeEach } from "bun:test";
import {
  createSession,
  startSession,
  stopSession,
  addTranscript,
  getFullTranscript,
  shouldTriggerAnalysis,
  markAnalysisComplete,
  addImage,
  getLatestAnalysis,
  addCameraFrame,
  getCameraFrames,
  getLatestImage,
} from "./session";
import type { SessionState, AnalysisResult, CameraFrame } from "@/types/messages";

describe("SessionService", () => {
  let session: SessionState;

  beforeEach(() => {
    session = createSession("test-session-1");
  });

  describe("createSession", () => {
    test("should create a session with idle status", () => {
      expect(session.id).toBe("test-session-1");
      expect(session.status).toBe("idle");
      expect(session.transcript).toEqual([]);
      expect(session.analyses).toEqual([]);
      expect(session.images).toEqual([]);
    });
  });

  describe("startSession", () => {
    test("should set status to recording and startedAt", () => {
      const started = startSession(session);

      expect(started.status).toBe("recording");
      expect(started.startedAt).toBeGreaterThan(0);
      expect(started.lastAnalysisAt).toBeGreaterThan(0);
    });
  });

  describe("stopSession", () => {
    test("should set status back to idle", () => {
      const started = startSession(session);
      const stopped = stopSession(started);

      expect(stopped.status).toBe("idle");
    });
  });

  describe("addTranscript", () => {
    test("should add transcript segment and update word count", () => {
      const segment = {
        text: "Hello world this is a test",
        timestamp: Date.now(),
        isFinal: true,
      };

      const updated = addTranscript(session, segment);

      expect(updated.transcript).toHaveLength(1);
      expect(updated.transcript[0]).toEqual(segment);
      expect(updated.wordsSinceLastAnalysis).toBe(6);
    });

    test("should accumulate word count across segments", () => {
      let updated = addTranscript(session, {
        text: "Hello world",
        timestamp: Date.now(),
        isFinal: true,
      });
      updated = addTranscript(updated, {
        text: "Testing one two three",
        timestamp: Date.now(),
        isFinal: true,
      });

      expect(updated.wordsSinceLastAnalysis).toBe(6);
    });
  });

  describe("getFullTranscript", () => {
    test("should return concatenated final segments", () => {
      let updated = session;
      updated = addTranscript(updated, {
        text: "Hello",
        timestamp: 1,
        isFinal: true,
      });
      updated = addTranscript(updated, {
        text: "interim...",
        timestamp: 2,
        isFinal: false,
      });
      updated = addTranscript(updated, {
        text: "world",
        timestamp: 3,
        isFinal: true,
      });

      expect(getFullTranscript(updated)).toBe("Hello world");
    });
  });

  describe("shouldTriggerAnalysis", () => {
    test("should return false when not recording", () => {
      expect(shouldTriggerAnalysis(session, 1000)).toBe(false);
    });

    test("should return true when enough time has passed and has words", () => {
      let started = startSession(session);
      // Simulate time passing with some words spoken
      started = {
        ...started,
        lastAnalysisAt: Date.now() - 5000,
        wordsSinceLastAnalysis: 10,
      };

      expect(shouldTriggerAnalysis(started, 3000)).toBe(true);
    });

    test("should return true when word threshold is reached", () => {
      let started = startSession(session);
      // Add enough words
      started = {
        ...started,
        wordsSinceLastAnalysis: 500,
      };

      expect(shouldTriggerAnalysis(started, 999999999)).toBe(true);
    });

    test("should return false when enough time has passed but no words", () => {
      let started = startSession(session);
      // Simulate time passing but no words spoken
      started = {
        ...started,
        lastAnalysisAt: Date.now() - 5000,
        wordsSinceLastAnalysis: 0,
      };

      expect(shouldTriggerAnalysis(started, 3000)).toBe(false);
    });
  });

  describe("markAnalysisComplete", () => {
    test("should add analysis and reset word count", () => {
      const analysis: AnalysisResult = {
        summary: ["Point 1"],
        topics: ["Topic A"],
        tags: ["#tag1"],
        flow: 75,
        heat: 60,
        imagePrompt: "A meeting scene",
      };

      let updated = startSession(session);
      updated = addTranscript(updated, {
        text: "Some words here",
        timestamp: Date.now(),
        isFinal: true,
      });
      updated = markAnalysisComplete(updated, analysis);

      expect(updated.analyses).toHaveLength(1);
      expect(updated.analyses[0]).toEqual(analysis);
      expect(updated.wordsSinceLastAnalysis).toBe(0);
    });
  });

  describe("addImage", () => {
    test("should add image to session", () => {
      const image = {
        base64: "base64data",
        prompt: "test prompt",
        timestamp: Date.now(),
      };

      const updated = addImage(session, image);

      expect(updated.images).toHaveLength(1);
      expect(updated.images[0]).toEqual(image);
    });
  });

  describe("getLatestAnalysis", () => {
    test("should return undefined when no analyses", () => {
      expect(getLatestAnalysis(session)).toBeUndefined();
    });

    test("should return the last analysis", () => {
      const analysis1: AnalysisResult = {
        summary: ["First"],
        topics: ["Topic 1"],
        tags: ["#a"],
        flow: 50,
        heat: 50,
        imagePrompt: "prompt1",
      };
      const analysis2: AnalysisResult = {
        summary: ["Second"],
        topics: ["Topic 2"],
        tags: ["#b"],
        flow: 75,
        heat: 75,
        imagePrompt: "prompt2",
      };

      let updated = markAnalysisComplete(session, analysis1);
      updated = markAnalysisComplete(updated, analysis2);

      expect(getLatestAnalysis(updated)).toEqual(analysis2);
    });
  });

  describe("addCameraFrame", () => {
    test("should add camera frame to session", () => {
      const frame: CameraFrame = {
        base64: "frame1data",
        timestamp: Date.now(),
      };

      const updated = addCameraFrame(session, frame);

      expect(updated.cameraFrames).toHaveLength(1);
      expect(updated.cameraFrames[0]).toEqual(frame);
    });

    test("should maintain max 5 frames (ring buffer)", () => {
      let updated = session;
      for (let i = 1; i <= 7; i++) {
        updated = addCameraFrame(updated, {
          base64: `frame${i}data`,
          timestamp: i * 1000,
        });
      }

      expect(updated.cameraFrames).toHaveLength(5);
      // Should have frames 3-7 (oldest 2 removed)
      expect(updated.cameraFrames[0]?.base64).toBe("frame3data");
      expect(updated.cameraFrames[4]?.base64).toBe("frame7data");
    });
  });

  describe("getCameraFrames", () => {
    test("should return empty array when no frames", () => {
      expect(getCameraFrames(session)).toEqual([]);
    });

    test("should return all camera frames", () => {
      let updated = session;
      updated = addCameraFrame(updated, { base64: "a", timestamp: 1 });
      updated = addCameraFrame(updated, { base64: "b", timestamp: 2 });

      const frames = getCameraFrames(updated);
      expect(frames).toHaveLength(2);
      expect(frames[0]?.base64).toBe("a");
      expect(frames[1]?.base64).toBe("b");
    });
  });

  describe("getLatestImage", () => {
    test("should return undefined when no images", () => {
      expect(getLatestImage(session)).toBeUndefined();
    });

    test("should return the most recent generated image", () => {
      const image1 = { base64: "img1", prompt: "p1", timestamp: 1 };
      const image2 = { base64: "img2", prompt: "p2", timestamp: 2 };

      let updated = addImage(session, image1);
      updated = addImage(updated, image2);

      const latest = getLatestImage(updated);
      expect(latest).toEqual(image2);
    });
  });
});
