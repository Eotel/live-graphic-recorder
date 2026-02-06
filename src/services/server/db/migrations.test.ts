/**
 * Database migrations tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/migrations.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getDatabase, closeDatabase } from "./database";
import { runMigrations, getSchemaVersion, CURRENT_SCHEMA_VERSION } from "./migrations";

describe("migrations", () => {
  const testDbPath = ":memory:";

  beforeEach(() => {
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("runMigrations", () => {
    test("creates all required tables", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const tables = db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("meetings");
      expect(tableNames).toContain("sessions");
      expect(tableNames).toContain("transcript_segments");
      expect(tableNames).toContain("analyses");
      expect(tableNames).toContain("generated_images");
      expect(tableNames).toContain("camera_captures");
      expect(tableNames).toContain("meta_summaries");
      expect(tableNames).toContain("audio_recordings");
      expect(tableNames).toContain("users");
      expect(tableNames).toContain("auth_refresh_tokens");
      expect(tableNames).toContain("meeting_speaker_aliases");
      expect(tableNames).toContain("schema_version");
    });

    test("creates meetings table with correct columns", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const columns = db.query("PRAGMA table_info(meetings)").all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));
      expect(columnMap.get("id")!.type).toBe("TEXT");
      expect(columnMap.get("id")!.pk).toBe(1);
      expect(columnMap.get("title")!.type).toBe("TEXT");
      expect(columnMap.get("started_at")!.notnull).toBe(1);
      expect(columnMap.get("ended_at")).toBeDefined();
      expect(columnMap.get("created_at")!.notnull).toBe(1);
      expect(columnMap.get("owner_user_id")).toBeDefined();
    });

    test("creates sessions table with foreign key to meetings", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const fks = db.query("PRAGMA foreign_key_list(sessions)").all() as {
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }[];

      expect(fks).toHaveLength(1);
      expect(fks[0]!.table).toBe("meetings");
      expect(fks[0]!.from).toBe("meeting_id");
      expect(fks[0]!.to).toBe("id");
      expect(fks[0]!.on_delete).toBe("CASCADE");
    });

    test("creates transcript_segments table with foreign key to sessions", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const fks = db.query("PRAGMA foreign_key_list(transcript_segments)").all() as {
        table: string;
        from: string;
        on_delete: string;
      }[];

      expect(fks).toHaveLength(1);
      expect(fks[0]!.table).toBe("sessions");
      expect(fks[0]!.from).toBe("session_id");
      expect(fks[0]!.on_delete).toBe("CASCADE");
    });

    test("creates analyses table with correct structure", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const columns = db.query("PRAGMA table_info(analyses)").all() as {
        name: string;
        type: string;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));
      expect(columnMap.get("summary_json")!.type).toBe("TEXT");
      expect(columnMap.get("topics_json")!.type).toBe("TEXT");
      expect(columnMap.get("tags_json")!.type).toBe("TEXT");
      expect(columnMap.get("flow")!.type).toBe("INTEGER");
      expect(columnMap.get("heat")!.type).toBe("INTEGER");
      expect(columnMap.get("image_prompt")!.type).toBe("TEXT");
    });

    test("creates generated_images table for file references", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const columns = db.query("PRAGMA table_info(generated_images)").all() as {
        name: string;
        type: string;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));
      expect(columnMap.get("file_path")!.type).toBe("TEXT");
      expect(columnMap.get("prompt")!.type).toBe("TEXT");
      expect(columnMap.get("timestamp")!.type).toBe("INTEGER");
    });

    test("creates camera_captures table for file references", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const columns = db.query("PRAGMA table_info(camera_captures)").all() as {
        name: string;
        type: string;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));
      expect(columnMap.get("file_path")!.type).toBe("TEXT");
      expect(columnMap.get("timestamp")!.type).toBe("INTEGER");
    });

    test("creates meta_summaries table with correct structure", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const columns = db.query("PRAGMA table_info(meta_summaries)").all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));
      expect(columnMap.get("id")!.type).toBe("TEXT");
      expect(columnMap.get("id")!.pk).toBe(1);
      expect(columnMap.get("meeting_id")!.type).toBe("TEXT");
      expect(columnMap.get("meeting_id")!.notnull).toBe(1);
      expect(columnMap.get("start_time")!.type).toBe("INTEGER");
      expect(columnMap.get("start_time")!.notnull).toBe(1);
      expect(columnMap.get("end_time")!.type).toBe("INTEGER");
      expect(columnMap.get("end_time")!.notnull).toBe(1);
      expect(columnMap.get("summary_json")!.type).toBe("TEXT");
      expect(columnMap.get("summary_json")!.notnull).toBe(1);
      expect(columnMap.get("themes_json")!.type).toBe("TEXT");
      expect(columnMap.get("themes_json")!.notnull).toBe(1);
      expect(columnMap.get("representative_image_id")).toBeDefined();
      expect(columnMap.get("created_at")!.type).toBe("INTEGER");
      expect(columnMap.get("created_at")!.notnull).toBe(1);
    });

    test("creates meta_summaries table with foreign key to meetings", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const fks = db.query("PRAGMA foreign_key_list(meta_summaries)").all() as {
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }[];

      expect(fks).toHaveLength(1);
      expect(fks[0]!.table).toBe("meetings");
      expect(fks[0]!.from).toBe("meeting_id");
      expect(fks[0]!.to).toBe("id");
      expect(fks[0]!.on_delete).toBe("CASCADE");
    });

    test("creates users table with correct columns", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const columns = db.query("PRAGMA table_info(users)").all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));
      expect(columnMap.get("id")!.type).toBe("TEXT");
      expect(columnMap.get("id")!.pk).toBe(1);
      expect(columnMap.get("email")!.type).toBe("TEXT");
      expect(columnMap.get("email")!.notnull).toBe(1);
      expect(columnMap.get("password_hash")!.type).toBe("TEXT");
      expect(columnMap.get("password_hash")!.notnull).toBe(1);
      expect(columnMap.get("created_at")!.type).toBe("INTEGER");
      expect(columnMap.get("created_at")!.notnull).toBe(1);
    });

    test("creates auth_refresh_tokens table with user foreign key", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const columns = db.query("PRAGMA table_info(auth_refresh_tokens)").all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));
      expect(columnMap.get("id")!.type).toBe("TEXT");
      expect(columnMap.get("id")!.pk).toBe(1);
      expect(columnMap.get("user_id")!.type).toBe("TEXT");
      expect(columnMap.get("user_id")!.notnull).toBe(1);
      expect(columnMap.get("token_hash")!.type).toBe("TEXT");
      expect(columnMap.get("token_hash")!.notnull).toBe(1);
      expect(columnMap.get("expires_at")!.type).toBe("INTEGER");
      expect(columnMap.get("expires_at")!.notnull).toBe(1);
      expect(columnMap.get("revoked_at")).toBeDefined();

      const fks = db.query("PRAGMA foreign_key_list(auth_refresh_tokens)").all() as {
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }[];
      expect(fks).toHaveLength(1);
      expect(fks[0]!.table).toBe("users");
      expect(fks[0]!.from).toBe("user_id");
      expect(fks[0]!.to).toBe("id");
      expect(fks[0]!.on_delete).toBe("CASCADE");
    });

    test("creates meeting_speaker_aliases table with correct columns", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const columns = db.query("PRAGMA table_info(meeting_speaker_aliases)").all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));
      expect(columnMap.get("meeting_id")!.type).toBe("TEXT");
      expect(columnMap.get("meeting_id")!.notnull).toBe(1);
      expect(columnMap.get("meeting_id")!.pk).toBe(1);
      expect(columnMap.get("speaker")!.type).toBe("INTEGER");
      expect(columnMap.get("speaker")!.notnull).toBe(1);
      expect(columnMap.get("speaker")!.pk).toBe(2);
      expect(columnMap.get("display_name")!.type).toBe("TEXT");
      expect(columnMap.get("display_name")!.notnull).toBe(1);
      expect(columnMap.get("updated_at")!.type).toBe("INTEGER");
      expect(columnMap.get("updated_at")!.notnull).toBe(1);
    });

    test("creates meeting_speaker_aliases table with foreign key to meetings", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);

      const fks = db.query("PRAGMA foreign_key_list(meeting_speaker_aliases)").all() as {
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }[];

      expect(fks).toHaveLength(1);
      expect(fks[0]!.table).toBe("meetings");
      expect(fks[0]!.from).toBe("meeting_id");
      expect(fks[0]!.to).toBe("id");
      expect(fks[0]!.on_delete).toBe("CASCADE");
    });

    test("is idempotent - can be run multiple times", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);
      runMigrations(db); // Should not throw

      const version = getSchemaVersion(db);
      expect(version).toBe(CURRENT_SCHEMA_VERSION);
    });
  });

  describe("getSchemaVersion", () => {
    test("returns 0 for fresh database", () => {
      const db = getDatabase(testDbPath);
      const version = getSchemaVersion(db);
      expect(version).toBe(0);
    });

    test("returns current version after migrations", () => {
      const db = getDatabase(testDbPath);
      runMigrations(db);
      const version = getSchemaVersion(db);
      expect(version).toBe(CURRENT_SCHEMA_VERSION);
    });
  });
});
