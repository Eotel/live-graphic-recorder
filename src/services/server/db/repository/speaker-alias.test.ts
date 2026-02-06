/**
 * Speaker alias repository tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createMeeting } from "./meeting";
import {
  upsertSpeakerAlias,
  deleteSpeakerAlias,
  findSpeakerAliasByMeetingIdAndSpeaker,
  findSpeakerAliasesByMeetingId,
} from "./speaker-alias";

describe("SpeakerAliasRepository", () => {
  const testDbPath = ":memory:";
  let meetingId: string;

  beforeEach(() => {
    closeDatabase();
    const db = getDatabase(testDbPath);
    runMigrations(db);
    meetingId = createMeeting(db, {}).id;
  });

  afterEach(() => {
    closeDatabase();
  });

  test("upserts and loads speaker alias", () => {
    const db = getDatabase(testDbPath);

    const created = upsertSpeakerAlias(db, {
      meetingId,
      speaker: 0,
      displayName: "田中",
    });
    expect(created.meetingId).toBe(meetingId);
    expect(created.speaker).toBe(0);
    expect(created.displayName).toBe("田中");

    const found = findSpeakerAliasByMeetingIdAndSpeaker(db, meetingId, 0);
    expect(found).not.toBeNull();
    expect(found?.displayName).toBe("田中");
  });

  test("upsert updates existing alias", () => {
    const db = getDatabase(testDbPath);

    const first = upsertSpeakerAlias(db, {
      meetingId,
      speaker: 1,
      displayName: "佐藤",
    });

    const updated = upsertSpeakerAlias(db, {
      meetingId,
      speaker: 1,
      displayName: "鈴木",
    });

    expect(updated.displayName).toBe("鈴木");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);

    const aliases = findSpeakerAliasesByMeetingId(db, meetingId);
    expect(aliases).toHaveLength(1);
    expect(aliases[0]!.displayName).toBe("鈴木");
  });

  test("findSpeakerAliasesByMeetingId returns aliases ordered by speaker", () => {
    const db = getDatabase(testDbPath);

    upsertSpeakerAlias(db, { meetingId, speaker: 2, displayName: "C" });
    upsertSpeakerAlias(db, { meetingId, speaker: 0, displayName: "A" });
    upsertSpeakerAlias(db, { meetingId, speaker: 1, displayName: "B" });

    const aliases = findSpeakerAliasesByMeetingId(db, meetingId);
    expect(aliases.map((a) => a.speaker)).toEqual([0, 1, 2]);
    expect(aliases.map((a) => a.displayName)).toEqual(["A", "B", "C"]);
  });

  test("deleteSpeakerAlias removes alias", () => {
    const db = getDatabase(testDbPath);

    upsertSpeakerAlias(db, {
      meetingId,
      speaker: 3,
      displayName: "削除対象",
    });

    const deleted = deleteSpeakerAlias(db, meetingId, 3);
    expect(deleted).toBe(true);

    const found = findSpeakerAliasByMeetingIdAndSpeaker(db, meetingId, 3);
    expect(found).toBeNull();
  });

  test("cascade delete removes aliases when meeting is deleted", () => {
    const db = getDatabase(testDbPath);

    upsertSpeakerAlias(db, {
      meetingId,
      speaker: 0,
      displayName: "田中",
    });
    db.run("DELETE FROM meetings WHERE id = ?", [meetingId]);

    const aliases = findSpeakerAliasesByMeetingId(db, meetingId);
    expect(aliases).toHaveLength(0);
  });
});
