/**
 * Image repository tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/image.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createMeeting } from "./meeting";
import { createSession } from "./session";
import {
  createGeneratedImage,
  findGeneratedImagesBySessionId,
  findLatestGeneratedImageBySessionId,
  type PersistedGeneratedImage,
} from "./image";

describe("ImageRepository", () => {
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

  describe("createGeneratedImage", () => {
    test("creates an image record with all fields", () => {
      const db = getDatabase(testDbPath);
      const image = createGeneratedImage(db, {
        sessionId,
        filePath: "/data/media/images/session-1/1234567890.png",
        prompt: "A beautiful sunset",
        timestamp: 1234567890,
      });

      expect(image.id).toBeGreaterThan(0);
      expect(image.sessionId).toBe(sessionId);
      expect(image.filePath).toBe("/data/media/images/session-1/1234567890.png");
      expect(image.prompt).toBe("A beautiful sunset");
      expect(image.timestamp).toBe(1234567890);
    });
  });

  describe("findGeneratedImagesBySessionId", () => {
    test("returns empty array when no images", () => {
      const db = getDatabase(testDbPath);

      const images = findGeneratedImagesBySessionId(db, sessionId);

      expect(images).toHaveLength(0);
    });

    test("returns all images for session ordered by timestamp", () => {
      const db = getDatabase(testDbPath);
      createGeneratedImage(db, {
        sessionId,
        filePath: "/3.png",
        prompt: "Third",
        timestamp: 300,
      });
      createGeneratedImage(db, {
        sessionId,
        filePath: "/1.png",
        prompt: "First",
        timestamp: 100,
      });
      createGeneratedImage(db, {
        sessionId,
        filePath: "/2.png",
        prompt: "Second",
        timestamp: 200,
      });

      const images = findGeneratedImagesBySessionId(db, sessionId);

      expect(images).toHaveLength(3);
      expect(images[0]!.prompt).toBe("First");
      expect(images[1]!.prompt).toBe("Second");
      expect(images[2]!.prompt).toBe("Third");
    });
  });

  describe("findLatestGeneratedImageBySessionId", () => {
    test("returns null when no images", () => {
      const db = getDatabase(testDbPath);

      const image = findLatestGeneratedImageBySessionId(db, sessionId);

      expect(image).toBeNull();
    });

    test("returns most recent image", () => {
      const db = getDatabase(testDbPath);
      createGeneratedImage(db, {
        sessionId,
        filePath: "/1.png",
        prompt: "First",
        timestamp: 100,
      });
      createGeneratedImage(db, {
        sessionId,
        filePath: "/latest.png",
        prompt: "Latest",
        timestamp: 300,
      });
      createGeneratedImage(db, {
        sessionId,
        filePath: "/2.png",
        prompt: "Middle",
        timestamp: 200,
      });

      const image = findLatestGeneratedImageBySessionId(db, sessionId);

      expect(image).not.toBeNull();
      expect(image?.prompt).toBe("Latest");
      expect(image?.filePath).toBe("/latest.png");
    });
  });

  describe("cascade delete", () => {
    test("deletes images when session is deleted", () => {
      const db = getDatabase(testDbPath);
      createGeneratedImage(db, {
        sessionId,
        filePath: "/test.png",
        prompt: "Test",
        timestamp: 100,
      });

      db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);

      const images = findGeneratedImagesBySessionId(db, sessionId);
      expect(images).toHaveLength(0);
    });
  });
});
