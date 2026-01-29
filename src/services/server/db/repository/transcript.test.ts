/**
 * Transcript repository tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/transcript.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createMeeting } from "./meeting";
import { createSession } from "./session";
import {
  createTranscriptSegment,
  createTranscriptSegmentBatch,
  findTranscriptSegmentsBySessionId,
  type PersistedTranscriptSegment,
} from "./transcript";

describe("TranscriptRepository", () => {
  const testDbPath = ":memory:";
  let sessionId: string;

  beforeEach(() => {
    closeDatabase();
    const db = getDatabase(testDbPath);
    runMigrations(db);
    const meeting = createMeeting(db, {});
    const session = createSession(db, { meetingId: meeting.id });
    sessionId = session.id;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("createTranscriptSegment", () => {
    test("creates a transcript segment with required fields", () => {
      const db = getDatabase(testDbPath);
      const segment = createTranscriptSegment(db, {
        sessionId,
        text: "Hello world",
        timestamp: 1234567890,
        isFinal: true,
      });

      expect(segment.id).toBeGreaterThan(0);
      expect(segment.sessionId).toBe(sessionId);
      expect(segment.text).toBe("Hello world");
      expect(segment.timestamp).toBe(1234567890);
      expect(segment.isFinal).toBe(true);
    });

    test("creates a transcript segment with speaker", () => {
      const db = getDatabase(testDbPath);
      const segment = createTranscriptSegment(db, {
        sessionId,
        text: "Hello",
        timestamp: 123,
        isFinal: true,
        speaker: 1,
      });

      expect(segment.speaker).toBe(1);
    });

    test("creates a transcript segment with startTime", () => {
      const db = getDatabase(testDbPath);
      const segment = createTranscriptSegment(db, {
        sessionId,
        text: "Hello",
        timestamp: 123,
        isFinal: true,
        startTime: 45.67,
      });

      expect(segment.startTime).toBe(45.67);
    });

    test("creates a transcript segment with isUtteranceEnd", () => {
      const db = getDatabase(testDbPath);
      const segment = createTranscriptSegment(db, {
        sessionId,
        text: "Hello",
        timestamp: 123,
        isFinal: true,
        isUtteranceEnd: true,
      });

      expect(segment.isUtteranceEnd).toBe(true);
    });
  });

  describe("createTranscriptSegmentBatch", () => {
    test("creates multiple segments at once", () => {
      const db = getDatabase(testDbPath);
      const segments = createTranscriptSegmentBatch(db, [
        { sessionId, text: "First", timestamp: 100, isFinal: true },
        { sessionId, text: "Second", timestamp: 200, isFinal: false },
        { sessionId, text: "Third", timestamp: 300, isFinal: true },
      ]);

      expect(segments).toHaveLength(3);
      expect(segments[0]!.text).toBe("First");
      expect(segments[1]!.text).toBe("Second");
      expect(segments[2]!.text).toBe("Third");
    });

    test("returns empty array for empty input", () => {
      const db = getDatabase(testDbPath);
      const segments = createTranscriptSegmentBatch(db, []);

      expect(segments).toHaveLength(0);
    });
  });

  describe("findTranscriptSegmentsBySessionId", () => {
    test("returns empty array when no segments", () => {
      const db = getDatabase(testDbPath);

      const segments = findTranscriptSegmentsBySessionId(db, sessionId);

      expect(segments).toHaveLength(0);
    });

    test("returns all segments for session ordered by timestamp", () => {
      const db = getDatabase(testDbPath);
      createTranscriptSegment(db, {
        sessionId,
        text: "Third",
        timestamp: 300,
        isFinal: true,
      });
      createTranscriptSegment(db, {
        sessionId,
        text: "First",
        timestamp: 100,
        isFinal: true,
      });
      createTranscriptSegment(db, {
        sessionId,
        text: "Second",
        timestamp: 200,
        isFinal: true,
      });

      const segments = findTranscriptSegmentsBySessionId(db, sessionId);

      expect(segments).toHaveLength(3);
      expect(segments[0]!.text).toBe("First");
      expect(segments[1]!.text).toBe("Second");
      expect(segments[2]!.text).toBe("Third");
    });

    test("does not return segments from other sessions", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, {});
      const otherSession = createSession(db, { meetingId: meeting.id });

      createTranscriptSegment(db, {
        sessionId,
        text: "This session",
        timestamp: 100,
        isFinal: true,
      });
      createTranscriptSegment(db, {
        sessionId: otherSession.id,
        text: "Other session",
        timestamp: 100,
        isFinal: true,
      });

      const segments = findTranscriptSegmentsBySessionId(db, sessionId);

      expect(segments).toHaveLength(1);
      expect(segments[0]!.text).toBe("This session");
    });
  });

  describe("cascade delete", () => {
    test("deletes segments when session is deleted", () => {
      const db = getDatabase(testDbPath);
      createTranscriptSegment(db, {
        sessionId,
        text: "Test",
        timestamp: 100,
        isFinal: true,
      });

      db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);

      const segments = findTranscriptSegmentsBySessionId(db, sessionId);
      expect(segments).toHaveLength(0);
    });
  });
});
