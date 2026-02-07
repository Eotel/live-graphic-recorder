/**
 * Camera capture repository tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/capture.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createMeeting } from "./meeting";
import { createSession } from "./session";
import { createCameraCapture, findCameraCapturesBySessionId } from "./capture";

describe("CaptureRepository", () => {
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

  describe("createCameraCapture", () => {
    test("creates a capture record with all fields", () => {
      const db = getDatabase(testDbPath);
      const capture = createCameraCapture(db, {
        sessionId,
        filePath: "/data/media/captures/session-1/1234567890.jpg",
        timestamp: 1234567890,
      });

      expect(capture.id).toBeGreaterThan(0);
      expect(capture.sessionId).toBe(sessionId);
      expect(capture.filePath).toBe("/data/media/captures/session-1/1234567890.jpg");
      expect(capture.timestamp).toBe(1234567890);
    });
  });

  describe("findCameraCapturesBySessionId", () => {
    test("returns empty array when no captures", () => {
      const db = getDatabase(testDbPath);

      const captures = findCameraCapturesBySessionId(db, sessionId);

      expect(captures).toHaveLength(0);
    });

    test("returns all captures for session ordered by timestamp", () => {
      const db = getDatabase(testDbPath);
      createCameraCapture(db, {
        sessionId,
        filePath: "/3.jpg",
        timestamp: 300,
      });
      createCameraCapture(db, {
        sessionId,
        filePath: "/1.jpg",
        timestamp: 100,
      });
      createCameraCapture(db, {
        sessionId,
        filePath: "/2.jpg",
        timestamp: 200,
      });

      const captures = findCameraCapturesBySessionId(db, sessionId);

      expect(captures).toHaveLength(3);
      expect(captures[0]!.filePath).toBe("/1.jpg");
      expect(captures[1]!.filePath).toBe("/2.jpg");
      expect(captures[2]!.filePath).toBe("/3.jpg");
    });

    test("does not return captures from other sessions", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, {});
      const otherSession = createSession(db, { meetingId: meeting.id });

      createCameraCapture(db, {
        sessionId,
        filePath: "/this.jpg",
        timestamp: 100,
      });
      createCameraCapture(db, {
        sessionId: otherSession.id,
        filePath: "/other.jpg",
        timestamp: 100,
      });

      const captures = findCameraCapturesBySessionId(db, sessionId);

      expect(captures).toHaveLength(1);
      expect(captures[0]!.filePath).toBe("/this.jpg");
    });
  });

  describe("cascade delete", () => {
    test("deletes captures when session is deleted", () => {
      const db = getDatabase(testDbPath);
      createCameraCapture(db, {
        sessionId,
        filePath: "/test.jpg",
        timestamp: 100,
      });

      db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);

      const captures = findCameraCapturesBySessionId(db, sessionId);
      expect(captures).toHaveLength(0);
    });
  });
});
