/**
 * Meta-summary repository tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/meta-summary.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createMeeting } from "./meeting";
import {
  createMetaSummary,
  findMetaSummariesByMeetingId,
  findLatestMetaSummaryByMeetingId,
} from "./meta-summary";

describe("MetaSummaryRepository", () => {
  const testDbPath = ":memory:";
  let meetingId: string;

  beforeEach(() => {
    closeDatabase();
    const db = getDatabase(testDbPath);
    runMigrations(db);
    const meeting = createMeeting(db, {});
    meetingId = meeting.id;
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("createMetaSummary", () => {
    test("creates a meta-summary with all fields", () => {
      const db = getDatabase(testDbPath);
      const metaSummary = createMetaSummary(db, {
        meetingId,
        startTime: 1000,
        endTime: 2000,
        summary: ["Summary point 1", "Summary point 2"],
        themes: ["Theme A", "Theme B"],
        representativeImageId: "image-123",
      });

      expect(metaSummary.id).toBeDefined();
      expect(metaSummary.id.length).toBeGreaterThan(0);
      expect(metaSummary.meetingId).toBe(meetingId);
      expect(metaSummary.startTime).toBe(1000);
      expect(metaSummary.endTime).toBe(2000);
      expect(metaSummary.summary).toEqual(["Summary point 1", "Summary point 2"]);
      expect(metaSummary.themes).toEqual(["Theme A", "Theme B"]);
      expect(metaSummary.representativeImageId).toBe("image-123");
      expect(metaSummary.createdAt).toBeGreaterThan(0);
    });

    test("handles null representativeImageId", () => {
      const db = getDatabase(testDbPath);
      const metaSummary = createMetaSummary(db, {
        meetingId,
        startTime: 1000,
        endTime: 2000,
        summary: ["Point"],
        themes: ["Theme"],
        representativeImageId: null,
      });

      expect(metaSummary.representativeImageId).toBeNull();
    });

    test("handles empty arrays", () => {
      const db = getDatabase(testDbPath);
      const metaSummary = createMetaSummary(db, {
        meetingId,
        startTime: 1000,
        endTime: 2000,
        summary: [],
        themes: [],
        representativeImageId: null,
      });

      expect(metaSummary.summary).toEqual([]);
      expect(metaSummary.themes).toEqual([]);
    });
  });

  describe("findMetaSummariesByMeetingId", () => {
    test("returns empty array when no meta-summaries", () => {
      const db = getDatabase(testDbPath);

      const metaSummaries = findMetaSummariesByMeetingId(db, meetingId);

      expect(metaSummaries).toHaveLength(0);
    });

    test("returns all meta-summaries for meeting ordered by start_time", () => {
      const db = getDatabase(testDbPath);
      createMetaSummary(db, {
        meetingId,
        startTime: 3000,
        endTime: 4000,
        summary: ["Third"],
        themes: [],
        representativeImageId: null,
      });
      createMetaSummary(db, {
        meetingId,
        startTime: 1000,
        endTime: 2000,
        summary: ["First"],
        themes: [],
        representativeImageId: null,
      });
      createMetaSummary(db, {
        meetingId,
        startTime: 2000,
        endTime: 3000,
        summary: ["Second"],
        themes: [],
        representativeImageId: null,
      });

      const metaSummaries = findMetaSummariesByMeetingId(db, meetingId);

      expect(metaSummaries).toHaveLength(3);
      expect(metaSummaries[0]!.summary).toEqual(["First"]);
      expect(metaSummaries[1]!.summary).toEqual(["Second"]);
      expect(metaSummaries[2]!.summary).toEqual(["Third"]);
    });

    test("does not return meta-summaries from other meetings", () => {
      const db = getDatabase(testDbPath);
      const otherMeeting = createMeeting(db, {});

      createMetaSummary(db, {
        meetingId,
        startTime: 1000,
        endTime: 2000,
        summary: ["This meeting"],
        themes: [],
        representativeImageId: null,
      });
      createMetaSummary(db, {
        meetingId: otherMeeting.id,
        startTime: 1000,
        endTime: 2000,
        summary: ["Other meeting"],
        themes: [],
        representativeImageId: null,
      });

      const metaSummaries = findMetaSummariesByMeetingId(db, meetingId);

      expect(metaSummaries).toHaveLength(1);
      expect(metaSummaries[0]!.summary).toEqual(["This meeting"]);
    });
  });

  describe("findLatestMetaSummaryByMeetingId", () => {
    test("returns null when no meta-summaries", () => {
      const db = getDatabase(testDbPath);

      const metaSummary = findLatestMetaSummaryByMeetingId(db, meetingId);

      expect(metaSummary).toBeNull();
    });

    test("returns most recent meta-summary by end_time", () => {
      const db = getDatabase(testDbPath);
      createMetaSummary(db, {
        meetingId,
        startTime: 1000,
        endTime: 2000,
        summary: ["First"],
        themes: [],
        representativeImageId: null,
      });
      createMetaSummary(db, {
        meetingId,
        startTime: 3000,
        endTime: 4000,
        summary: ["Latest"],
        themes: ["Latest theme"],
        representativeImageId: "latest-image",
      });
      createMetaSummary(db, {
        meetingId,
        startTime: 2000,
        endTime: 3000,
        summary: ["Middle"],
        themes: [],
        representativeImageId: null,
      });

      const metaSummary = findLatestMetaSummaryByMeetingId(db, meetingId);

      expect(metaSummary).not.toBeNull();
      expect(metaSummary?.summary).toEqual(["Latest"]);
      expect(metaSummary?.endTime).toBe(4000);
    });
  });

  describe("cascade delete", () => {
    test("deletes meta-summaries when meeting is deleted", () => {
      const db = getDatabase(testDbPath);
      createMetaSummary(db, {
        meetingId,
        startTime: 1000,
        endTime: 2000,
        summary: ["Test"],
        themes: [],
        representativeImageId: null,
      });

      db.run("DELETE FROM meetings WHERE id = ?", [meetingId]);

      const metaSummaries = findMetaSummariesByMeetingId(db, meetingId);
      expect(metaSummaries).toHaveLength(0);
    });
  });
});
