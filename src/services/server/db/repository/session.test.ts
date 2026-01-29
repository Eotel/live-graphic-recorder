/**
 * Session repository tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/session.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createMeeting } from "./meeting";
import {
  createSession,
  findSessionById,
  findSessionsByMeetingId,
  updateSession,
  type PersistedSession,
} from "./session";

describe("SessionRepository", () => {
  const testDbPath = ":memory:";
  let meetingId: string;

  beforeEach(() => {
    closeDatabase();
    const db = getDatabase(testDbPath);
    runMigrations(db);
    const meeting = createMeeting(db, { title: "Test Meeting" });
    meetingId = meeting.id;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("createSession", () => {
    test("creates a session with generated id", () => {
      const db = getDatabase(testDbPath);
      const session = createSession(db, { meetingId });

      expect(session.id).toBeDefined();
      expect(session.id.length).toBeGreaterThan(0);
      expect(session.meetingId).toBe(meetingId);
      expect(session.status).toBe("idle");
      expect(session.startedAt).toBeNull();
      expect(session.endedAt).toBeNull();
    });

    test("creates a session with provided id", () => {
      const db = getDatabase(testDbPath);
      const session = createSession(db, { meetingId, id: "custom-session-id" });

      expect(session.id).toBe("custom-session-id");
    });
  });

  describe("findSessionById", () => {
    test("returns session when found", () => {
      const db = getDatabase(testDbPath);
      const created = createSession(db, { meetingId });

      const found = findSessionById(db, created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.meetingId).toBe(meetingId);
    });

    test("returns null when not found", () => {
      const db = getDatabase(testDbPath);

      const found = findSessionById(db, "non-existent-id");

      expect(found).toBeNull();
    });
  });

  describe("findSessionsByMeetingId", () => {
    test("returns empty array when no sessions", () => {
      const db = getDatabase(testDbPath);

      const sessions = findSessionsByMeetingId(db, meetingId);

      expect(sessions).toHaveLength(0);
    });

    test("returns all sessions for meeting", () => {
      const db = getDatabase(testDbPath);
      createSession(db, { meetingId });
      createSession(db, { meetingId });
      createSession(db, { meetingId });

      const sessions = findSessionsByMeetingId(db, meetingId);

      expect(sessions).toHaveLength(3);
      sessions.forEach((s) => expect(s.meetingId).toBe(meetingId));
    });

    test("does not return sessions from other meetings", () => {
      const db = getDatabase(testDbPath);
      const otherMeeting = createMeeting(db, { title: "Other" });
      createSession(db, { meetingId });
      createSession(db, { meetingId: otherMeeting.id });

      const sessions = findSessionsByMeetingId(db, meetingId);

      expect(sessions).toHaveLength(1);
    });
  });

  describe("updateSession", () => {
    test("updates status", () => {
      const db = getDatabase(testDbPath);
      const session = createSession(db, { meetingId });

      const updated = updateSession(db, session.id, { status: "recording" });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe("recording");
    });

    test("updates startedAt", () => {
      const db = getDatabase(testDbPath);
      const session = createSession(db, { meetingId });
      const startTime = Date.now();

      const updated = updateSession(db, session.id, { startedAt: startTime });

      expect(updated).not.toBeNull();
      expect(updated?.startedAt).toBe(startTime);
    });

    test("updates endedAt", () => {
      const db = getDatabase(testDbPath);
      const session = createSession(db, { meetingId });
      const endTime = Date.now();

      const updated = updateSession(db, session.id, { endedAt: endTime });

      expect(updated).not.toBeNull();
      expect(updated?.endedAt).toBe(endTime);
    });

    test("returns null when session not found", () => {
      const db = getDatabase(testDbPath);

      const updated = updateSession(db, "non-existent", { status: "recording" });

      expect(updated).toBeNull();
    });
  });

  describe("cascade delete", () => {
    test("deletes sessions when meeting is deleted", () => {
      const db = getDatabase(testDbPath);
      const session = createSession(db, { meetingId });

      db.run("DELETE FROM meetings WHERE id = ?", [meetingId]);

      const found = findSessionById(db, session.id);
      expect(found).toBeNull();
    });
  });
});
