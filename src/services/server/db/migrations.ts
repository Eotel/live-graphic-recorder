/**
 * Database schema migrations.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/database.ts
 */

import type { Database } from "bun:sqlite";

export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Get the current schema version from the database.
 * Returns 0 if no schema_version table exists.
 */
export function getSchemaVersion(db: Database): number {
  try {
    const result = db
      .query("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
      .get() as { version: number } | null;
    return result?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Run all pending migrations.
 */
export function runMigrations(db: Database): void {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion < 1) {
    migrateToV1(db);
  }

  if (currentVersion < 2) {
    migrateToV2(db);
  }

  // Future migrations would go here:
  // if (currentVersion < 3) migrateToV3(db);
}

/**
 * Migration to schema version 1.
 * Creates all initial tables.
 */
function migrateToV1(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      started_at INTEGER,
      ended_at INTEGER,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transcript_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 0,
      speaker INTEGER,
      start_time REAL,
      is_utterance_end INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      topics_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      flow INTEGER NOT NULL,
      heat INTEGER NOT NULL,
      image_prompt TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS generated_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      prompt TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS camera_captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for common queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_meeting_id ON sessions(meeting_id)`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_transcript_segments_session_id ON transcript_segments(session_id)`,
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_analyses_session_id ON analyses(session_id)`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_generated_images_session_id ON generated_images(session_id)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_camera_captures_session_id ON camera_captures(session_id)`,
  );

  // Record the migration
  db.run("INSERT INTO schema_version (version) VALUES (1)");
}

/**
 * Migration to schema version 2.
 * Adds meta_summaries table for hierarchical context management.
 */
function migrateToV2(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS meta_summaries (
      id TEXT PRIMARY KEY,
      meeting_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      summary_json TEXT NOT NULL,
      themes_json TEXT NOT NULL,
      representative_image_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
    )
  `);

  // Create index for meeting lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_meta_summaries_meeting_id ON meta_summaries(meeting_id)`);

  // Record the migration
  db.run("INSERT INTO schema_version (version) VALUES (2)");
}
