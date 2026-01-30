/**
 * Persistence service tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/persistence.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PersistenceService } from "./persistence";
import { existsSync, rmSync } from "node:fs";

describe("PersistenceService", () => {
  const testDbPath = ":memory:";
  const testMediaPath = "/tmp/test-persistence-media";
  let service: PersistenceService;

  beforeEach(() => {
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
    service = new PersistenceService(testDbPath, testMediaPath);
  });

  afterEach(() => {
    service.close();
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
  });

  describe("Meeting operations", () => {
    test("creates a meeting", () => {
      const meeting = service.createMeeting("My Meeting");

      expect(meeting.id).toBeDefined();
      expect(meeting.title).toBe("My Meeting");
      expect(meeting.startedAt).toBeGreaterThan(0);
      expect(meeting.endedAt).toBeNull();
    });

    test("creates a meeting without title", () => {
      const meeting = service.createMeeting();

      expect(meeting.id).toBeDefined();
      expect(meeting.title).toBeNull();
    });

    test("gets a meeting by id", () => {
      const created = service.createMeeting("Test");

      const found = service.getMeeting(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    test("returns null for non-existent meeting", () => {
      const found = service.getMeeting("non-existent");

      expect(found).toBeNull();
    });

    test("lists meetings", () => {
      service.createMeeting("One");
      service.createMeeting("Two");
      service.createMeeting("Three");

      const meetings = service.listMeetings();

      expect(meetings).toHaveLength(3);
    });

    test("limits meeting list", () => {
      service.createMeeting("One");
      service.createMeeting("Two");
      service.createMeeting("Three");

      const meetings = service.listMeetings(2);

      expect(meetings).toHaveLength(2);
    });

    test("ends a meeting", () => {
      const meeting = service.createMeeting("Test");
      expect(meeting.endedAt).toBeNull();

      service.endMeeting(meeting.id);

      const ended = service.getMeeting(meeting.id);
      expect(ended?.endedAt).toBeGreaterThan(0);
    });
  });

  describe("Session operations", () => {
    let meetingId: string;

    beforeEach(() => {
      const meeting = service.createMeeting("Test Meeting");
      meetingId = meeting.id;
    });

    test("creates a session", () => {
      const session = service.createSession(meetingId, "session-1");

      expect(session.id).toBe("session-1");
      expect(session.meetingId).toBe(meetingId);
      expect(session.status).toBe("idle");
    });

    test("starts a session", () => {
      service.createSession(meetingId, "session-1");

      service.startSession("session-1");

      const session = service.getSession("session-1");
      expect(session?.status).toBe("recording");
      expect(session?.startedAt).toBeGreaterThan(0);
    });

    test("stops a session", () => {
      service.createSession(meetingId, "session-1");
      service.startSession("session-1");

      service.stopSession("session-1");

      const session = service.getSession("session-1");
      expect(session?.status).toBe("idle");
      expect(session?.endedAt).toBeGreaterThan(0);
    });

    test("gets sessions by meeting", () => {
      service.createSession(meetingId, "session-1");
      service.createSession(meetingId, "session-2");

      const sessions = service.getSessionsByMeeting(meetingId);

      expect(sessions).toHaveLength(2);
    });
  });

  describe("Transcript persistence", () => {
    let sessionId: string;

    beforeEach(() => {
      const meeting = service.createMeeting();
      service.createSession(meeting.id, "test-session");
      sessionId = "test-session";
    });

    test("persists a transcript segment", () => {
      service.persistTranscript(sessionId, {
        text: "Hello world",
        timestamp: 1234567890,
        isFinal: true,
      });

      const transcripts = service.loadTranscripts(sessionId);

      expect(transcripts).toHaveLength(1);
      expect(transcripts[0]!.text).toBe("Hello world");
      expect(transcripts[0]!.isFinal).toBe(true);
    });

    test("persists multiple segments", () => {
      service.persistTranscript(sessionId, {
        text: "First",
        timestamp: 100,
        isFinal: true,
      });
      service.persistTranscript(sessionId, {
        text: "Second",
        timestamp: 200,
        isFinal: true,
        speaker: 1,
      });

      const transcripts = service.loadTranscripts(sessionId);

      expect(transcripts).toHaveLength(2);
      expect(transcripts[0]!.text).toBe("First");
      expect(transcripts[1]!.text).toBe("Second");
      expect(transcripts[1]!.speaker).toBe(1);
    });

    test("marks utterance end on last segment", () => {
      service.persistTranscript(sessionId, {
        text: "First segment",
        timestamp: 100,
        isFinal: true,
      });
      service.persistTranscript(sessionId, {
        text: "Second segment",
        timestamp: 200,
        isFinal: true,
      });

      const marked = service.markUtteranceEnd(sessionId);
      expect(marked).toBe(true);

      const transcripts = service.loadTranscripts(sessionId);
      expect(transcripts[0]!.isUtteranceEnd).toBe(false);
      expect(transcripts[1]!.isUtteranceEnd).toBe(true);
    });

    test("does nothing when marking utterance end with no segments", () => {
      const marked = service.markUtteranceEnd(sessionId);
      expect(marked).toBe(false);

      const transcripts = service.loadTranscripts(sessionId);
      expect(transcripts).toHaveLength(0);
    });

    test("marks utterance end on last final segment (ignores interim)", () => {
      service.persistTranscript(sessionId, {
        text: "Final segment",
        timestamp: 100,
        isFinal: true,
      });
      service.persistTranscript(sessionId, {
        text: "Interim segment",
        timestamp: 200,
        isFinal: false,
      });

      const marked = service.markUtteranceEnd(sessionId);
      expect(marked).toBe(true);

      const transcripts = service.loadTranscripts(sessionId);
      expect(transcripts[0]!.isUtteranceEnd).toBe(true);
      expect(transcripts[1]!.isUtteranceEnd).toBe(false);
    });

    test("throws for invalid session id on utterance end", () => {
      expect(() => service.markUtteranceEnd("../bad")).toThrow();
    });
  });

  describe("Analysis persistence", () => {
    let sessionId: string;

    beforeEach(() => {
      const meeting = service.createMeeting();
      service.createSession(meeting.id, "test-session");
      sessionId = "test-session";
    });

    test("persists an analysis", async () => {
      await service.persistAnalysis(sessionId, {
        summary: ["Point 1", "Point 2"],
        topics: ["AI", "ML"],
        tags: ["tech"],
        flow: 75,
        heat: 80,
        imagePrompt: "A tech scene",
      });

      const analyses = service.loadAnalyses(sessionId);

      expect(analyses).toHaveLength(1);
      expect(analyses[0]!.summary).toEqual(["Point 1", "Point 2"]);
      expect(analyses[0]!.topics).toEqual(["AI", "ML"]);
      expect(analyses[0]!.flow).toBe(75);
      expect(analyses[0]!.heat).toBe(80);
    });

    test("gets latest analysis", async () => {
      await service.persistAnalysisWithTimestamp(
        sessionId,
        {
          summary: ["First"],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: "1",
        },
        100,
      );
      await service.persistAnalysisWithTimestamp(
        sessionId,
        {
          summary: ["Latest"],
          topics: ["hot"],
          tags: [],
          flow: 90,
          heat: 95,
          imagePrompt: "2",
        },
        200,
      );

      const latest = service.getLatestAnalysis(sessionId);

      expect(latest?.summary).toEqual(["Latest"]);
      expect(latest?.flow).toBe(90);
    });
  });

  describe("Image persistence", () => {
    let sessionId: string;

    beforeEach(() => {
      const meeting = service.createMeeting();
      service.createSession(meeting.id, "test-session");
      sessionId = "test-session";
    });

    test("persists an image", async () => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await service.persistImage(sessionId, {
        base64,
        prompt: "A sunset",
        timestamp: 1234567890,
      });

      const images = service.loadImages(sessionId);

      expect(images).toHaveLength(1);
      expect(images[0]!.prompt).toBe("A sunset");
      expect(images[0]!.timestamp).toBe(1234567890);
      expect(images[0]!.filePath).toBeDefined();
    });

    test("loads image with base64", async () => {
      const originalBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await service.persistImage(sessionId, {
        base64: originalBase64,
        prompt: "Test",
        timestamp: 123,
      });

      const images = service.loadImages(sessionId);
      const loadedBase64 = await service.loadImageBase64(images[0]!.filePath);

      expect(loadedBase64).toBe(originalBase64);
    });
  });

  describe("Camera frame persistence", () => {
    let sessionId: string;

    beforeEach(() => {
      const meeting = service.createMeeting();
      service.createSession(meeting.id, "test-session");
      sessionId = "test-session";
    });

    test("persists a camera frame", async () => {
      const base64 =
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB/AA==";

      await service.persistCameraFrame(sessionId, {
        base64,
        timestamp: 1234567890,
      });

      const captures = service.loadCaptures(sessionId);

      expect(captures).toHaveLength(1);
      expect(captures[0]!.timestamp).toBe(1234567890);
      expect(captures[0]!.filePath).toBeDefined();
    });
  });

  describe("Meeting transcript aggregation", () => {
    test("loads transcript across all sessions in meeting", () => {
      const meeting = service.createMeeting();
      service.createSession(meeting.id, "session-1");
      service.createSession(meeting.id, "session-2");

      service.persistTranscript("session-1", {
        text: "First session",
        timestamp: 100,
        isFinal: true,
      });
      service.persistTranscript("session-2", {
        text: "Second session",
        timestamp: 200,
        isFinal: true,
      });

      const transcripts = service.loadMeetingTranscript(meeting.id);

      expect(transcripts).toHaveLength(2);
      const texts = transcripts.map((t) => t.text);
      expect(texts).toContain("First session");
      expect(texts).toContain("Second session");
    });
  });

  describe("Meta-summary operations", () => {
    let meetingId: string;

    beforeEach(() => {
      const meeting = service.createMeeting("Test Meeting");
      meetingId = meeting.id;
    });

    test("persists a meta-summary", () => {
      service.persistMetaSummary(meetingId, {
        startTime: 1000,
        endTime: 2000,
        summary: ["Point 1", "Point 2"],
        themes: ["Theme A", "Theme B"],
        representativeImageId: "image-123",
      });

      const metaSummaries = service.loadMetaSummaries(meetingId);

      expect(metaSummaries).toHaveLength(1);
      expect(metaSummaries[0]!.summary).toEqual(["Point 1", "Point 2"]);
      expect(metaSummaries[0]!.themes).toEqual(["Theme A", "Theme B"]);
      expect(metaSummaries[0]!.representativeImageId).toBe("image-123");
    });

    test("gets latest meta-summary", () => {
      service.persistMetaSummary(meetingId, {
        startTime: 1000,
        endTime: 2000,
        summary: ["First"],
        themes: [],
        representativeImageId: null,
      });
      service.persistMetaSummary(meetingId, {
        startTime: 2000,
        endTime: 3000,
        summary: ["Latest"],
        themes: ["Latest theme"],
        representativeImageId: "latest-image",
      });

      const latest = service.getLatestMetaSummary(meetingId);

      expect(latest?.summary).toEqual(["Latest"]);
      expect(latest?.endTime).toBe(3000);
    });

    test("returns null when no meta-summaries", () => {
      const latest = service.getLatestMetaSummary(meetingId);

      expect(latest).toBeNull();
    });
  });

  describe("Meeting-level data aggregation", () => {
    let meetingId: string;

    beforeEach(() => {
      const meeting = service.createMeeting("Test Meeting");
      meetingId = meeting.id;
      service.createSession(meetingId, "session-1");
      service.createSession(meetingId, "session-2");
    });

    test("loads analyses across all sessions in meeting", async () => {
      await service.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: ["Session 1 analysis"],
          topics: ["Topic A"],
          tags: [],
          flow: 50,
          heat: 60,
          imagePrompt: "prompt 1",
        },
        100,
      );
      await service.persistAnalysisWithTimestamp(
        "session-2",
        {
          summary: ["Session 2 analysis"],
          topics: ["Topic B"],
          tags: [],
          flow: 70,
          heat: 80,
          imagePrompt: "prompt 2",
        },
        200,
      );

      const analyses = service.loadMeetingAnalyses(meetingId);

      expect(analyses).toHaveLength(2);
      const summaries = analyses.flatMap((a) => a.summary);
      expect(summaries).toContain("Session 1 analysis");
      expect(summaries).toContain("Session 2 analysis");
    });

    test("loads analyses ordered by timestamp", async () => {
      await service.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: ["First"],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: "1",
        },
        100,
      );
      await service.persistAnalysisWithTimestamp(
        "session-2",
        {
          summary: ["Third"],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: "3",
        },
        300,
      );
      await service.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: ["Second"],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: "2",
        },
        200,
      );

      const analyses = service.loadMeetingAnalyses(meetingId);

      expect(analyses).toHaveLength(3);
      expect(analyses[0]!.summary).toEqual(["First"]);
      expect(analyses[1]!.summary).toEqual(["Second"]);
      expect(analyses[2]!.summary).toEqual(["Third"]);
    });

    test("loads images across all sessions in meeting", async () => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await service.persistImage("session-1", {
        base64,
        prompt: "Image 1",
        timestamp: 100,
      });
      await service.persistImage("session-2", {
        base64,
        prompt: "Image 2",
        timestamp: 200,
      });

      const images = service.loadMeetingImages(meetingId);

      expect(images).toHaveLength(2);
      const prompts = images.map((i) => i.prompt);
      expect(prompts).toContain("Image 1");
      expect(prompts).toContain("Image 2");
    });

    test("loads recent analyses with limit", async () => {
      await service.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: ["First"],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: "1",
        },
        100,
      );
      await service.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: ["Second"],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: "2",
        },
        200,
      );
      await service.persistAnalysisWithTimestamp(
        "session-1",
        {
          summary: ["Third"],
          topics: [],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: "3",
        },
        300,
      );

      const recentAnalyses = service.loadRecentMeetingAnalyses(meetingId, 2);

      expect(recentAnalyses).toHaveLength(2);
      // Should return the most recent ones
      expect(recentAnalyses[0]!.summary).toEqual(["Second"]);
      expect(recentAnalyses[1]!.summary).toEqual(["Third"]);
    });

    test("loads recent images with limit", async () => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await service.persistImage("session-1", {
        base64,
        prompt: "Image 1",
        timestamp: 100,
      });
      await service.persistImage("session-1", {
        base64,
        prompt: "Image 2",
        timestamp: 200,
      });
      await service.persistImage("session-1", {
        base64,
        prompt: "Image 3",
        timestamp: 300,
      });

      const recentImages = service.loadRecentMeetingImages(meetingId, 2);

      expect(recentImages).toHaveLength(2);
      // Should return the most recent ones
      expect(recentImages[0]!.prompt).toBe("Image 2");
      expect(recentImages[1]!.prompt).toBe("Image 3");
    });
  });
});
