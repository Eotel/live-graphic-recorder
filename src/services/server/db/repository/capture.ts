/**
 * Camera capture repository for database operations.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/session.ts
 */

import type { Database } from "bun:sqlite";

export interface PersistedCameraCapture {
  id: number;
  sessionId: string;
  filePath: string;
  timestamp: number;
}

interface CameraCaptureRow {
  id: number;
  session_id: string;
  file_path: string;
  timestamp: number;
}

function rowToCapture(row: CameraCaptureRow): PersistedCameraCapture {
  return {
    id: row.id,
    sessionId: row.session_id,
    filePath: row.file_path,
    timestamp: row.timestamp,
  };
}

export interface CreateCameraCaptureInput {
  sessionId: string;
  filePath: string;
  timestamp: number;
}

export function createCameraCapture(
  db: Database,
  input: CreateCameraCaptureInput,
): PersistedCameraCapture {
  const result = db.run(
    `INSERT INTO camera_captures (session_id, file_path, timestamp) VALUES (?, ?, ?)`,
    [input.sessionId, input.filePath, input.timestamp],
  );

  const row = db
    .query("SELECT * FROM camera_captures WHERE id = ?")
    .get(result.lastInsertRowid) as CameraCaptureRow;
  return rowToCapture(row);
}

export function findCameraCapturesBySessionId(
  db: Database,
  sessionId: string,
): PersistedCameraCapture[] {
  const rows = db
    .query("SELECT * FROM camera_captures WHERE session_id = ? ORDER BY timestamp")
    .all(sessionId) as CameraCaptureRow[];
  return rows.map(rowToCapture);
}

export function findCameraCaptureById(
  db: Database,
  captureId: number,
): PersistedCameraCapture | null {
  const row = db
    .query("SELECT * FROM camera_captures WHERE id = ?")
    .get(captureId) as CameraCaptureRow | null;
  return row ? rowToCapture(row) : null;
}

/**
 * Find a capture by ID and verify it belongs to the specified meeting.
 */
export function findCameraCapturByIdAndMeetingId(
  db: Database,
  captureId: number,
  meetingId: string,
): PersistedCameraCapture | null {
  const row = db
    .query(
      `SELECT cc.* FROM camera_captures cc
       JOIN sessions s ON cc.session_id = s.id
       WHERE cc.id = ? AND s.meeting_id = ?`,
    )
    .get(captureId, meetingId) as CameraCaptureRow | null;
  return row ? rowToCapture(row) : null;
}
