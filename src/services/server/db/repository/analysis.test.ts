/**
 * Analysis repository tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/analysis.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createMeeting } from "./meeting";
import { createSession } from "./session";
import {
  createAnalysis,
  findAnalysesBySessionId,
  findLatestAnalysisBySessionId,
  type PersistedAnalysis,
} from "./analysis";

describe("AnalysisRepository", () => {
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

  describe("createAnalysis", () => {
    test("creates an analysis with all fields", () => {
      const db = getDatabase(testDbPath);
      const analysis = createAnalysis(db, {
        sessionId,
        summary: ["Point 1", "Point 2"],
        topics: ["AI", "Machine Learning"],
        tags: ["tech", "innovation"],
        flow: 75,
        heat: 80,
        imagePrompt: "A futuristic scene",
        timestamp: 1234567890,
      });

      expect(analysis.id).toBeGreaterThan(0);
      expect(analysis.sessionId).toBe(sessionId);
      expect(analysis.summary).toEqual(["Point 1", "Point 2"]);
      expect(analysis.topics).toEqual(["AI", "Machine Learning"]);
      expect(analysis.tags).toEqual(["tech", "innovation"]);
      expect(analysis.flow).toBe(75);
      expect(analysis.heat).toBe(80);
      expect(analysis.imagePrompt).toBe("A futuristic scene");
      expect(analysis.timestamp).toBe(1234567890);
    });

    test("handles empty arrays", () => {
      const db = getDatabase(testDbPath);
      const analysis = createAnalysis(db, {
        sessionId,
        summary: [],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "test",
        timestamp: 123,
      });

      expect(analysis.summary).toEqual([]);
      expect(analysis.topics).toEqual([]);
      expect(analysis.tags).toEqual([]);
    });
  });

  describe("findAnalysesBySessionId", () => {
    test("returns empty array when no analyses", () => {
      const db = getDatabase(testDbPath);

      const analyses = findAnalysesBySessionId(db, sessionId);

      expect(analyses).toHaveLength(0);
    });

    test("returns all analyses for session ordered by timestamp", () => {
      const db = getDatabase(testDbPath);
      createAnalysis(db, {
        sessionId,
        summary: ["Third"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "3",
        timestamp: 300,
      });
      createAnalysis(db, {
        sessionId,
        summary: ["First"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "1",
        timestamp: 100,
      });
      createAnalysis(db, {
        sessionId,
        summary: ["Second"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "2",
        timestamp: 200,
      });

      const analyses = findAnalysesBySessionId(db, sessionId);

      expect(analyses).toHaveLength(3);
      expect(analyses[0]!.summary).toEqual(["First"]);
      expect(analyses[1]!.summary).toEqual(["Second"]);
      expect(analyses[2]!.summary).toEqual(["Third"]);
    });
  });

  describe("findLatestAnalysisBySessionId", () => {
    test("returns null when no analyses", () => {
      const db = getDatabase(testDbPath);

      const analysis = findLatestAnalysisBySessionId(db, sessionId);

      expect(analysis).toBeNull();
    });

    test("returns most recent analysis", () => {
      const db = getDatabase(testDbPath);
      createAnalysis(db, {
        sessionId,
        summary: ["First"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "1",
        timestamp: 100,
      });
      createAnalysis(db, {
        sessionId,
        summary: ["Latest"],
        topics: ["hot topic"],
        tags: [],
        flow: 90,
        heat: 95,
        imagePrompt: "latest",
        timestamp: 300,
      });
      createAnalysis(db, {
        sessionId,
        summary: ["Middle"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "2",
        timestamp: 200,
      });

      const analysis = findLatestAnalysisBySessionId(db, sessionId);

      expect(analysis).not.toBeNull();
      expect(analysis?.summary).toEqual(["Latest"]);
      expect(analysis?.timestamp).toBe(300);
    });
  });

  describe("cascade delete", () => {
    test("deletes analyses when session is deleted", () => {
      const db = getDatabase(testDbPath);
      createAnalysis(db, {
        sessionId,
        summary: ["Test"],
        topics: [],
        tags: [],
        flow: 50,
        heat: 50,
        imagePrompt: "test",
        timestamp: 100,
      });

      db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);

      const analyses = findAnalysesBySessionId(db, sessionId);
      expect(analyses).toHaveLength(0);
    });
  });
});
