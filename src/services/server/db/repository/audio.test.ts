/**
 * Audio recording repository tests.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/services/server/db/repository/audio.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createMeeting } from "./meeting";
import { createSession } from "./session";
import {
  createAudioRecording,
  findAudioRecordingByIdAndMeetingId,
  findAudioRecordingsBySessionId,
} from "./audio";

describe("AudioRecordingRepository", () => {
  const testDbPath = ":memory:";
  let meetingId: string;
  let sessionId: string;

  beforeEach(() => {
    closeDatabase();
    const db = getDatabase(testDbPath);
    runMigrations(db);
    const meeting = createMeeting(db, { title: "Test Meeting" });
    meetingId = meeting.id;
    const session = createSession(db, { meetingId });
    sessionId = session.id;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("createAudioRecording", () => {
    test("creates a recording with correct fields", () => {
      const db = getDatabase(testDbPath);
      const recording = createAudioRecording(db, {
        sessionId,
        meetingId,
        filePath: "audio/session-1/recording.webm",
        fileSizeBytes: 12345,
      });

      expect(recording.id).toBeDefined();
      expect(recording.sessionId).toBe(sessionId);
      expect(recording.meetingId).toBe(meetingId);
      expect(recording.filePath).toBe("audio/session-1/recording.webm");
      expect(recording.fileSizeBytes).toBe(12345);
      expect(recording.createdAt).toBeGreaterThan(0);
    });
  });

  describe("findAudioRecordingByIdAndMeetingId", () => {
    test("returns recording when found with matching meeting", () => {
      const db = getDatabase(testDbPath);
      const created = createAudioRecording(db, {
        sessionId,
        meetingId,
        filePath: "audio/test.webm",
        fileSizeBytes: 100,
      });

      const found = findAudioRecordingByIdAndMeetingId(db, created.id, meetingId);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.filePath).toBe("audio/test.webm");
    });

    test("returns null when meeting id does not match", () => {
      const db = getDatabase(testDbPath);
      const created = createAudioRecording(db, {
        sessionId,
        meetingId,
        filePath: "audio/test.webm",
        fileSizeBytes: 100,
      });

      const found = findAudioRecordingByIdAndMeetingId(db, created.id, "wrong-meeting-id");

      expect(found).toBeNull();
    });

    test("returns null when id does not exist", () => {
      const db = getDatabase(testDbPath);

      const found = findAudioRecordingByIdAndMeetingId(db, 9999, meetingId);

      expect(found).toBeNull();
    });
  });

  describe("findAudioRecordingsBySessionId", () => {
    test("returns empty array when no recordings exist", () => {
      const db = getDatabase(testDbPath);

      const recordings = findAudioRecordingsBySessionId(db, sessionId);

      expect(recordings).toHaveLength(0);
    });

    test("returns all recordings for a session", () => {
      const db = getDatabase(testDbPath);
      createAudioRecording(db, {
        sessionId,
        meetingId,
        filePath: "audio/1.webm",
        fileSizeBytes: 100,
      });
      createAudioRecording(db, {
        sessionId,
        meetingId,
        filePath: "audio/2.webm",
        fileSizeBytes: 200,
      });

      const recordings = findAudioRecordingsBySessionId(db, sessionId);

      expect(recordings).toHaveLength(2);
    });
  });

  describe("cascade delete", () => {
    test("deletes recordings when session is deleted", () => {
      const db = getDatabase(testDbPath);
      createAudioRecording(db, {
        sessionId,
        meetingId,
        filePath: "audio/test.webm",
        fileSizeBytes: 100,
      });

      db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);

      const recordings = findAudioRecordingsBySessionId(db, sessionId);
      expect(recordings).toHaveLength(0);
    });

    test("deletes recordings when meeting is deleted", () => {
      const db = getDatabase(testDbPath);
      createAudioRecording(db, {
        sessionId,
        meetingId,
        filePath: "audio/test.webm",
        fileSizeBytes: 100,
      });

      db.run("DELETE FROM meetings WHERE id = ?", [meetingId]);

      const recordings = findAudioRecordingsBySessionId(db, sessionId);
      expect(recordings).toHaveLength(0);
    });
  });
});
