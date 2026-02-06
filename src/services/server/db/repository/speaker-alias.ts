/**
 * Speaker alias repository for per-meeting speaker label overrides.
 */

import type { Database } from "bun:sqlite";

export interface PersistedSpeakerAlias {
  meetingId: string;
  speaker: number;
  displayName: string;
  updatedAt: number;
}

interface SpeakerAliasRow {
  meeting_id: string;
  speaker: number;
  display_name: string;
  updated_at: number;
}

function rowToAlias(row: SpeakerAliasRow): PersistedSpeakerAlias {
  return {
    meetingId: row.meeting_id,
    speaker: row.speaker,
    displayName: row.display_name,
    updatedAt: row.updated_at,
  };
}

export interface UpsertSpeakerAliasInput {
  meetingId: string;
  speaker: number;
  displayName: string;
}

export function upsertSpeakerAlias(
  db: Database,
  input: UpsertSpeakerAliasInput,
): PersistedSpeakerAlias {
  const updatedAt = Date.now();
  db.run(
    `INSERT INTO meeting_speaker_aliases (meeting_id, speaker, display_name, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(meeting_id, speaker)
     DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
    [input.meetingId, input.speaker, input.displayName, updatedAt],
  );

  const row = db
    .query(
      `SELECT * FROM meeting_speaker_aliases
       WHERE meeting_id = ? AND speaker = ?`,
    )
    .get(input.meetingId, input.speaker) as SpeakerAliasRow;
  return rowToAlias(row);
}

export function deleteSpeakerAlias(db: Database, meetingId: string, speaker: number): boolean {
  const result = db.run(
    `DELETE FROM meeting_speaker_aliases
     WHERE meeting_id = ? AND speaker = ?`,
    [meetingId, speaker],
  );
  return result.changes > 0;
}

export function findSpeakerAliasByMeetingIdAndSpeaker(
  db: Database,
  meetingId: string,
  speaker: number,
): PersistedSpeakerAlias | null {
  const row = db
    .query(
      `SELECT * FROM meeting_speaker_aliases
       WHERE meeting_id = ? AND speaker = ?`,
    )
    .get(meetingId, speaker) as SpeakerAliasRow | null;
  return row ? rowToAlias(row) : null;
}

export function findSpeakerAliasesByMeetingId(
  db: Database,
  meetingId: string,
): PersistedSpeakerAlias[] {
  const rows = db
    .query(
      `SELECT * FROM meeting_speaker_aliases
       WHERE meeting_id = ?
       ORDER BY speaker ASC`,
    )
    .all(meetingId) as SpeakerAliasRow[];

  return rows.map(rowToAlias);
}
