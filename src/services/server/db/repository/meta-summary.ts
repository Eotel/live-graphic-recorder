/**
 * Meta-summary repository for database operations.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/meeting.ts, src/services/server/persistence.ts
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

export interface PersistedMetaSummary {
  id: string;
  meetingId: string;
  startTime: number;
  endTime: number;
  summary: string[];
  themes: string[];
  representativeImageId: string | null;
  createdAt: number;
}

interface MetaSummaryRow {
  id: string;
  meeting_id: string;
  start_time: number;
  end_time: number;
  summary_json: string;
  themes_json: string;
  representative_image_id: string | null;
  created_at: number;
}

function rowToMetaSummary(row: MetaSummaryRow): PersistedMetaSummary {
  try {
    return {
      id: row.id,
      meetingId: row.meeting_id,
      startTime: row.start_time,
      endTime: row.end_time,
      summary: JSON.parse(row.summary_json) as string[],
      themes: JSON.parse(row.themes_json) as string[],
      representativeImageId: row.representative_image_id,
      createdAt: row.created_at,
    };
  } catch (error) {
    console.error(
      `[MetaSummaryRepository] Failed to parse JSON for meta-summary ${row.id}:`,
      error,
    );
    throw new Error(`Corrupted meta-summary data for ID ${row.id}`);
  }
}

export interface CreateMetaSummaryInput {
  meetingId: string;
  startTime: number;
  endTime: number;
  summary: string[];
  themes: string[];
  representativeImageId: string | null;
}

export function createMetaSummary(
  db: Database,
  input: CreateMetaSummaryInput,
): PersistedMetaSummary {
  const id = randomUUID();
  const createdAt = Date.now();

  db.run(
    `INSERT INTO meta_summaries
     (id, meeting_id, start_time, end_time, summary_json, themes_json, representative_image_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.meetingId,
      input.startTime,
      input.endTime,
      JSON.stringify(input.summary),
      JSON.stringify(input.themes),
      input.representativeImageId,
      createdAt,
    ],
  );

  const row = db.query("SELECT * FROM meta_summaries WHERE id = ?").get(id) as MetaSummaryRow;
  return rowToMetaSummary(row);
}

export function findMetaSummariesByMeetingId(
  db: Database,
  meetingId: string,
): PersistedMetaSummary[] {
  const rows = db
    .query("SELECT * FROM meta_summaries WHERE meeting_id = ? ORDER BY start_time")
    .all(meetingId) as MetaSummaryRow[];
  return rows.map(rowToMetaSummary);
}

export function findLatestMetaSummaryByMeetingId(
  db: Database,
  meetingId: string,
): PersistedMetaSummary | null {
  const row = db
    .query("SELECT * FROM meta_summaries WHERE meeting_id = ? ORDER BY end_time DESC LIMIT 1")
    .get(meetingId) as MetaSummaryRow | null;
  return row ? rowToMetaSummary(row) : null;
}
