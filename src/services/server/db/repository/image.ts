/**
 * Generated image repository for database operations.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/session.ts
 */

import type { Database } from "bun:sqlite";

export interface PersistedGeneratedImage {
  id: number;
  sessionId: string;
  filePath: string;
  prompt: string;
  timestamp: number;
}

interface GeneratedImageRow {
  id: number;
  session_id: string;
  file_path: string;
  prompt: string;
  timestamp: number;
}

function rowToImage(row: GeneratedImageRow): PersistedGeneratedImage {
  return {
    id: row.id,
    sessionId: row.session_id,
    filePath: row.file_path,
    prompt: row.prompt,
    timestamp: row.timestamp,
  };
}

export interface CreateGeneratedImageInput {
  sessionId: string;
  filePath: string;
  prompt: string;
  timestamp: number;
}

export function createGeneratedImage(
  db: Database,
  input: CreateGeneratedImageInput,
): PersistedGeneratedImage {
  const result = db.run(
    `INSERT INTO generated_images (session_id, file_path, prompt, timestamp)
     VALUES (?, ?, ?, ?)`,
    [input.sessionId, input.filePath, input.prompt, input.timestamp],
  );

  const row = db
    .query("SELECT * FROM generated_images WHERE id = ?")
    .get(result.lastInsertRowid) as GeneratedImageRow;
  return rowToImage(row);
}

export function findGeneratedImagesBySessionId(
  db: Database,
  sessionId: string,
): PersistedGeneratedImage[] {
  const rows = db
    .query("SELECT * FROM generated_images WHERE session_id = ? ORDER BY timestamp")
    .all(sessionId) as GeneratedImageRow[];
  return rows.map(rowToImage);
}

export function findLatestGeneratedImageBySessionId(
  db: Database,
  sessionId: string,
): PersistedGeneratedImage | null {
  const row = db
    .query("SELECT * FROM generated_images WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1")
    .get(sessionId) as GeneratedImageRow | null;
  return row ? rowToImage(row) : null;
}

export function findGeneratedImageById(
  db: Database,
  imageId: number,
): PersistedGeneratedImage | null {
  const row = db
    .query("SELECT * FROM generated_images WHERE id = ?")
    .get(imageId) as GeneratedImageRow | null;
  return row ? rowToImage(row) : null;
}

/**
 * Find an image by ID and verify it belongs to the specified meeting.
 */
export function findGeneratedImageByIdAndMeetingId(
  db: Database,
  imageId: number,
  meetingId: string,
): PersistedGeneratedImage | null {
  const row = db
    .query(
      `SELECT gi.* FROM generated_images gi
       JOIN sessions s ON gi.session_id = s.id
       WHERE gi.id = ? AND s.meeting_id = ?`,
    )
    .get(imageId, meetingId) as GeneratedImageRow | null;
  return row ? rowToImage(row) : null;
}
