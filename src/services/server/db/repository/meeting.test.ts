/**
 * Meeting repository tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/meeting.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import {
  createMeeting,
  findMeetingById,
  findMeetingByIdAndOwner,
  findAllMeetings,
  findAllMeetingsByOwner,
  updateMeeting,
  deleteMeeting,
  assignUnownedMeetingsToOwner,
} from "./meeting";

describe("MeetingRepository", () => {
  const testDbPath = ":memory:";

  beforeEach(() => {
    closeDatabase();
    const db = getDatabase(testDbPath);
    runMigrations(db);
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("createMeeting", () => {
    test("creates a meeting with generated id", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, {});

      expect(meeting.id).toBeDefined();
      expect(meeting.id.length).toBeGreaterThan(0);
      expect(meeting.startedAt).toBeGreaterThan(0);
      expect(meeting.endedAt).toBeNull();
      expect(meeting.createdAt).toBeGreaterThan(0);
      expect(meeting.ownerUserId).toBeNull();
    });

    test("creates a meeting with provided id", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, { id: "custom-id" });

      expect(meeting.id).toBe("custom-id");
    });

    test("creates a meeting with title", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, { title: "Project Discussion" });

      expect(meeting.title).toBe("Project Discussion");
    });

    test("creates a meeting with owner", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, {
        title: "Project Discussion",
        ownerUserId: "user-1",
      });

      expect(meeting.ownerUserId).toBe("user-1");
    });

    test("creates a meeting without title", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, {});

      expect(meeting.title).toBeNull();
    });
  });

  describe("findMeetingById", () => {
    test("returns meeting when found", () => {
      const db = getDatabase(testDbPath);
      const created = createMeeting(db, { title: "Test Meeting" });

      const found = findMeetingById(db, created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe("Test Meeting");
    });

    test("returns null when not found", () => {
      const db = getDatabase(testDbPath);

      const found = findMeetingById(db, "non-existent-id");

      expect(found).toBeNull();
    });
  });

  describe("findAllMeetings", () => {
    test("returns empty array when no meetings", () => {
      const db = getDatabase(testDbPath);

      const meetings = findAllMeetings(db);

      expect(meetings).toHaveLength(0);
    });

    test("returns all meetings", () => {
      const db = getDatabase(testDbPath);
      createMeeting(db, { title: "First" });
      createMeeting(db, { title: "Second" });
      createMeeting(db, { title: "Third" });

      const meetings = findAllMeetings(db);

      expect(meetings).toHaveLength(3);
      const titles = meetings.map((m) => m.title);
      expect(titles).toContain("First");
      expect(titles).toContain("Second");
      expect(titles).toContain("Third");
    });

    test("respects limit parameter", () => {
      const db = getDatabase(testDbPath);
      createMeeting(db, { title: "First" });
      createMeeting(db, { title: "Second" });
      createMeeting(db, { title: "Third" });

      const meetings = findAllMeetings(db, 2);

      expect(meetings).toHaveLength(2);
    });
  });

  describe("owner-scoped queries", () => {
    test("finds meeting by id and owner", () => {
      const db = getDatabase(testDbPath);
      const created = createMeeting(db, {
        title: "Owner Meeting",
        ownerUserId: "user-1",
      });

      const found = findMeetingByIdAndOwner(db, created.id, "user-1");
      const notFound = findMeetingByIdAndOwner(db, created.id, "user-2");

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(notFound).toBeNull();
    });

    test("lists meetings by owner", () => {
      const db = getDatabase(testDbPath);
      createMeeting(db, { title: "A", ownerUserId: "user-1" });
      createMeeting(db, { title: "B", ownerUserId: "user-1" });
      createMeeting(db, { title: "C", ownerUserId: "user-2" });

      const owned = findAllMeetingsByOwner(db, "user-1");

      expect(owned).toHaveLength(2);
      owned.forEach((meeting) => expect(meeting.ownerUserId).toBe("user-1"));
    });

    test("assigns unowned meetings to owner", () => {
      const db = getDatabase(testDbPath);
      createMeeting(db, { title: "Unowned 1" });
      createMeeting(db, { title: "Unowned 2" });
      createMeeting(db, { title: "Owned", ownerUserId: "user-2" });

      const changed = assignUnownedMeetingsToOwner(db, "user-1");
      const user1Meetings = findAllMeetingsByOwner(db, "user-1");
      const user2Meetings = findAllMeetingsByOwner(db, "user-2");

      expect(changed).toBe(2);
      expect(user1Meetings).toHaveLength(2);
      expect(user2Meetings).toHaveLength(1);
    });
  });

  describe("updateMeeting", () => {
    test("updates title", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, { title: "Original" });

      const updated = updateMeeting(db, meeting.id, { title: "Updated" });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe("Updated");
    });

    test("updates endedAt", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, {});
      const endTime = Date.now();

      const updated = updateMeeting(db, meeting.id, { endedAt: endTime });

      expect(updated).not.toBeNull();
      expect(updated?.endedAt).toBe(endTime);
    });

    test("returns null when meeting not found", () => {
      const db = getDatabase(testDbPath);

      const updated = updateMeeting(db, "non-existent", { title: "Test" });

      expect(updated).toBeNull();
    });
  });

  describe("deleteMeeting", () => {
    test("deletes existing meeting", () => {
      const db = getDatabase(testDbPath);
      const meeting = createMeeting(db, {});

      const result = deleteMeeting(db, meeting.id);

      expect(result).toBe(true);
      expect(findMeetingById(db, meeting.id)).toBeNull();
    });

    test("returns false when meeting not found", () => {
      const db = getDatabase(testDbPath);

      const result = deleteMeeting(db, "non-existent");

      expect(result).toBe(false);
    });
  });
});
