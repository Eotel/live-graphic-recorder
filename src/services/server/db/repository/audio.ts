/**
 * Audio recording repository for database operations.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/services/server/db/repository/session.ts
 */

import type { Database } from "bun:sqlite";

export interface PersistedAudioRecording {
  id: number;
  sessionId: string;
  meetingId: string;
  filePath: string;
  fileSizeBytes: number;
  createdAt: number;
}

interface AudioRecordingRow {
  id: number;
  session_id: string;
  meeting_id: string;
  file_path: string;
  file_size_bytes: number;
  created_at: number;
}

function rowToAudioRecording(row: AudioRecordingRow): PersistedAudioRecording {
  return {
    id: row.id,
    sessionId: row.session_id,
    meetingId: row.meeting_id,
    filePath: row.file_path,
    fileSizeBytes: row.file_size_bytes,
    createdAt: row.created_at,
  };
}

export interface CreateAudioRecordingInput {
  sessionId: string;
  meetingId: string;
  filePath: string;
  fileSizeBytes: number;
}

export function createAudioRecording(
  db: Database,
  input: CreateAudioRecordingInput,
): PersistedAudioRecording {
  const result = db.run(
    `INSERT INTO audio_recordings (session_id, meeting_id, file_path, file_size_bytes)
     VALUES (?, ?, ?, ?)`,
    [input.sessionId, input.meetingId, input.filePath, input.fileSizeBytes],
  );

  const row = db
    .query("SELECT * FROM audio_recordings WHERE id = ?")
    .get(result.lastInsertRowid) as AudioRecordingRow;
  return rowToAudioRecording(row);
}

export function findAudioRecordingByIdAndMeetingId(
  db: Database,
  audioId: number,
  meetingId: string,
): PersistedAudioRecording | null {
  const row = db
    .query("SELECT * FROM audio_recordings WHERE id = ? AND meeting_id = ?")
    .get(audioId, meetingId) as AudioRecordingRow | null;
  return row ? rowToAudioRecording(row) : null;
}

export function findAudioRecordingsBySessionId(
  db: Database,
  sessionId: string,
): PersistedAudioRecording[] {
  const rows = db
    .query("SELECT * FROM audio_recordings WHERE session_id = ? ORDER BY created_at")
    .all(sessionId) as AudioRecordingRow[];
  return rows.map(rowToAudioRecording);
}

export function findAudioRecordingsByMeetingId(
  db: Database,
  meetingId: string,
): PersistedAudioRecording[] {
  const rows = db
    .query("SELECT * FROM audio_recordings WHERE meeting_id = ? ORDER BY created_at DESC, id DESC")
    .all(meetingId) as AudioRecordingRow[];
  return rows.map(rowToAudioRecording);
}
