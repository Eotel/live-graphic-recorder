/**
 * Session repository for database operations.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/meeting.ts
 */

import type { Database } from "bun:sqlite";
import type { SessionStatus } from "@/types/messages";

export interface PersistedSession {
  id: string;
  meetingId: string;
  status: SessionStatus;
  startedAt: number | null;
  endedAt: number | null;
}

interface SessionRow {
  id: string;
  meeting_id: string;
  status: SessionStatus;
  started_at: number | null;
  ended_at: number | null;
}

function rowToSession(row: SessionRow): PersistedSession {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

export interface CreateSessionInput {
  meetingId: string;
  id?: string;
}

export function createSession(db: Database, input: CreateSessionInput): PersistedSession {
  const id = input.id ?? generateId();

  db.run(
    `INSERT INTO sessions (id, meeting_id, status) VALUES (?, ?, 'idle')
     ON CONFLICT(id) DO UPDATE SET meeting_id = excluded.meeting_id, status = 'idle', started_at = NULL, ended_at = NULL`,
    [id, input.meetingId],
  );

  const row = db.query("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow;
  return rowToSession(row);
}

export function findSessionById(db: Database, id: string): PersistedSession | null {
  const row = db.query("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | null;
  return row ? rowToSession(row) : null;
}

export function findSessionsByMeetingId(db: Database, meetingId: string): PersistedSession[] {
  const rows = db
    .query("SELECT * FROM sessions WHERE meeting_id = ? ORDER BY started_at DESC")
    .all(meetingId) as SessionRow[];
  return rows.map(rowToSession);
}

export interface UpdateSessionInput {
  status?: SessionStatus;
  startedAt?: number;
  endedAt?: number;
}

export function updateSession(
  db: Database,
  id: string,
  input: UpdateSessionInput,
): PersistedSession | null {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.status !== undefined) {
    updates.push("status = ?");
    values.push(input.status);
  }
  if (input.startedAt !== undefined) {
    updates.push("started_at = ?");
    values.push(input.startedAt);
  }
  if (input.endedAt !== undefined) {
    updates.push("ended_at = ?");
    values.push(input.endedAt);
  }

  if (updates.length === 0) {
    return findSessionById(db, id);
  }

  values.push(id);
  db.run(`UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`, values);

  return findSessionById(db, id);
}
