/**
 * Persistence service tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/persistence.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PersistenceService } from "./persistence";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("PersistenceService", () => {
  const testDbPath = ":memory:";
  const testMediaPath = "/tmp/test-persistence-media";
  let service: PersistenceService;
  const createStream = (chunks: number[]): ReadableStream<Uint8Array> =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const size of chunks) {
          controller.enqueue(new Uint8Array(size));
        }
        controller.close();
      },
    });

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

    test("scopes meeting list by owner user id", () => {
      service.createMeeting("User 1 A", "user-1");
      service.createMeeting("User 1 B", "user-1");
      service.createMeeting("User 2 A", "user-2");

      const user1Meetings = service.listMeetings(undefined, "user-1");
      const user2Meetings = service.listMeetings(undefined, "user-2");

      expect(user1Meetings).toHaveLength(2);
      expect(user2Meetings).toHaveLength(1);
    });

    test("claims legacy meetings for first logged-in user", () => {
      service.createMeeting("Legacy 1");
      service.createMeeting("Legacy 2");
      service.createMeeting("Owned", "user-2");

      const claimed = service.claimLegacyMeetingsForUser("user-1");

      expect(claimed).toBe(2);
      expect(service.listMeetings(undefined, "user-1")).toHaveLength(2);
      expect(service.listMeetings(undefined, "user-2")).toHaveLength(1);
    });
  });

  describe("Speaker alias operations", () => {
    test("upserts and loads speaker aliases", () => {
      const meeting = service.createMeeting("Alias Meeting");

      const upserted = service.upsertSpeakerAlias(meeting.id, 0, "田中");
      expect(upserted).not.toBeNull();
      expect(upserted?.displayName).toBe("田中");

      const aliases = service.loadSpeakerAliases(meeting.id);
      expect(aliases).toHaveLength(1);
      expect(aliases[0]!.speaker).toBe(0);
      expect(aliases[0]!.displayName).toBe("田中");
    });

    test("updates existing speaker alias", () => {
      const meeting = service.createMeeting("Alias Meeting");

      const first = service.upsertSpeakerAlias(meeting.id, 1, "佐藤");
      const updated = service.upsertSpeakerAlias(meeting.id, 1, "鈴木");

      expect(first).not.toBeNull();
      expect(updated).not.toBeNull();
      expect(updated?.displayName).toBe("鈴木");
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(first!.updatedAt);
    });

    test("deletes speaker alias", () => {
      const meeting = service.createMeeting("Alias Meeting");
      service.upsertSpeakerAlias(meeting.id, 2, "削除対象");

      const deleted = service.deleteSpeakerAlias(meeting.id, 2);
      expect(deleted).toBe(true);
      expect(service.loadSpeakerAliases(meeting.id)).toHaveLength(0);
    });

    test("enforces owner scope on speaker alias operations", () => {
      const meeting = service.createMeeting("Owned Meeting", "user-1");

      const deniedUpsert = service.upsertSpeakerAlias(meeting.id, 0, "田中", "user-2");
      expect(deniedUpsert).toBeNull();
      expect(service.loadSpeakerAliases(meeting.id, "user-2")).toEqual([]);

      const allowedUpsert = service.upsertSpeakerAlias(meeting.id, 0, "田中", "user-1");
      expect(allowedUpsert).not.toBeNull();

      const deniedDelete = service.deleteSpeakerAlias(meeting.id, 0, "user-2");
      expect(deniedDelete).toBe(false);

      const aliasesForOwner = service.loadSpeakerAliases(meeting.id, "user-1");
      expect(aliasesForOwner).toHaveLength(1);
      expect(aliasesForOwner[0]!.displayName).toBe("田中");
    });
  });

  describe("User/Auth operations", () => {
    test("creates and fetches a user", () => {
      const user = service.createUser("alice@example.com", "hash-value");

      expect(service.getUserById(user.id)?.email).toBe("alice@example.com");
      expect(service.getUserByEmail("alice@example.com")?.id).toBe(user.id);
      expect(service.getUserByEmail("alice@example.com")?.role).toBe("user");
    });

    test("updates user role", () => {
      const user = service.createUser("staff@example.com", "hash-value");
      const updated = service.setUserRole(user.id, "staff");

      expect(updated).not.toBeNull();
      expect(updated?.role).toBe("staff");
      expect(service.getUserById(user.id)?.role).toBe("staff");
    });

    test("creates, finds, and revokes refresh token", () => {
      const user = service.createUser("alice@example.com", "hash-value");
      const token = service.createRefreshToken(user.id, "token-hash", Date.now() + 60_000);

      const active = service.getActiveRefreshTokenByHash("token-hash");
      expect(active?.id).toBe(token.id);

      service.revokeRefreshToken(token.id);

      const revoked = service.getActiveRefreshTokenByHash("token-hash");
      expect(revoked).toBeNull();
    });
  });

  describe("Admin session operations", () => {
    test("lists sessions across owners and loads detail summary", async () => {
      const owner = service.createUser("owner@example.com", "hash", "staff");
      const meeting = service.createMeeting("Admin Meeting", owner.id);
      const session = service.createSession(meeting.id, "admin-session-1");

      service.persistTranscript(session.id, {
        text: "hello",
        timestamp: 100,
        isFinal: true,
      });
      await service.persistAnalysisWithTimestamp(
        session.id,
        {
          summary: ["s"],
          topics: ["t"],
          tags: [],
          flow: 50,
          heat: 50,
          imagePrompt: "prompt",
        },
        200,
      );

      const list = service.listAdminSessions({
        limit: 50,
        offset: 0,
      });

      expect(list.total).toBeGreaterThan(0);
      const item = list.items.find((entry) => entry.sessionId === session.id);
      expect(item).toBeDefined();
      expect(item?.ownerEmail).toBe("owner@example.com");

      const detail = service.getAdminSessionDetail(session.id);
      expect(detail).not.toBeNull();
      expect(detail?.counts.transcriptSegments).toBe(1);
      expect(detail?.counts.analyses).toBe(1);
    });
  });

  describe("Session operations", () => {
    let meetingId: string;
    let meetingId2: string;

    beforeEach(() => {
      const meeting = service.createMeeting("Test Meeting");
      meetingId = meeting.id;
      meetingId2 = service.createMeeting("Other Meeting").id;
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

    test("gets session by id with meeting ownership validation", () => {
      service.createSession(meetingId, "session-1");

      const ok = service.getSessionByIdAndMeetingId("session-1", meetingId);
      expect(ok?.id).toBe("session-1");

      const wrongMeeting = service.getSessionByIdAndMeetingId("session-1", meetingId2);
      expect(wrongMeeting).toBeNull();

      const missing = service.getSessionByIdAndMeetingId("missing", meetingId);
      expect(missing).toBeNull();
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

  describe("Audio recording persistence", () => {
    let meetingId: string;
    let sessionId: string;

    beforeEach(() => {
      const meeting = service.createMeeting();
      meetingId = meeting.id;
      sessionId = "audio-session";
      service.createSession(meetingId, sessionId);
    });

    test("persists streamed audio and stores accurate file size", async () => {
      const recording = await service.persistAudioRecordingFromStream(
        sessionId,
        meetingId,
        createStream([64, 128, 256]),
        1024,
      );

      expect(recording.sessionId).toBe(sessionId);
      expect(recording.meetingId).toBe(meetingId);
      expect(recording.fileSizeBytes).toBe(448);
      expect(existsSync(recording.filePath)).toBe(true);
    });

    test("rejects oversized streamed audio and leaves no partial files", async () => {
      const audioDir = join(testMediaPath, "audio", sessionId);

      await expect(
        service.persistAudioRecordingFromStream(
          sessionId,
          meetingId,
          createStream([700, 700]),
          1024,
        ),
      ).rejects.toThrow("File too large");

      if (existsSync(audioDir)) {
        expect(readdirSync(audioDir)).toHaveLength(0);
      }
    });

    test("rejects empty streamed audio", async () => {
      await expect(
        service.persistAudioRecordingFromStream(sessionId, meetingId, createStream([]), 1024),
      ).rejects.toThrow("Empty body");
    });

    test("lists meeting audio recordings in newest-first order", async () => {
      const sessionId2 = "audio-session-2";
      service.createSession(meetingId, sessionId2);

      const first = await service.persistAudioRecordingFromStream(
        sessionId,
        meetingId,
        createStream([64]),
        1024,
      );
      const second = await service.persistAudioRecordingFromStream(
        sessionId2,
        meetingId,
        createStream([128]),
        1024,
      );

      const recordings = service.listAudioRecordingsByMeeting(meetingId);

      expect(recordings.map((recording) => recording.id)).toEqual([second.id, first.id]);
      expect(recordings[0]!.meetingId).toBe(meetingId);
      expect(recordings[1]!.meetingId).toBe(meetingId);
    });

    test("returns empty list for non-owner when listing meeting audio recordings", async () => {
      const ownedMeeting = service.createMeeting("Owned Meeting", "owner-user");
      const ownedSessionId = "owned-audio-session";
      service.createSession(ownedMeeting.id, ownedSessionId);
      await service.persistAudioRecordingFromStream(
        ownedSessionId,
        ownedMeeting.id,
        createStream([64]),
        1024,
      );

      const denied = service.listAudioRecordingsByMeeting(ownedMeeting.id, "other-user");
      const allowed = service.listAudioRecordingsByMeeting(ownedMeeting.id, "owner-user");

      expect(denied).toEqual([]);
      expect(allowed).toHaveLength(1);
      expect(allowed[0]!.meetingId).toBe(ownedMeeting.id);
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
