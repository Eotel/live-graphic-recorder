/**
 * Transcript segment repository for database operations.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/session.ts, src/types/messages.ts
 */

import type { Database } from "bun:sqlite";

export interface PersistedTranscriptSegment {
  id: number;
  sessionId: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker: number | null;
  startTime: number | null;
  isUtteranceEnd: boolean;
}

interface TranscriptSegmentRow {
  id: number;
  session_id: string;
  text: string;
  timestamp: number;
  is_final: number;
  speaker: number | null;
  start_time: number | null;
  is_utterance_end: number | null;
}

function rowToSegment(row: TranscriptSegmentRow): PersistedTranscriptSegment {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    timestamp: row.timestamp,
    isFinal: row.is_final === 1,
    speaker: row.speaker,
    startTime: row.start_time,
    isUtteranceEnd: row.is_utterance_end === 1,
  };
}

export interface CreateTranscriptSegmentInput {
  sessionId: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker?: number;
  startTime?: number;
  isUtteranceEnd?: boolean;
}

export function createTranscriptSegment(
  db: Database,
  input: CreateTranscriptSegmentInput,
): PersistedTranscriptSegment {
  const result = db.run(
    `INSERT INTO transcript_segments
     (session_id, text, timestamp, is_final, speaker, start_time, is_utterance_end)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sessionId,
      input.text,
      input.timestamp,
      input.isFinal ? 1 : 0,
      input.speaker ?? null,
      input.startTime ?? null,
      input.isUtteranceEnd ? 1 : 0,
    ],
  );

  const row = db
    .query("SELECT * FROM transcript_segments WHERE id = ?")
    .get(result.lastInsertRowid) as TranscriptSegmentRow;
  return rowToSegment(row);
}

export function createTranscriptSegmentBatch(
  db: Database,
  inputs: CreateTranscriptSegmentInput[],
): PersistedTranscriptSegment[] {
  if (inputs.length === 0) {
    return [];
  }

  const stmt = db.prepare(
    `INSERT INTO transcript_segments
     (session_id, text, timestamp, is_final, speaker, start_time, is_utterance_end)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const ids: number[] = [];

  const transaction = db.transaction(() => {
    for (const input of inputs) {
      const result = stmt.run(
        input.sessionId,
        input.text,
        input.timestamp,
        input.isFinal ? 1 : 0,
        input.speaker ?? null,
        input.startTime ?? null,
        input.isUtteranceEnd ? 1 : 0,
      );
      ids.push(Number(result.lastInsertRowid));
    }
  });

  transaction();

  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .query(`SELECT * FROM transcript_segments WHERE id IN (${placeholders}) ORDER BY timestamp, id`)
    .all(...ids) as TranscriptSegmentRow[];

  return rows.map(rowToSegment);
}

export function findTranscriptSegmentsBySessionId(
  db: Database,
  sessionId: string,
): PersistedTranscriptSegment[] {
  const rows = db
    .query("SELECT * FROM transcript_segments WHERE session_id = ? ORDER BY timestamp, id")
    .all(sessionId) as TranscriptSegmentRow[];
  return rows.map(rowToSegment);
}

export function markLastSegmentAsUtteranceEnd(db: Database, sessionId: string): boolean {
  const result = db.run(
    `UPDATE transcript_segments
     SET is_utterance_end = 1
     WHERE id = (
       SELECT id FROM transcript_segments
       WHERE session_id = ?
       AND is_final = 1
       ORDER BY timestamp DESC, id DESC
       LIMIT 1
     )`,
    [sessionId],
  );
  return result.changes > 0;
}
