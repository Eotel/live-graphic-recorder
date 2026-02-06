/**
 * Meeting repository for database operations.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/database.ts, src/services/server/db/migrations.ts
 */

import type { Database } from "bun:sqlite";

export interface Meeting {
  id: string;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  ownerUserId: string | null;
}

interface MeetingRow {
  id: string;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  created_at: number;
  owner_user_id: string | null;
}

function rowToMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    ownerUserId: row.owner_user_id,
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

export interface CreateMeetingInput {
  id?: string;
  title?: string;
  ownerUserId?: string | null;
}

export function createMeeting(db: Database, input: CreateMeetingInput): Meeting {
  const id = input.id ?? generateId();
  const now = Date.now();

  db.run(
    `INSERT INTO meetings (id, title, started_at, created_at, owner_user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.title ?? null, now, now, input.ownerUserId ?? null],
  );

  const row = db.query("SELECT * FROM meetings WHERE id = ?").get(id) as MeetingRow;
  return rowToMeeting(row);
}

export function findMeetingById(db: Database, id: string): Meeting | null {
  const row = db.query("SELECT * FROM meetings WHERE id = ?").get(id) as MeetingRow | null;
  return row ? rowToMeeting(row) : null;
}

export function findMeetingByIdAndOwner(
  db: Database,
  id: string,
  ownerUserId: string,
): Meeting | null {
  const row = db
    .query("SELECT * FROM meetings WHERE id = ? AND owner_user_id = ?")
    .get(id, ownerUserId) as MeetingRow | null;
  return row ? rowToMeeting(row) : null;
}

export function findAllMeetings(db: Database, limit?: number): Meeting[] {
  const query = limit
    ? "SELECT * FROM meetings ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM meetings ORDER BY created_at DESC";

  const rows = (limit ? db.query(query).all(limit) : db.query(query).all()) as MeetingRow[];
  return rows.map(rowToMeeting);
}

export function findAllMeetingsByOwner(
  db: Database,
  ownerUserId: string,
  limit?: number,
): Meeting[] {
  const query = limit
    ? "SELECT * FROM meetings WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM meetings WHERE owner_user_id = ? ORDER BY created_at DESC";

  const rows = (
    limit ? db.query(query).all(ownerUserId, limit) : db.query(query).all(ownerUserId)
  ) as MeetingRow[];
  return rows.map(rowToMeeting);
}

export interface UpdateMeetingInput {
  title?: string;
  endedAt?: number;
}

export function updateMeeting(db: Database, id: string, input: UpdateMeetingInput): Meeting | null {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.title !== undefined) {
    updates.push("title = ?");
    values.push(input.title);
  }
  if (input.endedAt !== undefined) {
    updates.push("ended_at = ?");
    values.push(input.endedAt);
  }

  if (updates.length === 0) {
    return findMeetingById(db, id);
  }

  values.push(id);
  db.run(`UPDATE meetings SET ${updates.join(", ")} WHERE id = ?`, values);

  return findMeetingById(db, id);
}

export function deleteMeeting(db: Database, id: string): boolean {
  const result = db.run("DELETE FROM meetings WHERE id = ?", [id]);
  return result.changes > 0;
}

export function assignUnownedMeetingsToOwner(db: Database, ownerUserId: string): number {
  const result = db.run(
    "UPDATE meetings SET owner_user_id = ? WHERE owner_user_id IS NULL OR owner_user_id = ''",
    [ownerUserId],
  );
  return result.changes;
}
